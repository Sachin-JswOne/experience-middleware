import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import type { RouteConfig } from '../types';

export default function RouteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [route, setRoute] = useState<RouteConfig | null>(null);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get<RouteConfig[]>('/xp-mi/admin/config', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const found = res.data.find((r) => r.id === id);
        if (!found) {
          setError(`Route '${id}' not found in configuration.`);
          return;
        }
        setRoute(found);
        setJson(JSON.stringify(found, null, 2));
      } catch {
        setError('Failed to load route configuration.');
      }
    }
    load();
  }, [id, token]);

  function handleEditorChange(value: string | undefined) {
    const v = value ?? '';
    setJson(v);
    try {
      JSON.parse(v);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON — correct errors before saving.');
    }
  }

  async function handleSave() {
    if (!token || !id) return;
    let parsed: RouteConfig;
    try {
      parsed = JSON.parse(json);
    } catch {
      setJsonError('Cannot save — fix JSON errors first.');
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`/xp-mi/admin/routes/${id}`, parsed, {
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/');
    } catch {
      setJsonError('Failed to save — check server connection.');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 'var(--space-lg)' }}>
        <p className="text-error" style={{ fontSize: '16px' }}>{error}</p>
        <button className="btn btn--secondary" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <p className="text-muted">Loading configuration…</p>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      {/* Editor header */}
      <div className="editor-header">
        <div>
          <div className="editor-title">Edit Route</div>
          <div className="editor-subtitle">{route.path} · {route.method}</div>
        </div>
        <div className="editor-actions">
          <button className="btn btn--secondary" onClick={() => navigate('/')}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!!jsonError || saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Validation feedback */}
      <div className="editor-validation">
        {jsonError ? (
          <span className="editor-validation--error">{jsonError}</span>
        ) : (
          <span className="editor-validation--ok">JSON valid</span>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="editor-canvas">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={json}
          onChange={handleEditorChange}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}