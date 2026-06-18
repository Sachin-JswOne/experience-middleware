import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import type { RouteConfig, RouteHandler, TargetConfig } from '../types';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ROUTE_HANDLERS: RouteHandler[] = ['TRANSFORM', 'AGGREGATE', 'CONDITIONAL', 'PASS_THROUGH'];
const AGGREGATION_TYPES = ['PARALLEL', 'SEQUENTIAL'];
const BOOL_OPTIONS = [
  { label: 'No', value: 'false' },
  { label: 'Yes', value: 'true' },
];

const DEFAULT_TIMEOUT_REQUEST = '${TIMEOUTS.REQUEST}';
const DEFAULT_TIMEOUT_SOCKET = '${TIMEOUTS.SOCKET}';

interface TargetForm {
  name: string;
  url: string;
  method: string;
  timeoutRequest: string;
  timeoutSocket: string;
  reqTransform: string;
  resTransform: string;
  stopOnError: string; // 'true' | 'false'
}

function emptyTarget(): TargetForm {
  return {
    name: '',
    url: '',
    method: 'GET',
    timeoutRequest: DEFAULT_TIMEOUT_REQUEST,
    timeoutSocket: DEFAULT_TIMEOUT_SOCKET,
    reqTransform: '',
    resTransform: '',
    stopOnError: 'false',
  };
}

/** Build a TargetConfig, dropping empty optional fields. */
function buildTarget(t: TargetForm, includeStopOnError: boolean): TargetConfig {
  const target: Partial<TargetConfig> = {
    url: t.url.trim(),
    method: t.method,
    timeout: {
      request: numericOrPlaceholder(t.timeoutRequest),
      socket: numericOrPlaceholder(t.timeoutSocket),
    },
    headersToPass: [],
  };
  if (t.name.trim()) target.name = t.name.trim();
  if (t.reqTransform.trim()) target.reqTransform = t.reqTransform.trim();
  if (t.resTransform.trim()) target.resTransform = t.resTransform.trim();
  if (includeStopOnError) target.stopOnError = t.stopOnError === 'true';
  return target as TargetConfig;
}

/** Timeouts may be a literal number or a `${...}` placeholder resolved server-side. */
function numericOrPlaceholder(v: string): number {
  const trimmed = v.trim();
  const n = Number(trimmed);
  return Number.isFinite(n) && trimmed !== '' && !trimmed.startsWith('$')
    ? n
    : (trimmed as unknown as number);
}

export default function CreateRoutePage() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [path, setPath] = useState('');
  const [method, setMethod] = useState('GET');
  const [routeHandler, setRouteHandler] = useState<RouteHandler>('TRANSFORM');
  const [isCacheRequired, setIsCacheRequired] = useState('false');

  // TRANSFORM
  const [target, setTarget] = useState<TargetForm>(emptyTarget());

  // AGGREGATE / CONDITIONAL
  const [aggregationType, setAggregationType] = useState('PARALLEL');
  const [aggregator, setAggregator] = useState('');
  const [conditionTransform, setConditionTransform] = useState('');
  const [resTransform, setResTransform] = useState('');
  const [targets, setTargets] = useState<TargetForm[]>([emptyTarget()]);

  // PASS_THROUGH
  const [response, setResponse] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMulti = routeHandler === 'AGGREGATE' || routeHandler === 'CONDITIONAL';

  function updateTarget(patch: Partial<TargetForm>) {
    setTarget((t) => ({ ...t, ...patch }));
  }
  function updateTargetAt(i: number, patch: Partial<TargetForm>) {
    setTargets((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTarget() {
    setTargets((arr) => [...arr, emptyTarget()]);
  }
  function removeTarget(i: number) {
    setTargets((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  const payload = useMemo<RouteConfig>(() => {
    const base = {
      path: path.trim(),
      method,
      routeHandler,
      isCacheRequired: isCacheRequired === 'true',
    } as RouteConfig & { isCacheRequired: boolean };

    if (routeHandler === 'TRANSFORM') {
      base.target = buildTarget(target, false);
    } else if (routeHandler === 'AGGREGATE') {
      base.aggregationType = aggregationType;
      if (aggregator.trim()) base.aggregator = aggregator.trim();
      if (resTransform.trim()) base.resTransform = resTransform.trim();
      base.targets = targets.map((t) => buildTarget(t, true));
    } else if (routeHandler === 'CONDITIONAL') {
      base.conditionTransform = conditionTransform.trim();
      base.targets = targets.map((t) => buildTarget(t, true));
    } else if (routeHandler === 'PASS_THROUGH') {
      base.response = response;
    }
    return base;
  }, [
    path, method, routeHandler, isCacheRequired, target, aggregationType,
    aggregator, resTransform, conditionTransform, targets, response,
  ]);

  function validate(): string | null {
    if (!path.trim()) return 'Path is required.';
    if (!path.trim().startsWith('/')) return 'Path must start with "/".';
    if (routeHandler === 'TRANSFORM' && !target.url.trim()) return 'Target URL is required.';
    if (isMulti && targets.some((t) => !t.url.trim())) return 'Every target needs a URL.';
    if (routeHandler === 'CONDITIONAL' && !conditionTransform.trim())
      return 'Condition transform is required for CONDITIONAL routes.';
    if (routeHandler === 'PASS_THROUGH' && !response.trim())
      return 'Response is required for PASS_THROUGH routes.';
    return null;
  }

  async function handleSave() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await axios.post('/xp-mi/admin/routes', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/');
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? (e.response?.data?.message ?? e.message)
        : 'Failed to create route.';
      setError(Array.isArray(msg) ? msg.join('; ') : String(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      <div className="editor-header" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <div className="editor-title">Create Route</div>
          <div className="editor-subtitle">Add a new route to the gateway configuration</div>
        </div>
        <div className="editor-actions">
          <button className="btn btn--secondary" onClick={() => navigate('/')}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Create route'}
          </button>
        </div>
      </div>

      {error && (
        <div className="reload-banner" role="alert" style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="text-error">{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 'var(--space-lg)', alignItems: 'start' }}>
        {/* ── Form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Basics */}
          <section className="card">
            <div className="form-section__title">Basics</div>
            <div className="form-grid">
              <Field label="Path" hint="e.g. /xp-mi/public/v1/app-home-page" span={2}>
                <input className="input" value={path} placeholder="/xp-mi/..."
                  onChange={(e) => setPath(e.target.value)} />
              </Field>
              <Field label="HTTP Method">
                <Select value={method} onChange={setMethod} options={HTTP_METHODS} />
              </Field>
              <Field label="Route Handler">
                <Select value={routeHandler} onChange={(v) => setRouteHandler(v as RouteHandler)} options={ROUTE_HANDLERS} />
              </Field>
              <Field label="Cache Required">
                <Select value={isCacheRequired} onChange={setIsCacheRequired} options={BOOL_OPTIONS} />
              </Field>
            </div>
          </section>

          {/* TRANSFORM */}
          {routeHandler === 'TRANSFORM' && (
            <section className="card">
              <div className="form-section__title">Target</div>
              <TargetFields t={target} onChange={updateTarget} showStopOnError={false} />
            </section>
          )}

          {/* AGGREGATE / CONDITIONAL */}
          {isMulti && (
            <section className="card">
              <div className="form-section__title">
                {routeHandler === 'AGGREGATE' ? 'Aggregation' : 'Condition'}
              </div>
              <div className="form-grid">
                {routeHandler === 'AGGREGATE' ? (
                  <>
                    <Field label="Aggregation Type">
                      <Select value={aggregationType} onChange={setAggregationType} options={AGGREGATION_TYPES} />
                    </Field>
                    <Field label="Aggregator" hint="optional handler id">
                      <input className="input" value={aggregator} placeholder="e.g. home.aggregators.merge"
                        onChange={(e) => setAggregator(e.target.value)} />
                    </Field>
                    <Field label="Response Transform" hint="optional" span={2}>
                      <input className="input" value={resTransform} placeholder="e.g. cms.transformers.replaceUriPrefix"
                        onChange={(e) => setResTransform(e.target.value)} />
                    </Field>
                  </>
                ) : (
                  <Field label="Condition Transform" span={2}>
                    <input className="input" value={conditionTransform} placeholder="e.g. routing.conditions.byUserState"
                      onChange={(e) => setConditionTransform(e.target.value)} />
                  </Field>
                )}
              </div>

              <div className="form-section__title" style={{ marginTop: 'var(--space-lg)' }}>Targets</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)' }}>
                {targets.map((t, i) => (
                  <div key={i} className="target-card">
                    <div className="target-card__head">
                      <span className="text-muted">Target {i + 1}</span>
                      <button className="btn btn--tertiary" onClick={() => removeTarget(i)}
                        disabled={targets.length === 1}>Remove</button>
                    </div>
                    <TargetFields t={t} onChange={(p) => updateTargetAt(i, p)} showStopOnError />
                  </div>
                ))}
                <button className="btn btn--secondary" onClick={addTarget} style={{ alignSelf: 'flex-start' }}>
                  + Add target
                </button>
              </div>
            </section>
          )}

          {/* PASS_THROUGH */}
          {routeHandler === 'PASS_THROUGH' && (
            <section className="card">
              <div className="form-section__title">Static Response</div>
              <Field label="Response" hint="raw string returned to the caller" span={2}>
                <textarea className="input" style={{ height: 120, paddingTop: 11, resize: 'vertical' }}
                  value={response} onChange={(e) => setResponse(e.target.value)} />
              </Field>
            </section>
          )}
        </div>

        {/* ── Live JSON preview ── */}
        <aside className="card" style={{ position: 'sticky', top: 'var(--space-lg)' }}>
          <div className="form-section__title">Preview</div>
          <pre style={{
            margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5,
            color: 'var(--color-body)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: '60vh', overflow: 'auto',
          }}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        </aside>
      </div>
    </div>
  );
}

/* ── small presentational helpers ── */

function Field({ label, hint, span, children }: {
  label: string; hint?: string; span?: number; children: React.ReactNode;
}) {
  return (
    <label className="form-field" style={span === 2 ? { gridColumn: '1 / -1' } : undefined}>
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | { label: string; value: string }[];
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function TargetFields({ t, onChange, showStopOnError }: {
  t: TargetForm; onChange: (patch: Partial<TargetForm>) => void; showStopOnError: boolean;
}) {
  return (
    <div className="form-grid">
      <Field label="Name" hint="optional">
        <input className="input" value={t.name} placeholder="e.g. appHomePage"
          onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Target Method">
        <Select value={t.method} onChange={(v) => onChange({ method: v })} options={HTTP_METHODS} />
      </Field>
      <Field label="URL" span={2}>
        <input className="input" value={t.url} placeholder="${CMS_MSME_URL}/app-home-page"
          onChange={(e) => onChange({ url: e.target.value })} />
      </Field>
      <Field label="Timeout — request">
        <input className="input" value={t.timeoutRequest}
          onChange={(e) => onChange({ timeoutRequest: e.target.value })} />
      </Field>
      <Field label="Timeout — socket">
        <input className="input" value={t.timeoutSocket}
          onChange={(e) => onChange({ timeoutSocket: e.target.value })} />
      </Field>
      <Field label="Request Transform" hint="optional">
        <input className="input" value={t.reqTransform} placeholder="general.transformers.moveBodyToQueryParams"
          onChange={(e) => onChange({ reqTransform: e.target.value })} />
      </Field>
      <Field label="Response Transform" hint="optional">
        <input className="input" value={t.resTransform} placeholder="cms.transformers.replaceUriPrefix"
          onChange={(e) => onChange({ resTransform: e.target.value })} />
      </Field>
      {showStopOnError && (
        <Field label="Stop On Error">
          <Select value={t.stopOnError} onChange={(v) => onChange({ stopOnError: v })}
            options={BOOL_OPTIONS} />
        </Field>
      )}
    </div>
  );
}
