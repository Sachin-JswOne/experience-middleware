import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LocalStorage from '@/utils/LocalStorage';
import type { MetricsRange } from './useMetricsQuery';
import type { MetricsFilter } from './MetricsFilterBar';
import { parseView, serializeView } from './dashboardUrlState';

const REFRESH_STORAGE_KEY = 'metricsRefreshMs';
const DEFAULT_REFRESH_MS = 10_000;

/**
 * Owns every "what am I looking at" decision for the dashboard and keeps it
 * mirrored in the URL. Also tracks the zoom trail so the reset chip can walk
 * back through drag-zooms.
 */
export const useDashboardView = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [view] = useState(() => parseView(searchParams));
  const [range, setRange] = useState<MetricsRange>(view.range);
  const [tab, setTab] = useState(view.tab);
  const [filter, setFilter] = useState<MetricsFilter>(view.filter);
  const [targetFilter, setTargetFilter] = useState<string[]>(view.targets);
  const [utc, setUtc] = useState(view.utc);
  const [refreshMs, setRefreshMs] = useState<number>(() => {
    if (view.refreshMs !== null) return view.refreshMs;
    const stored = LocalStorage.getItem(REFRESH_STORAGE_KEY);
    return typeof stored === 'number' ? stored : DEFAULT_REFRESH_MS;
  });
  // Ranges we zoomed away from — the reset chip walks back through them.
  const [zoomStack, setZoomStack] = useState<MetricsRange[]>([]);

  // Reflect every view decision in the URL so reload/share restores it.
  useEffect(() => {
    setSearchParams(serializeView({ range, tab, filter, targets: targetFilter, utc, refreshMs }), {
      replace: true,
    });
  }, [range, tab, filter, targetFilter, utc, refreshMs, setSearchParams]);

  const changeRefresh = useCallback((value: number) => {
    setRefreshMs(value);
    LocalStorage.setItem(REFRESH_STORAGE_KEY, value);
  }, []);

  // Picking a range by hand invalidates the zoom trail.
  const changeRange = useCallback((next: MetricsRange) => {
    setZoomStack([]);
    setRange(next);
  }, []);

  // Drag-select on a timeline chart zooms into that slice (absolute range).
  const zoomTo = useCallback((fromTs: number, toTs: number) => {
    setRange((current) => {
      setZoomStack((stack) => [...stack, current]);
      return { type: 'absolute', from: fromTs, to: toTs };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomStack((stack) => {
      const previous = stack[stack.length - 1];
      if (previous) setRange(previous);
      return stack.slice(0, -1);
    });
  }, []);

  const toggleUtc = useCallback(() => setUtc((prev) => !prev), []);

  // Saved views re-apply a previously captured query string.
  const applyViewParams = useCallback(
    (raw: string) => {
      const next = parseView(new URLSearchParams(raw));
      setZoomStack([]);
      setRange(next.range);
      setTab(next.tab);
      setFilter(next.filter);
      setTargetFilter(next.targets);
      setUtc(next.utc);
      if (next.refreshMs !== null) changeRefresh(next.refreshMs);
    },
    [changeRefresh],
  );

  return {
    searchParams,
    range,
    tab,
    filter,
    targetFilter,
    utc,
    refreshMs,
    canResetZoom: zoomStack.length > 0,
    setTab,
    setFilter,
    setTargetFilter,
    changeRange,
    changeRefresh,
    toggleUtc,
    zoomTo,
    resetZoom,
    applyViewParams,
  };
};

export default useDashboardView;
