import { Injectable, Logger } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { X509Certificate } from 'crypto';
import * as fs from 'fs';
import { ValkeyProperties } from './valkey.properties';

@Injectable()
export class ValkeyTrustStore {
  private readonly logger = new Logger(ValkeyTrustStore.name);

  constructor(private readonly props: ValkeyProperties) {}

  async getTlsOptions(): Promise<{ ca: string; rejectUnauthorized: true } | undefined> {
    if (!this.props.ssl) return undefined;

    const ca = this.props.profile === 'local'
      ? this.loadLocalPem()
      : await this.loadPemFromSecretManager();

    this.validateCertificate(ca);

    return {
      ca,
      rejectUnauthorized: true,
    };
  }

  private loadLocalPem(): string {
    if (!this.props.caCertPath) {
      throw new Error('VALKEY_CA_CERT_PATH is required for local Valkey TLS');
    }

    this.logger.log(`Loading Valkey CA PEM from local path=${this.props.caCertPath}`);
    return fs.readFileSync(this.props.caCertPath, 'utf8');
  }

  private async loadPemFromSecretManager(): Promise<string> {
    if (!this.props.caCertSecret || !this.props.gcpProjectId) {
      throw new Error('VALKEY_CA_CERT_SECRET and GCP_PROJECT_ID are required for deployed Valkey TLS');
    }

    const client = this.createSecretManagerClient();

    const name = `projects/${this.props.gcpProjectId}/secrets/${this.props.caCertSecret}/versions/latest`;

    this.logger.log(`Fetching Valkey CA PEM from Secret Manager secret=${this.props.caCertSecret}`);

    const [version] = await client.accessSecretVersion({ name });
    const pem = version.payload?.data?.toString();

    if (!pem) {
      throw new Error(`Empty Valkey CA PEM from Secret Manager secret=${this.props.caCertSecret}`);
    }

    return pem;
  }

  private createSecretManagerClient(): SecretManagerServiceClient {
    if (!this.props.gcpCredentialsEncodedKey) {
      return new SecretManagerServiceClient();
    }

    const json = Buffer.from(this.props.gcpCredentialsEncodedKey, 'base64').toString('utf8');
    const credentials = JSON.parse(json);

    return new SecretManagerServiceClient({
      credentials,
      projectId: credentials.project_id,
    });
  }

  private validateCertificate(pem: string): void {
    const cert = new X509Certificate(pem);
    const now = Date.now();

    const validFrom = new Date(cert.validFrom).getTime();
    const validTo = new Date(cert.validTo).getTime();

    if (now < validFrom || now > validTo) {
      throw new Error(
        `Valkey CA certificate is not valid. validFrom=${cert.validFrom} validTo=${cert.validTo}`,
      );
    }

    this.logger.log(`Valkey CA certificate valid. subject=${cert.subject}`);
  }
}