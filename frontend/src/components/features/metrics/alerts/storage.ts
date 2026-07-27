import type { AlertConfig } from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { loadPersisted, loadPersistedList, savePersistedList } from '@/utils/usePersistedState';
import { defaultThresholds, type AlertHistoryEntry, type AlertThresholds } from './types';

const STORAGE_KEY = 'metricsAlertThresholds';
const HISTORY_KEY = 'metricsAlertHistory';
const HISTORY_MAX = 50;

// Older saves lack the newer fields — defaults fill them in.
export const loadThresholds = (): AlertThresholds =>
  loadPersisted(STORAGE_KEY, defaultThresholds);

export const saveThresholds = (thresholds: AlertThresholds): void => {
  LocalStorage.setItem(STORAGE_KEY, thresholds);
};

/**
 * Fields shared with the server-side webhook evaluator (stored in Valkey).
 * Browser-only signals (notify, loop lag, valkey) stay in localStorage.
 */
export const toServerConfig = (thresholds: AlertThresholds): AlertConfig => ({
  errorRatePct: thresholds.errorRatePct,
  p99Ms: thresholds.p99Ms,
  targetErrorRatePct: thresholds.targetErrorRatePct,
  trafficDropPct: thresholds.trafficDropPct,
  sloAvailabilityPct: thresholds.sloAvailabilityPct,
  alertOnNoData: thresholds.alertOnNoData,
  snoozeUntil: thresholds.snoozeUntil,
  routeRules: thresholds.routeRules,
  targetRules: thresholds.targetRules,
  updatedAt: 0,
});

export const mergeServerConfig = (
  base: AlertThresholds,
  config: AlertConfig,
): AlertThresholds => ({
  ...base,
  errorRatePct: config.errorRatePct,
  p99Ms: config.p99Ms,
  targetErrorRatePct: config.targetErrorRatePct,
  trafficDropPct: config.trafficDropPct,
  sloAvailabilityPct: config.sloAvailabilityPct,
  alertOnNoData: config.alertOnNoData ?? false,
  snoozeUntil: config.snoozeUntil ?? null,
  routeRules: config.routeRules ?? [],
  targetRules: config.targetRules ?? [],
});

// --- Breach history (localStorage ring) --------------------------------

export const loadAlertHistory = (): AlertHistoryEntry[] =>
  loadPersistedList<AlertHistoryEntry>(HISTORY_KEY);

export const appendAlertHistory = (breaches: string[]): void => {
  savePersistedList(
    HISTORY_KEY,
    [{ ts: Date.now(), breaches }, ...loadAlertHistory()].slice(0, HISTORY_MAX),
  );
};

export const clearAlertHistory = (): void => savePersistedList(HISTORY_KEY, []);
