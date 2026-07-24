export interface ValkeyStatus {
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
  totalSystemMemoryBytes: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number | null;
  dbSize: number;
}

export interface ValkeyInfoTotals {
  dbSize: number;
  usedMemoryBytes: number;
  /** Sum of maxmemory (or system memory when unlimited) across nodes. */
  memoryLimitBytes: number;
  connectedClients: number;
  keyspaceHits: number;
  keyspaceMisses: number;
}

export interface ValkeyClientInfo {
  id: string;
  addr: string;
  name: string;
  ageSeconds: number;
  idleSeconds: number;
  db: number;
  lastCommand: string;
  user: string;
}

export interface ValkeyClients {
  total: number;
  nodes: Array<{ node: string; clients: ValkeyClientInfo[] }>;
}

export interface ValkeyInfo {
  totals: ValkeyInfoTotals;
  nodes: ValkeyNodeInfo[];
}

export interface ValkeyClusterNode {
  id: string;
  address: string;
  flags: string;
  role: string;
  slots: string;
}

export interface ValkeyClusterNodes {
  mode: 'cluster' | 'standalone';
  nodes: ValkeyClusterNode[];
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

export interface ValkeyFlushResult {
  flushed: boolean;
  scope: string;
  nodes: number;
}
