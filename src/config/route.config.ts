import * as fs from 'fs';
import * as path from 'path';
import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { RouteHandler } from 'src/enum/route-handler.enum';
import { RouteConfig } from 'src/models/route-config.model';
import { APP_ENV } from './app.config';
import * as dotenv from 'dotenv';
import { TIMEOUTS } from './app.config';

dotenv.config();

const CONSTANTS_MAP: Record<string, any> = {
  TIMEOUTS,
};

const configFilePath = path.resolve(__dirname, `../assets/${APP_ENV}/route-config.json`);
let ROUTE_CONFIG: RouteConfig[] = [];
const enumFieldsMap: Record<string, any> = {
  routeHandler: RouteHandler,
  aggregationType: AggregatorType,
};

export function replaceEnvPlaceholders(obj: any): any {
  const PLACEHOLDER_RE = /\$\{([^}]+)\}/g;

  function resolveKey(key: string): any {
    //supports dot-notation like TIMEOUTS.REQUEST
    const parts = key.split('.');
    let value: any = CONSTANTS_MAP;
    for (const p of parts) {
      value = value?.[p];
    }
    if (value !== undefined) return value;

    // fallback to env var
    const envVal = process.env[key];
    if (envVal !== undefined) {
      // env values are strings, conversion handled later if needed
      return envVal;
    }

    throw new Error(`Missing config for: ${key}`);
  }

  if (typeof obj === 'string') {
    const exactMatch = obj.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const resolved = resolveKey(exactMatch[1]);
      return resolved;
    }
    // replace all placeholders inside the string with their string form
    return obj.replace(PLACEHOLDER_RE, (_, key) => {
      const resolved = resolveKey(key);
      // convert non-string resolved values to string when embedded inside a larger string
      return typeof resolved === 'string' ? resolved : String(resolved);
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(replaceEnvPlaceholders);
  }

  if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      newObj[k] = replaceEnvPlaceholders(v);
    }
    return newObj;
  }

  return obj;
}

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

  const envReplacedConfigs = replaceEnvPlaceholders(rawConfigs);
  ROUTE_CONFIG = envReplacedConfigs.map((raw: any) =>
    normalizeEnums<RouteConfig>(raw, enumFieldsMap),
  );
} catch (e) {
  throw new Error(`Failed to load route config from ${configFilePath}: ${(e as Error).message}`);
}

export { ROUTE_CONFIG };
