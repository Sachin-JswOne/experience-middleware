import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { PROMPTS, fmtDate, type ActivePrompt } from './prompts.shared';

interface VersionsState {
  loading: boolean;
  data: ActivePrompt[] | null;
  error: string | null;
}

/** Decode the `sub` claim from a JWT without verifying it (display default only). */
function jwtSub(token: string | null): string {
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload?.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
}

export default function PromptHistoryPage() {
  const { type } = useParams<{ type: string }>();
  const { token } = useAuth();
  const def = PROMPTS.find((p) => p.type === type);

  const [state, setState] = useState<VersionsState>({ loading: true, data: null, error: null });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!def) return;
    setState({ loading: true, data: null, error: null });
    try {
      const res = await axios.get<{ status: string; data: ActivePrompt[] }>(
        `/xp-mi/public/v1/prompts/${def.type}/versions`,
        { headers: { accept: 'application/json' } },
      );
      const list = [...res.data.data].sort((a, b) => b.version - a.version);
      setState({ loading: false, data: list, error: null });
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : 'Failed to load prompt history.';
      setState({ loading: false, data: null, error: msg });
    }
  }, [def]);

  useEffect(() => {
    setExpandedId(null);
    setShowCreate(false);
    fetchVersions();
  }, [fetchVersions]);

  if (!def) return <Navigate to="/segmentation/prompts" replace />;

  const { loading, data, error } = state;

  return (
    <div className="page-content">
      <div className="editor-header" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <div className="editor-title">{def.label} — History</div>
          <div className="editor-subtitle">
            Version history for <span className="mono">{def.type}</span>
          </div>
        </div>
        <div className="editor-actions">
          <button className="btn btn--secondary" onClick={fetchVersions} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
            + Create prompt
          </button>
        </div>
      </div>

      {error && (
        <div className="reload-banner" role="alert" style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="text-error">{error}</span>
        </div>
      )}

      {loading && !data && <p className="text-muted">Loading history…</p>}

      {data && data.length === 0 && <p className="text-muted">No versions found.</p>}

      {data && data.length > 0 && (
        <div className="card" style={{ padding: '0 var(--space-lg)', overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Active</th>
                <th>Created By</th>
                <th>Description</th>
                <th>Updated At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <Fragment key={v.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono">v{v.version}</td>
                    <td>{v.active ? <span className="badge">ACTIVE</span> : '—'}</td>
                    <td>{v.createdBy}</td>
                    <td>{v.description || '—'}</td>
                    <td>{fmtDate(v.updatedAt)}</td>
                    <td className="mono">{expandedId === v.id ? '▾' : '▸'}</td>
                  </tr>
                  {expandedId === v.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
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
                            margin: 'var(--space-xs) 0',
                          }}
                        >
                          {v.prompt}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreatePromptModal
          promptType={def.type}
          promptLabel={def.label}
          defaultCreatedBy={jwtSub(token)}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchVersions();
          }}
        />
      )}
    </div>
  );
}

function CreatePromptModal({
  promptType,
  promptLabel,
  defaultCreatedBy,
  onClose,
  onCreated,
}: {
  promptType: string;
  promptLabel: string;
  defaultCreatedBy: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const createdBy = defaultCreatedBy;
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await axios.post(
        '/xp-mi/public/v1/prompts',
        {
          promptType,
          prompt,
          createdBy,
          description: description.trim(),
          activate,
        },
        { headers: { 'Content-Type': 'application/json', accept: 'application/json' } },
      );
      onCreated();
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : 'Failed to create prompt.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-header" style={{ marginBottom: 'var(--space-base)' }}>
          <div>
            <div className="editor-title">Create {promptLabel} prompt</div>
            <div className="editor-subtitle">
              New version for <span className="mono">{promptType}</span>
            </div>
          </div>
          <button className="btn btn--tertiary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        {error && (
          <div className="reload-banner" role="alert" style={{ marginBottom: 'var(--space-base)' }}>
            <span className="text-error">{error}</span>
          </div>
        )}

        <div className="form-grid" style={{ marginBottom: 'var(--space-base)' }}>
          <div className="form-field">
            <div className="form-label">Created By</div>
            <input className="input" value={createdBy || '—'} readOnly disabled />
          </div>
          <div className="form-field">
            <div className="form-label">Description *</div>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Required"
            />
          </div>
        </div>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-base)', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
          <span className="form-label" style={{ margin: 0 }}>Activate this version</span>
        </label>

        <div className="form-label">Prompt *</div>
        <textarea
          className="input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste or write the prompt in any formatting — the service stores it as needed."
          style={{
            width: '100%',
            minHeight: '320px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            resize: 'vertical',
            marginBottom: 'var(--space-base)',
          }}
        />

        <div className="editor-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}
