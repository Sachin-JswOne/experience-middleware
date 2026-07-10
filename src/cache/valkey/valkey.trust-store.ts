import { Injectable, Logger } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { X509Certificate } from 'crypto';
import * as fs from 'fs';
import { ValkeyProperties } from './valkey.properties';

export type ValkeyTlsOptions = {
  ca: string;
  rejectUnauthorized: true;
};

@Injectable()
export class ValkeyTrustStore {
  private readonly logger = new Logger(ValkeyTrustStore.name);

  constructor(private readonly props: ValkeyProperties) {}

  async getTlsOptions(): Promise<ValkeyTlsOptions | undefined> {
    if (!this.props.ssl) {
      return undefined;
    }

    const caPem =
      this.props.profile === 'local'
        ? this.loadLocalCertificate()
        : await this.loadCertificateFromSecretManager();

    this.validateCertificate(caPem);

    return {
      ca: caPem,
      rejectUnauthorized: true,
    };
  }

  private loadLocalCertificate(): string {
    if (!this.props.caCertPath) {
      throw new Error(
        'VALKEY_CA_CERT_PATH is required for local profile when VALKEY_SSL=true',
      );
    }

    if (!fs.existsSync(this.props.caCertPath)) {
      throw new Error(
        `Valkey CA certificate file not found: ${this.props.caCertPath}`,
      );
    }

    const pem = fs.readFileSync(this.props.caCertPath, 'utf8').trim();

    if (!pem) {
      throw new Error('Local Valkey CA certificate is empty');
    }

    this.logger.log(
      `Loaded Valkey CA certificate from local path=${this.props.caCertPath}`,
    );

    return pem;
  }

  private async loadCertificateFromSecretManager(): Promise<string> {
    if (!this.props.caCertSecret) {
      throw new Error(
        `VALKEY_CA_CERT_SECRET is required for profile=${this.props.profile}`,
      );
    }

    if (!this.props.gcpProjectId) {
      throw new Error(
        `GCP_PROJECT_ID is required for profile=${this.props.profile}`,
      );
    }

    const client = this.createSecretManagerClient();

    const secretVersionName =
      `projects/${this.props.gcpProjectId}` +
      `/secrets/${this.props.caCertSecret}` +
      `/versions/latest`;

    try {
      const [version] = await client.accessSecretVersion({
        name: secretVersionName,
      });

      const rawData = version.payload?.data;

      if (!rawData) {
        throw new Error('Secret payload is empty');
      }

      const pem = Buffer.isBuffer(rawData)
        ? rawData.toString('utf8').trim()
        : Buffer.from(rawData as Uint8Array).toString('utf8').trim();

      if (!pem) {
        throw new Error('Valkey CA certificate secret is empty');
      }

      this.logger.log(
        `Loaded Valkey CA certificate from Secret Manager ` +
          `project=${this.props.gcpProjectId} ` +
          `secret=${this.props.caCertSecret}`,
      );

      return pem;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        `Failed to fetch Valkey CA certificate from Secret Manager: ${message}`,
      );
    }
  }

  private createSecretManagerClient(): SecretManagerServiceClient {
    if (!this.props.gcpCredentialsEncodedKey) {
      // Uses Workload Identity / ADC in GCP.
      return new SecretManagerServiceClient({
        projectId: this.props.gcpProjectId,
      });
    }

    try {
      const decodedCredentials = Buffer.from(
        this.props.gcpCredentialsEncodedKey,
        'base64',
      ).toString('utf8');

      const credentials = JSON.parse(decodedCredentials) as {
        client_email: string;
        private_key: string;
        project_id?: string;
      };

      return new SecretManagerServiceClient({
        projectId:
          credentials.project_id || this.props.gcpProjectId,
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        `Invalid GCP_CREDENTIALS_ENCODED_KEY: ${message}`,
      );
    }
  }

  private validateCertificate(pem: string): void {
    let certificate: X509Certificate;

    try {
      certificate = new X509Certificate(pem);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      throw new Error(`Invalid Valkey CA certificate PEM: ${message}`);
    }

    const now = Date.now();
    const validFrom = new Date(certificate.validFrom).getTime();
    const validTo = new Date(certificate.validTo).getTime();

    if (
      Number.isNaN(validFrom) ||
      Number.isNaN(validTo)
    ) {
      throw new Error(
        'Valkey CA certificate contains invalid validity dates',
      );
    }

    if (now < validFrom) {
      throw new Error(
        `Valkey CA certificate is not yet valid. ` +
          `validFrom=${certificate.validFrom}`,
      );
    }

    if (now > validTo) {
      throw new Error(
        `Valkey CA certificate has expired. ` +
          `validTo=${certificate.validTo}`,
      );
    }

    this.logger.log(
      `Valkey CA certificate validated ` +
        `subject=${certificate.subject} ` +
        `validTo=${certificate.validTo}`,
    );
  }
}