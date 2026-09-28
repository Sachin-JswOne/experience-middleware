import { Injectable, Logger } from '@nestjs/common';
import Redis, { Cluster } from 'ioredis';
import { ValkeyConfig } from './valkey.config';

@Injectable()
export class ValkeyClient {
  private readonly logger = new Logger(ValkeyClient.name);

  constructor(private readonly config: ValkeyConfig) {}

async execute<T>(
  operation: (client: Redis | Cluster) => Promise<T>,
): Promise<T | null> {
  const client = this.config.getClient();

  if (!client || !this.config.isAvailable()) {
    return null;
  }

  try {
    return await operation(client);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    this.config.markUnavailable();
    this.logger.warn(`Valkey read failed: ${message}`);

    return null;
  }
}

  async executeWrite(
    operation: (client: Redis | Cluster) => Promise<unknown>,
  ): Promise<boolean> {
    const client = this.config.getClient();

    if (!client || !this.config.isAvailable()) {
      return false;
    }

    try {
      await operation(client);
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.config.markUnavailable();
      this.logger.warn(`Valkey write failed: ${message}`);

      return false;
    }
  }
}