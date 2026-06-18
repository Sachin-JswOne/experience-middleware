import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { RouteConfig } from '../types';

const POLL_INTERVAL_MS = 10_000;

function buildFingerprint(routes: RouteConfig[]): string {
  // Use first 5 route ids as a lightweight fingerprint
  return routes.slice(0, 5).map((r) => r.id).join(',');
}

interface UseConfigReloadReturn {
  updated: boolean;
  clearUpdated: () => void;
}

export function useConfigReload(token: string | null): UseConfigReloadReturn {
  const [updated, setUpdated] = useState(false);
  const lastFingerprint = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkConfig = useCallback(async () => {
    if (!token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await axios.get<RouteConfig[]>('/xp-mi/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const fp = buildFingerprint(res.data);
      if (lastFingerprint.current !== null && fp !== lastFingerprint.current) {
        setUpdated(true);
      }
      lastFingerprint.current = fp;
    } catch {
      // polling failure — ignore
    }
  }, [token]);

  useEffect(() => {
    lastFingerprint.current = null;
    setUpdated(false);
    const id = setInterval(checkConfig, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [checkConfig]);

  const clearUpdated = useCallback(() => setUpdated(false), []);

  return { updated, clearUpdated };
}