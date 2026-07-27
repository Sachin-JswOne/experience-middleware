import type {
  DownstreamBreakdown,
  MetricsSnapshot,
  RouteDownstreamPair,
} from '@/_types/metrics.interface';
import type { MetricsFilter } from './MetricsFilterBar';

/** Pure derivations from a snapshot — no React, no fetching. */

export const matchesRouteFilter = (
  filter: MetricsFilter,
  method: string,
  route: string,
): boolean => {
  if (filter.method && method !== filter.method) return false;
  if (filter.routes.length > 0 && !filter.routes.includes(`${method} ${route}`)) return false;
  return true;
};

export const isRouteFilterActive = (filter: MetricsFilter): boolean =>
  Boolean(filter.method) || filter.routes.length > 0;

/**
 * Rolls per-(route, target) pairs up to per-target totals, so the Downstream
 * tab can show "this target, but only traffic from the selected routes".
 * Latency is request-weighted, matching how the backend averages it.
 */
export const rollupByTarget = (
  pairs: RouteDownstreamPair[],
  filter: MetricsFilter,
): DownstreamBreakdown[] => {
  const byTarget = new Map<string, { count: number; err: number; latSum: number }>();
  for (const pair of pairs) {
    if (!matchesRouteFilter(filter, pair.method, pair.route)) continue;
    let acc = byTarget.get(pair.target);
    if (!acc) {
      acc = { count: 0, err: 0, latSum: 0 };
      byTarget.set(pair.target, acc);
    }
    acc.count += pair.requestCount;
    acc.err += pair.errorCount;
    acc.latSum += pair.avgLatencyMs * pair.requestCount;
  }
  return Array.from(byTarget.entries()).map(([target, acc]) => ({
    target,
    requestCount: acc.count,
    errorCount: acc.err,
    avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
  }));
};

/**
 * Downstream aggregates for the current filters. With a route filter active
 * the numbers come from the per-(route, target) pairs; otherwise the plain
 * per-target rollup the backend already computed is used as-is.
 */
export const downstreamAggregates = (
  snapshot: MetricsSnapshot,
  filter: MetricsFilter,
  targets: string[],
): DownstreamBreakdown[] => {
  const base =
    isRouteFilterActive(filter) && snapshot.routeDownstream
      ? rollupByTarget(snapshot.routeDownstream, filter)
      : snapshot.downstream;
  return targets.length > 0 ? base.filter((d) => targets.includes(d.target)) : base;
};

export const filterByTarget = <T extends { target: string }>(items: T[], targets: string[]): T[] =>
  targets.length > 0 ? items.filter((item) => targets.includes(item.target)) : items;

/** Requests per second over the window the snapshot actually covers. */
export const requestsPerSecond = (snapshot: MetricsSnapshot): number => {
  const coveredSec = (snapshot.windowCoverageMs ?? snapshot.windowMs) / 1000;
  return coveredSec > 0 ? snapshot.summary.totalRequests / coveredSec : 0;
};
