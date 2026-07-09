import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { Cluster } from 'ioredis';
import { ValkeyProperties } from './valkey.properties';
import { ValkeyTrustStore } from './valkey.trust-store';

@Injectable()
export class ValkeyConfig implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ValkeyConfig.name);
  private client?: Redis | Cluster;
  private available = false;

  constructor(
    private readonly props: ValkeyProperties,
    private readonly trustStore: ValkeyTrustStore,
  ) {}

  async onModuleInit() {
    if (!this.props.cacheEnabled) return;
    if (this.props.cacheProvider !== 'AUTO' && this.props.cacheProvider !== 'VALKEY') return;

    this.client = this.props.clusterEnabled
      ? await this.createClusterClient()
      : await this.createStandaloneClient();

    this.client.on('ready', () => {
      this.available = true;
      this.logger.log('Valkey ready');
    });

    this.client.on('error', (err) => {
      this.available = false;
      this.logger.warn(`Valkey error: ${err.message}`);
    });

    await this.runConnectivityCheck();
  }

  getClient(): Redis | Cluster | undefined {
    return this.client;
  }

  isAvailable(): boolean {
    return this.available;
  }

  markUnavailable(): void {
    this.available = false;
  }

  private async createClusterClient(): Promise<Cluster> {
    const nodes = this.props.clusterNodes
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((node) => {
        const [host, port] = node.split(':');
        return { host, port: Number(port || 6379) };
      });

    if (!nodes.length) {
      throw new Error('VALKEY_CLUSTER_NODES is required');
    }

    const tls = await this.trustStore.getTlsOptions();

    return new Redis.Cluster(nodes, {
      redisOptions: {
        password: this.props.password,
        tls,
        connectTimeout: this.props.timeoutMillis,
        commandTimeout: this.props.timeoutMillis,
        maxRetriesPerRequest: 1,
        offlineQueue: false,
      },
      slotsRefreshInterval: 30000,
      slotsRefreshTimeout: this.props.timeoutMillis,
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 300,
      retryDelayOnTryAgain: 100,
    });
  }

  private async createStandaloneClient(): Promise<Redis> {
    const tls = await this.trustStore.getTlsOptions();

    return new Redis({
      host: this.props.host,
      port: this.props.port,
      password: this.props.password,
      tls,
      connectTimeout: this.props.timeoutMillis,
      commandTimeout: this.props.timeoutMillis,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  private async runConnectivityCheck(): Promise<void> {
    if (!this.client) return;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await this.client.ping();
        this.available = response === 'PONG';
        this.logger.log(`Valkey connectivity check passed | response=${response}`);
        return;
      } catch (err: any) {
        this.available = false;
        this.logger.warn(`Valkey connectivity attempt ${attempt}/5 failed: ${err.message}`);
        await this.sleep(500 * Math.pow(2, attempt - 1));
      }
    }

    if (this.props.failStartup) {
      throw new Error('Valkey connectivity check failed');
    }

    this.logger.warn('Valkey unavailable. Continuing fail-open.');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }
}