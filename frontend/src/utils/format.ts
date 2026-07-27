import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);

/**
 * App-wide value formatters. Chart-specific helpers live in
 * `components/features/metrics/chartShared`; anything reused outside the
 * metrics feature belongs here.
 */

export const formatNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
};

export const formatMs = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
};

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

/** Coarse "3d 4h" / "5h 2m" / "12m" duration, for uptime columns. */
export const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

/** Valkey TTL semantics: -1 = no expiry, -2 = key is gone. */
export const formatTtl = (ttl: number): string => {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return '—';
  if (ttl >= 86400) return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`;
  if (ttl >= 3600) return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  if (ttl >= 60) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  return `${ttl}s`;
};

/**
 * All timestamps go through this so the dashboard's UTC toggle affects every
 * rendered time consistently.
 */
export const formatTs = (ts: number, template: string, utc = false): string =>
  (utc ? dayjs(ts).utc() : dayjs(ts)).format(template);
