import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { reloadRouteConfig } from '../config/route.config';

let watcher: fs.FSWatcher | null = null;

export function startConfigWatcher(): void {
  const configPath = path.resolve(__dirname, '../assets/route-config.json');
  if (watcher) return; // singleton

  const logger = new Logger('ConfigWatcher');
  logger.log(`Starting config watcher for: ${configPath}`);

  watcher = fs.watch(configPath, { persistent: true }, (eventType) => {
    if (eventType === 'change') {
      logger.log('route-config.json changed, reloading...');
      try {
        reloadRouteConfig();
        logger.log('Config reload successful');
      } catch (e) {
        logger.error('Config reload failed', e);
      }
    }
  });

  watcher.on('error', (err) => {
    logger.error('Config watcher error', err);
  });
}