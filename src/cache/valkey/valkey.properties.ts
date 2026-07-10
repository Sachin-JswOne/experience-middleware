export class ValkeyProperties {
  readonly cacheEnabled = process.env.CACHE_ENABLED === 'true';
  readonly cacheProvider = process.env.CACHE_PROVIDER || 'AUTO';
  readonly profile =
    process.env.CACHE_PROFILE ||
    process.env.VALKEY_PROFILE ||
    process.env.NODE_ENV ||
    'local';

  readonly ttlSeconds = Number(process.env.CACHE_TTL_SECONDS || 300);
  readonly ttlJitterSeconds = Number(process.env.CACHE_TTL_JITTER_SECONDS || 300);

  readonly clusterEnabled = process.env.VALKEY_CLUSTER_ENABLED === 'true';
  readonly clusterNodes = process.env.VALKEY_CLUSTER_NODES || '';
  readonly host = process.env.VALKEY_HOST || '';
  readonly port = Number(process.env.VALKEY_PORT || 6379);
  readonly password = process.env.VALKEY_PASSWORD || undefined;
  readonly ssl = process.env.VALKEY_SSL === 'true';
  readonly timeoutMillis = Number(process.env.VALKEY_TIMEOUT_MILLIS || 1500);
  readonly failStartup = process.env.VALKEY_FAIL_STARTUP === 'true';

  readonly caCertPath = process.env.VALKEY_CA_CERT_PATH || '';
  readonly caCertSecret =
    process.env.VALKEY_CA_CERT_SECRET ||
    (this.profile === 'qa'
      ? 'VALKEY_CA_CERTIFICATE_QA'
      : this.profile === 'preprod'
        ? 'VALKEY_CA_CERTIFICATE_PREPROD'
        : this.profile === 'prod'
          ? 'VALKEY_CA_CERTIFICATE_PROD'
          : '');
  readonly gcpProjectId = process.env.GCP_PROJECT_ID || '';
  readonly gcpCredentialsEncodedKey = process.env.GCP_CREDENTIALS_ENCODED_KEY || '';
}