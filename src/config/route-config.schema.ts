import { z } from 'zod';

// Minimal shape needed to detect duplicate routes; other fields pass through untouched.
const RouteEntrySchema = z
  .object({
    path: z.string(),
    method: z.string(),
  })
  .passthrough();

export const RouteConfigArraySchema = z.array(RouteEntrySchema).superRefine((routes, ctx) => {
  const seen = new Map<string, number>();

  routes.forEach((route, index) => {
    const key = `${route.method.toUpperCase()} ${route.path}`;
    const firstIndex = seen.get(key);

    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index],
        message: `Duplicate route "${route.method.toUpperCase()} ${route.path}" (first defined at index ${firstIndex})`,
      });
    } else {
      seen.set(key, index);
    }
  });
});

export function validateNoDuplicateRoutes(rawConfigs: unknown): void {
  const result = RouteConfigArraySchema.safeParse(rawConfigs);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid route-config.json: ${messages}`);
  }
}

/* ────────────────────────────────────────────────────────────────
   Full create-route validation
   ──────────────────────────────────────────────────────────────── */

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const PLACEHOLDER_RE = /\$\{[^}]+\}/; // ${ENV_VAR} anywhere in the string
const PLACEHOLDER_ONLY_RE = /^\$\{[^}]+\}$/; // entire value is a single placeholder
// Path: starts with /xp-mi, no whitespace, only URL-path-safe characters.
const PATH_CHARS_RE = /^\/[A-Za-z0-9\-._~/:@!$&'()*+,;=%]*$/;
// Dotted identifier for transformer references, e.g. cms.transformers.replaceUriPrefix
const TRANSFORM_NAME_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/;

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const methodEnum = z.enum(HTTP_METHODS);

const pathSchema = z
  .string()
  .max(256, 'path must be at most 256 characters')
  .refine((v) => v.startsWith('/'), 'path must start with "/"')
  .refine((v) => !/\s/.test(v), 'path must not contain whitespace')
  .refine((v) => PATH_CHARS_RE.test(v), 'path contains invalid URL characters')
  .refine((v) => v.startsWith('/xp-mi'), 'path must start with the "/xp-mi" prefix');

const urlSchema = z
  .string()
  .min(1, 'url is required')
  .refine(
    (v) => PLACEHOLDER_RE.test(v) || isHttpUrl(v),
    'url must be a valid http(s) URL or contain a ${...} placeholder',
  );

const timeoutSchema = z.union([
  z.number(),
  z.string().regex(PLACEHOLDER_ONLY_RE, 'timeout must be a number or a ${...} placeholder'),
]);

const transformName = z
  .string()
  .regex(TRANSFORM_NAME_RE, 'must be a dotted identifier (e.g. a.b.c)');

const TargetSchema = z
  .object({
    name: z.string().min(1).optional(),
    url: urlSchema,
    method: methodEnum,
    timeout: z
      .object({ request: timeoutSchema, socket: timeoutSchema })
      .strict(),
    rank: z.number().optional(),
    stopOnError: z.boolean().optional(),
    reqTransform: transformName.optional(),
    resTransform: transformName.optional(),
    interceptors: z.array(z.string()).optional(),
    requiredParams: z.array(z.string()).optional(),
    requiredPathParams: z.array(z.string()).optional(),
    staticHeaders: z.record(z.string(), z.string()).optional(),
    headersToPass: z
      .array(z.object({ source: z.string(), destination: z.string() }).strict())
      .optional(),
  })
  .strict();

const baseFields = {
  id: z.string().optional(),
  path: pathSchema,
  method: methodEnum,
  isCacheRequired: z.boolean().optional(),
};

const transformRoute = z
  .object({
    ...baseFields,
    routeHandler: z.literal('TRANSFORM'),
    target: TargetSchema,
  })
  .strict();

const aggregateRoute = z
  .object({
    ...baseFields,
    routeHandler: z.literal('AGGREGATE'),
    aggregationType: z.enum(['PARALLEL', 'SEQUENTIAL']),
    aggregator: z.string().min(1).optional(),
    resTransform: transformName.optional(),
    targets: z.array(TargetSchema).min(1, 'AGGREGATE requires at least one target'),
  })
  .strict();

const conditionalRoute = z
  .object({
    ...baseFields,
    routeHandler: z.literal('CONDITIONAL'),
    conditionTransform: transformName,
    targets: z.array(TargetSchema).min(1, 'CONDITIONAL requires at least one target'),
  })
  .strict();

const passThroughRoute = z
  .object({
    ...baseFields,
    routeHandler: z.literal('PASS_THROUGH'),
    response: z.string().min(1, 'PASS_THROUGH requires a non-empty response'),
  })
  .strict();

export const CreateRouteSchema = z.discriminatedUnion('routeHandler', [
  transformRoute,
  aggregateRoute,
  conditionalRoute,
  passThroughRoute,
]);

export function validateNewRoute(raw: unknown): void {
  const result = CreateRouteSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => {
      const where = i.path.length ? i.path.join('.') : 'route';
      return `${where}: ${i.message}`;
    });
    throw new Error(messages.join('; '));
  }
}
