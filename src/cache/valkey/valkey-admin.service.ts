import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis, { Cluster } from 'ioredis';
import { ValkeyConfig } from './valkey.config';

const MAX_SCAN_COUNT = 500;
const MAX_KEYS_PER_REQUEST = 200;
const MAX_VALUE_BYTES = 100 * 1024;
const MAX_COLLECTION_ITEMS = 100;
const MAX_DELETE_KEYS = 50;

export interface ValkeyAdminStatus {
  connected: boolean;
  available: boolean;
  mode: 'cluster' | 'standalone';
  nodeCount: number;
}

export interface ValkeyNodeInfo {
  node: string;
  role: string;
  version: string;
  uptimeSeconds: number;
  connectedClients: number;
  usedMemoryBytes: number;
  usedMemoryHuman: string;
  maxMemoryBytes: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number | null;
  dbSize: number;
}

export interface ValkeyScanKey {
  key: string;
  /** Seconds; -1 = no expiry, -2 = missing (expired between SCAN and TTL). */
  ttl: number;
}

export interface ValkeyScanResult {
  keys: ValkeyScanKey[];
  cursor: string | null;
  complete: boolean;
}

export interface ValkeyKeyDetail {
  key: string;
  type: string;
  ttl: number;
  value: unknown;
  size: number;
  truncated: boolean;
}

@Injectable()
export class ValkeyAdminService {
  private readonly logger = new Logger(ValkeyAdminService.name);

  constructor(private readonly config: ValkeyConfig) {}

  private requireClient(): Redis | Cluster {
    const client = this.config.getClient();
    if (!client) {
      throw new ServiceUnavailableException('Valkey is not configured or connected');
    }
    return client;
  }

  private masters(client: Redis | Cluster): Redis[] {
    return client instanceof Cluster ? client.nodes('master') : [client as Redis];
  }

  private nodeAddress(node: Redis): string {
    const opts = node.options ?? {};
    return `${opts.host ?? 'unknown'}:${opts.port ?? '?'}`;
  }

  private parseInfo(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 1).trim();
    }
    return out;
  }

  getStatus(): ValkeyAdminStatus {
    const client = this.config.getClient();
    const isCluster = client instanceof Cluster;
    return {
      connected: Boolean(client),
      available: this.config.isAvailable(),
      mode: isCluster ? 'cluster' : 'standalone',
      nodeCount: client ? this.masters(client).length : 0,
    };
  }

  async getInfo(): Promise<{ totals: Record<string, number>; nodes: ValkeyNodeInfo[] }> {
    const client = this.requireClient();
    const nodes = await Promise.all(
      this.masters(client).map(async (node) => {
        const [raw, dbSize] = await Promise.all([node.info(), node.dbsize()]);
        const info = this.parseInfo(raw);
        const hits = Number(info.keyspace_hits ?? 0);
        const misses = Number(info.keyspace_misses ?? 0);
        return {
          node: this.nodeAddress(node),
          role: info.role ?? 'unknown',
          version: info.redis_version ?? info.valkey_version ?? 'unknown',
          uptimeSeconds: Number(info.uptime_in_seconds ?? 0),
          connectedClients: Number(info.connected_clients ?? 0),
          usedMemoryBytes: Number(info.used_memory ?? 0),
          usedMemoryHuman: info.used_memory_human ?? '',
          maxMemoryBytes: Number(info.maxmemory ?? 0),
          keyspaceHits: hits,
          keyspaceMisses: misses,
          hitRate: hits + misses > 0 ? hits / (hits + misses) : null,
          dbSize,
        };
      }),
    );

    const totals = nodes.reduce(
      (acc, n) => {
        acc.dbSize += n.dbSize;
        acc.usedMemoryBytes += n.usedMemoryBytes;
        acc.connectedClients += n.connectedClients;
        acc.keyspaceHits += n.keyspaceHits;
        acc.keyspaceMisses += n.keyspaceMisses;
        return acc;
      },
      { dbSize: 0, usedMemoryBytes: 0, connectedClients: 0, keyspaceHits: 0, keyspaceMisses: 0 },
    );

    return { totals, nodes };
  }

  async getClusterNodes(): Promise<{
    mode: 'cluster' | 'standalone';
    nodes: Array<{ id: string; address: string; flags: string; role: string; slots: string }>;
  }> {
    const client = this.requireClient();

    if (!(client instanceof Cluster)) {
      const info = this.parseInfo(await client.info('replication'));
      return {
        mode: 'standalone',
        nodes: [
          {
            id: 'standalone',
            address: this.nodeAddress(client as Redis),
            flags: '',
            role: info.role ?? 'master',
            slots: '',
          },
        ],
      };
    }

    const raw = (await client.cluster('NODES')) as string;
    const nodes = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, address, flags, , , , , , ...slots] = line.split(' ');
        return {
          id,
          address: (address ?? '').split('@')[0],
          flags: flags ?? '',
          role: flags?.includes('master') ? 'master' : 'replica',
          slots: slots.join(' '),
        };
      });

    return { mode: 'cluster', nodes };
  }

  async scanKeys(
    pattern: string,
    cursor: string | undefined,
    count: number,
  ): Promise<ValkeyScanResult> {
    const client = this.requireClient();
    const scanCount = Math.min(Math.max(count || 100, 10), MAX_SCAN_COUNT);
    const nodes = this.masters(client);

    let nodeIdx = 0;
    let nodeCursor = '0';
    if (cursor) {
      const [i, c] = cursor.split('|');
      nodeIdx = Number(i);
      nodeCursor = c ?? '0';
      if (
        !Number.isInteger(nodeIdx) ||
        nodeIdx < 0 ||
        nodeIdx >= nodes.length ||
        !/^\d+$/.test(nodeCursor)
      ) {
        throw new BadRequestException('Invalid cursor');
      }
    }

    const keys: string[] = [];
    // Master ordering can shift on topology change mid-pagination; acceptable
    // for an admin browser — the user just re-scans.
    while (nodeIdx < nodes.length && keys.length < MAX_KEYS_PER_REQUEST) {
      const [next, batch] = await nodes[nodeIdx].scan(
        nodeCursor,
        'MATCH',
        pattern || '*',
        'COUNT',
        scanCount,
      );
      keys.push(...batch);
      if (next === '0') {
        nodeIdx += 1;
        nodeCursor = '0';
      } else {
        nodeCursor = next;
      }
    }

    const complete = nodeIdx >= nodes.length;
    const pageKeys = keys.slice(0, MAX_KEYS_PER_REQUEST);
    // Per-key TTL (not pipelined): in cluster mode keys hash to different
    // slots, and ioredis routes each command to the right node.
    const ttls = await Promise.all(pageKeys.map((k) => client.ttl(k)));
    return {
      keys: pageKeys.map((key, i) => ({ key, ttl: ttls[i] ?? -2 })),
      cursor: complete ? null : `${nodeIdx}|${nodeCursor}`,
      complete,
    };
  }

  async getKeyDetail(key: string): Promise<ValkeyKeyDetail> {
    const client = this.requireClient();

    const type = await client.type(key);
    if (type === 'none') {
      throw new NotFoundException(`Key '${key}' not found`);
    }

    const ttl = await client.ttl(key);
    let value: unknown = null;
    let size = 0;
    let truncated = false;

    switch (type) {
      case 'string': {
        size = await client.strlen(key);
        if (size > MAX_VALUE_BYTES) {
          value = await client.getrange(key, 0, MAX_VALUE_BYTES - 1);
          truncated = true;
        } else {
          value = await client.get(key);
        }
        break;
      }
      case 'hash': {
        value = await client.hgetall(key);
        size = await client.hlen(key);
        break;
      }
      case 'list': {
        size = await client.llen(key);
        value = await client.lrange(key, 0, MAX_COLLECTION_ITEMS - 1);
        truncated = size > MAX_COLLECTION_ITEMS;
        break;
      }
      case 'set': {
        size = await client.scard(key);
        const [, members] = await client.sscan(key, '0', 'COUNT', MAX_COLLECTION_ITEMS);
        value = members.slice(0, MAX_COLLECTION_ITEMS);
        truncated = size > MAX_COLLECTION_ITEMS;
        break;
      }
      case 'zset': {
        size = await client.zcard(key);
        value = await client.zrange(key, 0, MAX_COLLECTION_ITEMS - 1, 'WITHSCORES');
        truncated = size > MAX_COLLECTION_ITEMS;
        break;
      }
      default:
        value = null;
    }

    return { key, type, ttl, value, size, truncated };
  }

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.requireClient();
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, value, 'EX', ttlSeconds);
    } else {
      await client.set(key, value);
    }
  }

  async deleteKeys(keys: string[]): Promise<{ deleted: number }> {
    const client = this.requireClient();
    if (keys.length > MAX_DELETE_KEYS) {
      throw new BadRequestException(`At most ${MAX_DELETE_KEYS} keys per request`);
    }
    // Per-key DEL: a multi-key DEL crosses slots in cluster mode.
    const results = await Promise.all(keys.map((k) => client.del(k)));
    return { deleted: results.reduce((a, b) => a + b, 0) };
  }

  async flush(scope: 'db' | 'all'): Promise<{ flushed: boolean; scope: string; nodes: number }> {
    const client = this.requireClient();
    const masters = this.masters(client);
    await Promise.all(masters.map((n) => (scope === 'all' ? n.flushall() : n.flushdb())));
    return { flushed: true, scope, nodes: masters.length };
  }
}
