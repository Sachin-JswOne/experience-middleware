import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATENCY_HISTOGRAM_BOUNDS } from '../metrics.interface';

/**
 * The frontend mirrors the backend's metrics contract by hand
 * (`src/metrics/metrics.types.ts` → `frontend/src/_types/metrics.interface.ts`).
 * A shared module would be better, but the Nest build's `rootDir: src` makes
 * importing across the boundary a build-config change with real blast radius.
 *
 * This test is the cheap guard instead: it parses both files and fails when a
 * mirrored interface gains, loses or renames a field on either side. It does
 * not compare types — just the field names, which is where drift actually
 * bites (a renamed field silently reads `undefined` in a chart).
 */

const BACKEND_TYPES = join(__dirname, '../../../../src/metrics/metrics.types.ts');
const FRONTEND_TYPES = join(__dirname, '../metrics.interface.ts');
const BACKEND_CLUSTER_SHARED = join(__dirname, '../../../../src/metrics/metrics.cluster.shared.ts');

// Interfaces that must stay identical on both sides. Types the frontend never
// receives (RequestRecord, PodHealthPoint internals) are deliberately absent.
const MIRRORED = [
  'StatusClassCounts',
  'StageTimings',
  'CacheProviderStats',
  'MetricsSummary',
  'TimelineBucket',
  'RouteBreakdown',
  'RouteDownstreamPair',
  'DownstreamBreakdown',
  'DownstreamTimelinePoint',
  'RouteTimelinePoint',
  'AlertConfig',
  'AlertHistoryRecord',
  'RecentError',
  'DeployMarker',
  'PodHealth',
  'MetricsHealth',
  'SampleDownstream',
  'RouteErrorSample',
  'MetricsSnapshot',
];

/** Field names declared directly on `interface <name> { … }`. */
const fieldsOf = (source: string, name: string): string[] | null => {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);

  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = source.slice(open + 1, end);
  const fields: string[] = [];
  let nesting = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    // Only count declarations at the top level of this interface.
    if (nesting === 0) {
      const match = line.match(/^(\w+)\??\s*:/);
      if (match?.[1]) fields.push(match[1]);
    }
    nesting += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  }
  return fields.sort();
};

describe('metrics contract mirror', () => {
  const backend = readFileSync(BACKEND_TYPES, 'utf8');
  const frontend = readFileSync(FRONTEND_TYPES, 'utf8');

  it.each(MIRRORED)('%s has the same fields on both sides', (name) => {
    const backendFields = fieldsOf(backend, name);
    const frontendFields = fieldsOf(frontend, name);

    expect(backendFields, `${name} is missing from the backend contract`).not.toBeNull();
    expect(frontendFields, `${name} is missing from the frontend contract`).not.toBeNull();
    expect(frontendFields).toEqual(backendFields);
  });

  it('mirrors the latency histogram bounds', () => {
    const shared = readFileSync(BACKEND_CLUSTER_SHARED, 'utf8');
    const match = shared.match(/export const HISTOGRAM_BOUNDS = \[([^\]]+)\]/);
    expect(match?.[1], 'HISTOGRAM_BOUNDS not found in metrics.cluster.shared.ts').toBeDefined();

    const backendBounds = (match?.[1] ?? '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => !Number.isNaN(n));

    expect([...LATENCY_HISTOGRAM_BOUNDS]).toEqual(backendBounds);
  });
});
