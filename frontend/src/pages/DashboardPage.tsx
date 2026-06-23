import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useConfigReload } from '../hooks/useConfigReload';
import type { RouteConfig } from '../types';

// Postman HTTP method colors
const METHOD_COLORS: Record<string, string> = {
  GET: '#0CBB52',
  POST: '#FF9D00',
  PUT: '#1A9DD9',
  PATCH: '#9B708B',
  DELETE: '#EB5757',
  HEAD: '#9B51E0',
  OPTIONS: '#5A6B7B',
};

function MethodTag({ method }: { method: string }) {
  const m = method.toUpperCase();
  const color = METHOD_COLORS[m] ?? 'var(--color-muted)';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.04em',
      color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      borderRadius: 'var(--radius-sm)',
      padding: '3px 8px',
      height: '22px',
    }}>
      {m}
    </span>
  );
}

function RouteHandlerBadge({ value }: { value: string }) {
  // Map numeric enum to label
  const labels: Record<string, string> = {
    '0': 'TRANSFORM',
    '1': 'PASS_THROUGH',
    '2': 'AGGREGATE',
    '3': 'CONDITIONAL',
  };
  return (
    <span className="badge">{labels[value] ?? value}</span>
  );
}

export default function DashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { updated, clearUpdated } = useConfigReload(token);
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'error'; text: string; url?: string } | null>(null);

  async function handleSync() {
    if (!token) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await axios.post<{ prUrl: string; branch: string; baseBranch: string }>(
        '/xp-mi/admin/sync',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSyncMsg({
        type: 'ok',
        text: `PR opened against ${res.data.baseBranch} from ${res.data.branch}.`,
        url: res.data.prUrl,
      });
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : 'Sync failed — check server logs.';
      setSyncMsg({ type: 'error', text: msg });
    } finally {
      setSyncing(false);
    }
  }

  async function fetchConfig() {
    try {
      const res = await axios.get<RouteConfig[]>('/xp-mi/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoutes(res.data);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchConfig(); }, [token]);

  function handleRefresh() {
    clearUpdated();
    setLoading(true);
    fetchConfig();
  }

  const filtered = routes.filter((r) => {
    const q = filter.toLowerCase();
    return (
      r.path.toLowerCase().includes(q) ||
      r.method.toLowerCase().includes(q) ||
      String(r.routeHandler).toLowerCase().includes(q) ||
      (r.target?.name ?? r.targets?.[0]?.name ?? '').toLowerCase().includes(q)
    );
  });

  const getCount = routes.filter((r) => r.method.toUpperCase() === 'GET').length;
  const mutationCount = routes.filter((r) =>
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method.toUpperCase())
  ).length;
  const handlerTypes = new Set(routes.map((r) => String(r.routeHandler))).size;

  const stats = [
    { label: 'Total Routes', value: routes.length, icon: 'Σ', variant: 'primary' },
    { label: 'GET Routes', value: getCount, icon: 'GET', variant: 'info' },
    { label: 'Mutations', value: mutationCount, icon: 'MUT', variant: 'success' },
    { label: 'Handler Types', value: handlerTypes, icon: 'H', variant: 'warning' },
  ];

  return (
    <div className="page-content">
      {/* Stat cards */}
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div>
              <div className="stat-card__label">{s.label}</div>
              <div className="stat-card__value">{loading ? '—' : s.value}</div>
            </div>
            <div className={`stat-card__icon stat-card__icon--${s.variant}`}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Reload banner */}
      {updated && (
        <div className="reload-banner" role="status">
          <span>Configuration updated on disk.</span>
          <button className="btn btn--secondary" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
      )}

      {/* Sync result banner */}
      {
        syncMsg && (
          <div
            className="reload-banner"
            role="status"
            style={syncMsg.type === 'error' ? { borderColor: 'var(--color-error, #EB5757)' } : undefined}
          >
            <span className={syncMsg.type === 'error' ? 'text-error' : undefined}>
              {syncMsg.text}
              {syncMsg.url && (
                <>
                  {' '}
                  <a href={syncMsg.url} target="_blank" rel="noreferrer">View PR ↗</a>
                </>
              )}
            </span>
            <button className="btn btn--secondary" onClick={() => setSyncMsg(null)}>
              Dismiss
            </button>
          </div>
        )
      }

      {/* Search + actions */}
      <div style={{ display: 'flex', gap: 'var(--space-base)', marginBottom: 'var(--space-lg)' }}>
        <input
          className="search-pill"
          type="search"
          placeholder="Filter routes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className="btn btn--secondary"
          style={{ flexShrink: 0 }}
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Sync to PR'}
        </button>
        <button
          className="btn btn--primary"
          style={{ flexShrink: 0 }}
          onClick={() => navigate('/routes/new')}
        >
          + New route
        </button>
      </div>

      {/* Table */}
      {
        loading ? (
          <p className="text-muted">Loading configuration…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted">No routes match your filter.</p>
        ) : (
          <div className="card" style={{ padding: '0 var(--space-lg)', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Method</th>
                  <th>Handler</th>
                  <th>Target</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((route) => (
                  <tr
                    key={route.id}
                    onClick={() => navigate(`/routes/${route.id}`)}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {route.path}
                    </td>
                    <td>
                      <MethodTag method={route.method} />
                    </td>
                    <td><RouteHandlerBadge value={String(route.routeHandler)} /></td>
                    <td style={{ color: 'var(--color-body)', fontSize: '14px' }}>
                      {route.target?.name ?? route.targets?.[0]?.name ?? '—'}
                    </td>
                    <td className="mono">{route.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {
        filter && (
          <p className="text-muted" style={{ marginTop: 'var(--space-base)' }}>
            Showing {filtered.length} of {routes.length} routes
          </p>
        )
      }
    </div >
  );
}