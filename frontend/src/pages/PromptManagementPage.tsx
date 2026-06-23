import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { PROMPTS, fmtDate, type ActivePrompt, type PromptDef } from './prompts.shared';

interface PromptState {
  loading: boolean;
  data: ActivePrompt | null;
  error: string | null;
}

function PromptCard({ def }: { def: PromptDef }) {
  const [state, setState] = useState<PromptState>({ loading: true, data: null, error: null });

  const fetchPrompt = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await axios.get<{ status: string; data: ActivePrompt }>(
        `/xp-mi/public/v1/prompts/${def.type}/active`,
        { headers: { accept: 'application/json' } },
      );
      setState({ loading: false, data: res.data.data, error: null });
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : 'Failed to load active prompt.';
      setState({ loading: false, data: null, error: msg });
    }
  }, [def.type]);

  useEffect(() => { fetchPrompt(); }, [fetchPrompt]);

  const { loading, data, error } = state;

  return (
    <section className="card">
      <div className="editor-header" style={{ marginBottom: 'var(--space-base)' }}>
        <div>
          <div className="editor-title">{def.label}</div>
          <div className="editor-subtitle">
            <span className="mono">{def.type}</span>
          </div>
        </div>
        <div className="editor-actions">
          {data && <span className="badge">v{data.version}</span>}
          <button className="btn btn--secondary" onClick={fetchPrompt} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="reload-banner" role="alert" style={{ marginBottom: 'var(--space-base)' }}>
          <span className="text-error">{error}</span>
        </div>
      )}

      {loading && !data && <p className="text-muted">Loading active prompt…</p>}

      {data && (
        <>
          <div className="form-grid" style={{ marginBottom: 'var(--space-base)' }}>
            <Meta label="Prompt ID" value={String(data.id)} />
            <Meta label="Version" value={String(data.version)} />
            <Meta label="Active" value={data.active ? 'Yes' : 'No'} />
            <Meta label="Encoding" value={data.encoding} />
            <Meta label="Created By" value={data.createdBy} />
            <Meta label="Description" value={data.description || '—'} />
            <Meta label="Created At" value={fmtDate(data.createdAt)} />
            <Meta label="Updated At" value={fmtDate(data.updatedAt)} />
          </div>
          <div className="form-label">Prompt</div>
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--color-surface-2, rgba(0,0,0,0.03))',
              border: '1px solid var(--color-border, rgba(0,0,0,0.08))',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-base)',
              maxHeight: '420px',
              overflow: 'auto',
              margin: 0,
            }}
          >
            {data.prompt}
          </pre>
        </>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-field">
      <div className="form-label">{label}</div>
      <div style={{ fontSize: '14px', color: 'var(--color-body)' }}>{value}</div>
    </div>
  );
}

export default function PromptManagementPage() {
  return (
    <div className="page-content">
      <div className="editor-header" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <div className="editor-title">Prompt Management</div>
          <div className="editor-subtitle">Active AI prompts for Registration &amp; Business Classification</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {PROMPTS.map((p) => (
          <PromptCard key={p.type} def={p} />
        ))}
      </div>
    </div>
  );
}
