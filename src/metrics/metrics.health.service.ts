import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { monitorEventLoopDelay, IntervalHistogram, PerformanceObserver } from 'perf_hooks';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import { MetricsAggregator } from './metrics.aggregator';
import { DEPLOYS_KEY_SUFFIX, DEPLOYS_MAX } from './metrics.cluster-store';
import {
  appVersion,
  isClusterEnabled,
  keyPrefix,
  podName,
  retentionSeconds,
} from './metrics.cluster.shared';
import { DeployMarker, MetricsHealth, PodHealth, PodHealthPoint } from './metrics.types';

const HEARTBEAT_INTERVAL_MS = 15_000;
// Pods that missed two heartbeats are considered gone.
const POD_STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 4;
const PODS_KEY_SUFFIX = 'pods';
// ~10 minutes of trend at one point per heartbeat — enough for the System
// tab sparklines to show heap creep or lag spikes.
const HISTORY_MAX_POINTS = 40;

/**
 * Pod-level runtime telemetry: event-loop lag, memory, CPU, GC activity,
 * uptime — plus a short history ring per pod for trend sparklines. Each pod
 * heartbeats its own stats into a shared Valkey hash so the dashboard's
 * System tab can show every pod in the cluster, not just the one that
 * happened to answer the request. Also registers a deploy marker on boot so
 * charts can annotate when a new version started serving.
 */
@Injectable()
export class MetricsHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsHealthService.name);
  private readonly bootTs = Date.now();
  private loopMonitor?: IntervalHistogram;
  private gcObserver?: PerformanceObserver;
  private heartbeatTimer?: NodeJS.Timeout;
  private history: PodHealthPoint[] = [];

  // CPU usage is reported as a delta between samples.
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTs = Date.now();
  private lastCpuPct = 0;

  // GC counters accumulate in the observer and are drained per sample.
  private gcCount = 0;
  private gcPauseMs = 0;

  constructor(
    private readonly valkeyClient: ValkeyClient,
    private readonly aggregator: MetricsAggregator,
  ) {}

  onModuleInit(): void {
    this.loopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.loopMonitor.enable();

    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.gcCount++;
          this.gcPauseMs += entry.duration;
        }
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      // GC observation is best-effort; some runtimes disallow it.
    }

    if (isClusterEnabled()) {
      void this.registerDeployMarker();
    }
    // The sampler always runs — it feeds the local history ring; the Valkey
    // heartbeat inside is cluster-mode only.
    void this.heartbeat();
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.loopMonitor?.disable();
    this.gcObserver?.disconnect();
  }

  getLocalHealth(): PodHealth {
    const mem = process.memoryUsage();
    const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
    // monitorEventLoopDelay reports nanoseconds.
    const lagMeanMs = this.loopMonitor ? this.loopMonitor.mean / 1e6 : 0;
    const lagP99Ms = this.loopMonitor ? this.loopMonitor.percentile(99) / 1e6 : 0;
    this.loopMonitor?.reset();
    const bufferStats = this.aggregator.getBufferStats();

    // CPU % of one core since the previous sample. Too-short gaps produce
    // noise — keep the previous reading instead.
    const now = Date.now();
    const elapsedMs = now - this.lastCpuTs;
    if (elapsedMs >= 1_000) {
      const delta = process.cpuUsage(this.lastCpuUsage);
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTs = now;
      this.lastCpuPct = Math.round(((delta.user + delta.system) / 1_000 / elapsedMs) * 1000) / 10;
    }

    // Drain GC counters accumulated since the previous sample.
    const gcCount = this.gcCount;
    const gcPauseMs = Math.round(this.gcPauseMs * 10) / 10;
    this.gcCount = 0;
    this.gcPauseMs = 0;

    return {
      pod: podName(),
      version: appVersion(),
      lastSeen: now,
      uptimeSec: Math.round(process.uptime()),
      heapUsedMb: toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
      rssMb: toMb(mem.rss),
      eventLoopLagMs: Math.round(lagMeanMs * 10) / 10,
      eventLoopLagP99Ms: Math.round(lagP99Ms * 10) / 10,
      bufferRecords: bufferStats.records,
      requestsLastMin: bufferStats.requestsLastMin,
      cpuPct: this.lastCpuPct,
      gcCount,
      gcPauseMs,
    };
  }

  async getHealth(): Promise<MetricsHealth> {
    const local = this.getLocalHealth();
    local.history = this.history;
    if (!isClusterEnabled()) {
      return { pod: local, cluster: [], valkey: 'disabled' };
    }

    const entries = await this.valkeyClient.execute((client) =>
      client.hgetall(`${keyPrefix()}:${PODS_KEY_SUFFIX}`),
    );
    if (!entries) {
      return { pod: local, cluster: [local], valkey: 'unavailable' };
    }

    const freshAfter = Date.now() - POD_STALE_AFTER_MS;
    const cluster: PodHealth[] = [];
    for (const raw of Object.values(entries)) {
      try {
        const parsed = JSON.parse(raw) as PodHealth;
        if (parsed.lastSeen >= freshAfter) cluster.push(parsed);
      } catch {
        // Skip malformed entries.
      }
    }
    // The local pod's stats are fresher than its last heartbeat.
    const withoutSelf = cluster.filter((p) => p.pod !== local.pod);
    withoutSelf.push(local);
    withoutSelf.sort((a, b) => a.pod.localeCompare(b.pod));
    return { pod: local, cluster: withoutSelf, valkey: 'connected' };
  }

  // Fallback deploy marker when the cluster list is unavailable: this pod's
  // own boot time.
  getLocalDeployMarkers(fromTs: number, toTs: number): DeployMarker[] {
    const bootMarker: DeployMarker = { ts: this.bootTs, version: appVersion(), pod: podName() };
    return bootMarker.ts >= fromTs && bootMarker.ts <= toTs ? [bootMarker] : [];
  }

  private async heartbeat(): Promise<void> {
    const health = this.getLocalHealth();

    this.history.push({
      ts: health.lastSeen,
      heapUsedMb: health.heapUsedMb,
      rssMb: health.rssMb,
      eventLoopLagP99Ms: health.eventLoopLagP99Ms,
      requestsLastMin: health.requestsLastMin,
      cpuPct: health.cpuPct ?? 0,
      gcPauseMs: health.gcPauseMs ?? 0,
    });
    if (this.history.length > HISTORY_MAX_POINTS) {
      this.history.splice(0, this.history.length - HISTORY_MAX_POINTS);
    }

    if (!isClusterEnabled()) return;
    health.history = this.history;
    await this.valkeyClient.executeWrite(async (client) => {
      const key = `${keyPrefix()}:${PODS_KEY_SUFFIX}`;
      const pipeline = client.pipeline();
      pipeline.hset(key, health.pod, JSON.stringify(health));
      pipeline.expire(key, 24 * 60 * 60);
      await pipeline.exec();
    });
  }

  // Push a deploy marker unless the newest recorded marker already carries
  // this version (other pods of the same rollout race here — a version check
  // on the head entries keeps the list from filling with duplicates).
  private async registerDeployMarker(): Promise<void> {
    const version = appVersion();
    const key = `${keyPrefix()}:${DEPLOYS_KEY_SUFFIX}`;
    const head = await this.valkeyClient.execute((client) => client.lrange(key, 0, 9));
    if (head) {
      for (const entry of head) {
        try {
          if ((JSON.parse(entry) as DeployMarker).version === version) return;
        } catch {
          // Ignore malformed entries.
        }
      }
    }
    const marker: DeployMarker = { ts: Date.now(), version, pod: podName() };
    const ok = await this.valkeyClient.executeWrite(async (client) => {
      const pipeline = client.pipeline();
      pipeline.lpush(key, JSON.stringify(marker));
      pipeline.ltrim(key, 0, DEPLOYS_MAX - 1);
      pipeline.expire(key, retentionSeconds());
      await pipeline.exec();
    });
    if (ok) this.logger.log(`Registered deploy marker for version ${version}`);
  }
}
