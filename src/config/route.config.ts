/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
import * as path from 'path';
import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';
import { RouteConfig } from 'src/models/route-config.model';
import { APP_ENV } from './app.config';

const configFilePath = path.resolve(
  __dirname,
  `../assets/${APP_ENV}/route-config.json`,
);
let ROUTE_CONFIG: RouteConfig[] = [];
const enumFieldsMap: Record<string, any> = {
  routeHandler: RouteHandler,
  aggregationType: AggregatorType,
};

export function normalizeEnums<T extends Record<string, any>>(
  raw: T,
  enumFieldMap: Record<string, any>,
): T {
  const result: Record<string, any> = { ...raw };

  for (const [field, enumType] of Object.entries(enumFieldMap)) {
    if (field in result && typeof result[field] === 'string') {
      const value = result[field];
      result[field] = enumType[value as keyof typeof enumType];
    }
  }

  return result as T;
}

try {
  const raw = fs.readFileSync(configFilePath, 'utf-8');
  const rawConfigs: any[] = JSON.parse(raw);
  ROUTE_CONFIG = rawConfigs.map((raw: any) =>
    normalizeEnums<RouteConfig>(raw, enumFieldsMap),
  );
} catch (e) {
  throw new Error(
    `Failed to load route config from ${configFilePath}: ${(e as Error).message}`,
  );
}

export { ROUTE_CONFIG };
