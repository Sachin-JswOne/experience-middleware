import * as fs from 'fs';
import * as path from 'path';
import { validateNoDuplicateRoutes } from '../src/config/route-config.schema';

// Build-time guard: fail the build on duplicate routes in route-config.json.
const configFilePath = path.resolve(__dirname, '../src/assets/route-config.json');

try {
  const raw = fs.readFileSync(configFilePath, 'utf-8');
  const rawConfigs = JSON.parse(raw) as unknown;
  validateNoDuplicateRoutes(rawConfigs);
  console.log('route-config.json validation passed: no duplicate routes.');
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
