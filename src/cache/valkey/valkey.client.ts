import { Injectable, Logger } from '@nestjs/common';
import { ValkeyConfig } from './valkey.config';

@Injectable()
export class ValkeyClient {
  private readonly logger = new Logger(ValkeyClient.name);

  constructor(private readonly config: ValkeyConfig) {}

  async execute<T>(operation: (client: any) => Promise<T>): Promise<T | null> {
    const client = this.config.getClient();

    if (!client || !this.config.isAvailable()) return null;

    try {
      return await operation(client);
    } catch (err: any) {
      this.config.markUnavailable();
      this.logger.warn(`Valkey read failed: ${err.message}`);
      return null;
    }
  }

  async executeWrite(operation: (client: any) => Promise<unknown>): Promise<boolean> {
    const client = this.config.getClient();

    if (!client || !this.config.isAvailable()) return false;

    try {
      await operation(client);
      return true;
    } catch (err: any) {
      this.config.markUnavailable();
      this.logger.warn(`Valkey write failed: ${err.message}`);
      return false;
    }
  }
}