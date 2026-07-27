import { WINDOW_MS, type MetricsRange, type MetricsWindow } from './useMetricsQuery';
import type { MetricsFilter } from './MetricsFilterBar';

/**
 * URL <-> dashboard state codec.
 *
 * Every view decision lives in the query string so a reload or a shared link
 * restores the exact view — and so a saved view is just a named copy of it.
 */

export const TAB_NAMES = ['overview', 'routes', 'downstream', 'system'] as const;

export type TabName = (typeof TAB_NAMES)[number];

export interface DashboardView {
  range: MetricsRange;
  tab: number;
  filter: MetricsFilter;
  targets: string[];
  utc: boolean;
  refreshMs: number | null;
}

export const parseRange = (params: URLSearchParams): MetricsRange => {
  const from = Number(params.get('from'));
  const to = Number(params.get('to'));
  if (params.get('from') && params.get('to') && !isNaN(from) && !isNaN(to) && from < to) {
    return { type: 'absolute', from, to };
  }
  const window = params.get('window');
  if (window && window in WINDOW_MS) {
    return { type: 'relative', window: window as MetricsWindow };
  }
  return { type: 'relative', window: '5m' };
};

export const parseTab = (params: URLSearchParams): number => {
  const idx = TAB_NAMES.indexOf((params.get('tab') ?? '') as TabName);
  return idx >= 0 ? idx : 0;
};

export const parseList = (params: URLSearchParams, key: string): string[] => {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
};

const parseRefresh = (params: URLSearchParams): number | null => {
  const raw = params.get('refresh');
  if (raw === null || isNaN(Number(raw))) return null;
  return Number(raw);
};

export const parseView = (params: URLSearchParams): DashboardView => ({
  range: parseRange(params),
  tab: parseTab(params),
  filter: { routes: parseList(params, 'routes'), method: params.get('method') },
  targets: parseList(params, 'targets'),
  utc: params.get('utc') === '1',
  refreshMs: parseRefresh(params),
});

export const serializeView = (view: Omit<DashboardView, 'refreshMs'> & { refreshMs: number }) => {
  const params: Record<string, string> = { tab: TAB_NAMES[view.tab] ?? 'overview' };
  if (view.range.type === 'relative') {
    params.window = view.range.window;
  } else {
    params.from = String(view.range.from);
    params.to = String(view.range.to);
  }
  params.refresh = String(view.refreshMs);
  if (view.filter.method) params.method = view.filter.method;
  if (view.filter.routes.length > 0) params.routes = view.filter.routes.join(',');
  if (view.targets.length > 0) params.targets = view.targets.join(',');
  if (view.utc) params.utc = '1';
  return params;
};
