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
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number | null;
  dbSize: number;
}

export interface ValkeyInfoTotals {
  dbSize: number;
  usedMemoryBytes: number;
  connectedClients: number;
  keyspaceHits: number;
  keyspaceMisses: number;
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

export interface ValkeyScanResult {
  keys: string[];
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
