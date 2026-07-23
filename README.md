<p align="center">
  <img src="https://nodejs.org/static/images/logo.svg" width="60" alt="Node.js Logo" />
  <img src="https://nestjs.com/img/logo-small.svg" width="60" alt="NestJS Logo" />
  <img src="https://raw.githubusercontent.com/remojansen/logo.ts/master/ts.png" width="60" alt="TypeScript Logo" />
  <img src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg" width="66" alt="React Logo" />
  <img src="https://vitejs.dev/logo.svg" width="60" alt="Vite Logo" />
</p>

<h1 align="center">JSWONE Experience Middleware</h1>

<p align="center">
  <b>A robust, extensible Backend-for-Frontend (BFF) and API Gateway layer for JSWONE — NestJS + TypeScript backend with a built-in React observability dashboard.</b>
</p>

<p align="center">
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="https://nestjs.com/" target="_blank"><img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" alt="NestJS" /></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://react.dev/" target="_blank"><img src="https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://vite.dev/" target="_blank"><img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://mui.com/" target="_blank"><img src="https://img.shields.io/badge/MUI_6-007FFF?logo=mui&logoColor=white" alt="MUI" /></a>
</p>

---

## About This Project

**Experience Middleware** is the config-driven API gateway (BFF) for the JSW One CCP/MSME
platform. It sits between the frontend apps and the downstream services (MSME SSR, OMS,
ERP connector, CMS, Salesforce, Homes, TMS, …) and aggregates, transforms, and proxies
requests to deliver frontend-ready responses.

### Key capabilities

- **Config-driven routing** — routes are declared in JSON (`src/assets/route-config.json`
  plus `src/assets/fe-route-config.json` for dashboard routes). Each route is a `PROXY`,
  a `TRANSFORM` (request/response reshaping in `src/transformations/`), or an `AGGREGATE`
  (fan out to several targets, merge the responses). Target URLs use `${ENV_VAR}`
  placeholders resolved at boot.
- **Caching** — Valkey (Redis-compatible) with an in-memory fallback layer, TTL + jitter,
  per-route cache rules.
- **Built-in observability** — every request feeds a metrics pipeline (in-memory
  aggregation, optional cluster-wide Valkey counters) rendered by a React dashboard
  served from this same service; OpenTelemetry traces/metrics export alongside it.
- **Server-side alerting** — threshold + SLO burn-rate evaluation posting to a
  Slack/Teams-compatible webhook, sharing one rule set with the dashboard.

### How it works

- All routes are prefixed with `/xp-mi` (e.g. `/xp-mi/public/v1/app-home-page`).
- Route behavior is defined in `src/assets/route-config.json`; `${VAR}` placeholders in
  target URLs/headers resolve from the process environment first, then from
  `src/assets/<APP_ENV>/env-config.json`.
- Each route specifies its handler (`PROXY`, `TRANSFORM`, `AGGREGATE`), targets,
  timeouts, cache rules, and optional transformer functions.

```json
{
  "path": "/xp-mi/public/v1/app-home-page",
  "method": "POST",
  "routeHandler": "AGGREGATE",
  "aggregationType": "PARALLEL",
  "targets": [
    { "name": "app-home-page", "url": "${CMS_MSME_URL}/app-home-page" },
    { "name": "app-top-items", "url": "${RETAIL_URL}/v3/seller/top-product" },
    { "name": "app-buy-again", "url": "${RETAIL_URL}/v1/seller/buy-again" }
  ],
  "resTransform": "app.transformers.mergeHomePageResponses"
}
```

## Repository layout

| Path                               | What lives here                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                      | Nest bootstrap, CORS, port                                                                                                |
| `src/instrumentation.ts`           | OpenTelemetry SDK setup (loaded before Nest)                                                                              |
| `src/config/route.config.ts`       | Loads + merges route configs, resolves `${ENV_VAR}` placeholders                                                          |
| `src/config/app.config.ts`         | App-level constants, timeouts, product mappings                                                                           |
| `src/assets/route-config.json`     | Main gateway route declarations                                                                                           |
| `src/assets/fe-route-config.json`  | Routes used by the dashboard frontend (merged in)                                                                         |
| `src/assets/<env>/env-config.json` | Per-environment defaults for route placeholders (`dev`/`qa`/`preprod`/`prod`)                                             |
| `src/service/`                     | Proxy engine, downstream HTTP client                                                                                      |
| `src/transformations/`             | Request/response transformers (one file per domain) + specs                                                               |
| `src/cache/`                       | Valkey client/config/properties, cache service, trust store                                                               |
| `src/metrics/`                     | Metrics pipeline: interceptor, aggregator, publisher, cluster store, sample store, health, alerts, auth guard, controller |
| `src/logger/`                      | Winston config (trace-id aware)                                                                                           |
| `frontend/`                        | React 19 + MUI + recharts admin UI (login, observability dashboard, prompts)                                              |
| `e2e/`                             | Playwright smoke tests for the dashboard                                                                                  |
| `dist-frontend/`                   | Built frontend assets (output of `npm run build:frontend`)                                                                |

## The observability dashboard

Served at `/` after login. Four tabs:

- **Overview** — summary cards with previous-window deltas, request timeline
  (drag-to-zoom, deploy markers, previous-window ghost line), latency heatmap (cells
  drill through to request samples), status-class timeline, cluster-wide recent errors,
  top movers (latency/error regressions vs the previous window), SLO card (availability,
  error budget, P99, Apdex), weekly traffic pattern (7d+ ranges).
- **Routes** — sortable per-route table (p95, 4xx/5xx, cache hit) with CSV export,
  samples drawer (request/response bodies, cURL copy, per-route trend chart,
  request-id → logs deep link), cache-opportunities panel.
- **Downstream** — per-target timelines (avg/p95 toggle), latency/status/stage charts,
  route→target dependency map, route-scoped filtering.
- **System** — per-pod CPU, GC, heap/RSS, event-loop lag with trend sparklines, restart
  badges, Valkey status.

Alert thresholds are edited from the bell icon. In cluster mode
(`METRICS_CLUSTER_ENABLED=true`) they are stored in Valkey and shared with the
server-side webhook evaluator — one rule set for browsers and paging. Dashboard state
(tab, range, filters) is URL-synced, so views can be deep-linked and saved as named
views.

## Getting started

```bash
npm install
cd frontend && npm install && cd ..

# development: backend on :3000, frontend dev server on :5173 (proxies /xp-mi)
npm run start:dev
cd frontend && npm run dev

# production build (frontend + backend), then run
npm run build
npm run start:prod
```

### Tests

```bash
npm test              # backend jest suite
npm run test:fe       # frontend vitest suite
npm run test:cov      # backend coverage
npm run e2e           # playwright smoke (one-time: npx playwright install chromium)
```

## Environment variables

Everything below is read from the process environment — in Kubernetes, set them through
the Helm values (`env:` / ConfigMap for plain values, Secret for anything marked
**secret**). "Default" is what the code falls back to when the variable is unset.

### Core server

| Variable              | Default                  | Purpose                                                                                       |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `PORT`                | `3000`                   | HTTP listen port                                                                              |
| `APP_ENV`             | `dev`                    | Selects `src/assets/<APP_ENV>/env-config.json` and turns metrics auth on when `prod`          |
| `NODE_ENV`            | —                        | Standard Node env; also last-resort cache profile                                             |
| `ALLOWED_ORIGINS`     | built-in JSW domain list | Comma-separated **regex** list for CORS; unset uses the hardcoded jswone/jswonehomes patterns |
| `LOG_LEVEL`           | `info`                   | Winston level; `debug` also enables verbose transformer logging                               |
| `REQUEST_TIMEOUT`     | `5000`                   | Default downstream request timeout (ms)                                                       |
| `REQUEST_TIMEOUT_MIN` | `3000`                   | Minimum downstream request timeout (ms)                                                       |
| `SOCKET_TIMEOUT`      | `1000`                   | Default downstream socket timeout (ms)                                                        |
| `JWT_SECRET`          | — (**secret**)           | Verifies dashboard login tokens on the metrics endpoints                                      |

### Downstream targets (route-config placeholders)

`${VAR}` placeholders in the route configs resolve from the process environment first,
then from `src/assets/<APP_ENV>/env-config.json`. The per-env JSON already carries
defaults for each environment, so in Helm you only need to override what differs —
secrets should always come from Helm/Secret Manager, not the JSON.

Base URLs: `MSME_BASE_URL`, `CMS_MSME_URL`, `EXPERIENCE_MIDDLEWARE_URL`, `SF_BASE_URI`,
`RETAIL_URL`, `HOMES_SERVICE_URL`, `HOMES_CMS_URL`, `OMS_URL`, `ERP_BASE_URI`,
`ERP_BASE_URL`, `TMS_BASE_URI`, `CATALOGUE_ADMIN_API_BASE_URL`, `AUTH2_SERVICE_BASE_URL`,
`GOOGLE_MAPS_URL`, `PATH_URL`.

Credentials/keys (**all secret**): `X_API_KEY_FOR_LOGIN`, `X_API_KEY_FOR_ORDER_LISTING`,
`X_API_KEY_FOR_REGISTRATION`, `X_API_KEY_CONNECTOR`, `GSTIN_X_API_KEY`,
`CUSTOMER_SERVICE_X_API_KEY`, `ONE_HELIX_TASK_API_AUTHORIZATION`,
`TMS_AUTH_TOKEN_ORDER_LISTING`, `OMS_CLIENT_ID_VIJAI`, `OMS_AUTH_FETCH_CREDIT_INFO_VIJAI`,
`ERP_CLIENT_ID`, `GOOGLE_MAPS_API_KEY`.

### Salesforce (sales app integration)

| Variable                                                                              | Default        | Purpose                                                 |
| ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| `SF_SALES_APP_CLIENT_ID` / `SF_SALES_APP_CLIENT_SECRET`                               | — (**secret**) | OAuth client for the sales app flow                     |
| `SF_SALES_APP_REDIRECT_URI`                                                           | —              | OAuth redirect URI                                      |
| `SF_CLIENT_ID` / `SF_CLIENT_SECRET` / `SF_USERNAME` / `SF_PASSWORD` / `SF_GRANT_TYPE` | — (**secret**) | Salesforce API login (password grant)                   |
| `SF_TASK_RECORD_TYPE_ID` / `SF_TASK_OWNER_ID`                                         | —              | IDs stamped on Salesforce tasks created by transformers |

### CMS assets

| Variable                | Default                          | Purpose                                      |
| ----------------------- | -------------------------------- | -------------------------------------------- |
| `CMS_ASSETS_BUCKET_URL` | `https://default-bucket-url.com` | Origin bucket URL rewritten in CMS responses |
| `CMS_ASSETS_CDN_URL`    | `https://default-cdn-url.com`    | CDN URL substituted for the bucket URL       |

### Cache / Valkey

| Variable                              | Default                                                     | Purpose                                                                         |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CACHE_ENABLED`                       | `false`                                                     | Master switch for response caching                                              |
| `CACHE_PROVIDER`                      | `AUTO`                                                      | `AUTO` / `VALKEY` / `LOCAL`; `AUTO` prefers Valkey and falls back to in-memory  |
| `CACHE_PROFILE` (or `VALKEY_PROFILE`) | `NODE_ENV` → `local`                                        | Picks the CA-cert secret and connection profile (`local`/`qa`/`preprod`/`prod`) |
| `CACHE_TTL_SECONDS`                   | `300`                                                       | Base TTL for cached responses                                                   |
| `CACHE_TTL_JITTER_SECONDS`            | `300`                                                       | Random extra TTL (0..n) to avoid thundering expiry                              |
| `VALKEY_CLUSTER_ENABLED`              | `false`                                                     | Connect in cluster mode                                                         |
| `VALKEY_CLUSTER_NODES`                | —                                                           | Comma-separated `host:port` list (required when cluster mode on)                |
| `VALKEY_HOST` / `VALKEY_PORT`         | — / `6379`                                                  | Standalone connection                                                           |
| `VALKEY_PASSWORD`                     | — (**secret**)                                              | AUTH password                                                                   |
| `VALKEY_SSL`                          | `false`                                                     | TLS on/off                                                                      |
| `VALKEY_TIMEOUT_MILLIS`               | `1500`                                                      | Command/connect timeout                                                         |
| `VALKEY_FAIL_STARTUP`                 | `false`                                                     | Crash on boot if Valkey is unreachable (default: degrade to local cache)        |
| `VALKEY_CA_CERT_PATH`                 | —                                                           | CA cert file path (required for `local` profile with SSL)                       |
| `VALKEY_CA_CERT_SECRET`               | per-profile (`VALKEY_CA_CERTIFICATE_QA`/`_PREPROD`/`_PROD`) | GCP Secret Manager secret holding the CA cert                                   |
| `GCP_PROJECT_ID`                      | —                                                           | Project for Secret Manager lookups                                              |
| `GCP_CREDENTIALS_ENCODED_KEY`         | — (**secret**)                                              | Base64 service-account key for Secret Manager                                   |

### Metrics pipeline (dashboard data)

| Variable                                | Default            | Purpose                                                                                                                         |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `METRICS_CLUSTER_ENABLED`               | `false`            | Publish counters, samples, heartbeats and deploy markers to Valkey so the dashboard shows **all pods**. Off = per-pod view only |
| `METRICS_KEY_PREFIX`                    | `emw:metrics`      | Valkey key namespace                                                                                                            |
| `METRICS_RETENTION_MS`                  | `2592000000` (30d) | Hourly-rollup retention = the maximum query window                                                                              |
| `METRICS_MINUTE_RETENTION_MS`           | `22200000` (6h10m) | Minute-granularity counter retention (serves windows ≤ 6h)                                                                      |
| `METRICS_LOCAL_RETENTION_MS`            | `3600000` (1h)     | In-memory request buffer horizon per pod                                                                                        |
| `METRICS_MAX_RECORDS`                   | `250000`           | Hard cap on the in-memory buffer                                                                                                |
| `METRICS_FLUSH_INTERVAL_MS`             | `10000`            | How often counters/samples flush to Valkey                                                                                      |
| `METRICS_SAMPLES_ENABLED`               | `true`             | Capture request/response samples for the drawer (`false` disables)                                                              |
| `METRICS_MAX_SAMPLES_PER_ROUTE`         | `20`               | Error samples kept per route                                                                                                    |
| `METRICS_MAX_SUCCESS_SAMPLES_PER_ROUTE` | `10`               | Success samples kept per route                                                                                                  |
| `METRICS_MAX_SLOW_SAMPLES_PER_ROUTE`    | `10`               | Slow samples kept per route                                                                                                     |
| `METRICS_SLOW_SAMPLE_THRESHOLD_MS`      | `3000`             | Duration at which a request counts as "slow"                                                                                    |

### Metrics endpoint auth

| Variable                    | Default                                                      | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `METRICS_AUTH_ENFORCED`     | auto (`true` when `APP_ENV=prod`)                            | Require a valid token on `/metrics*` outside prod too              |
| `METRICS_AUTH_DISABLED`     | `false`                                                      | Kill switch — turns the guard off entirely                         |
| `METRICS_AUTH_TOKEN`        | — (**secret**)                                               | Static token for scripts/monitors via the `x-metrics-token` header |
| `METRICS_AUTH_VALIDATE_URL` | self (`http://127.0.0.1:$PORT/xp-mi/public/v1/auth/user/me`) | Endpoint used to validate UAM-issued tokens                        |

### Server-side alerting (webhook)

Alerting activates when `METRICS_ALERT_WEBHOOK_URL` is set. Thresholds saved from the
dashboard (cluster mode) take precedence; the threshold vars below are the fallback until
someone saves a config from the UI. Payload is `{"text": "..."}` — works for both Slack
and Teams incoming webhooks.

| Variable                              | Default                                 | Purpose                                                                                                  |
| ------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `METRICS_ALERT_WEBHOOK_URL`           | — (**secret**, alerting off when unset) | Where breach messages are POSTed                                                                         |
| `METRICS_ALERT_ERROR_RATE_PCT`        | — (off)                                 | Alert when overall error rate ≥ this %                                                                   |
| `METRICS_ALERT_P99_MS`                | — (off)                                 | Alert when p99 latency ≥ this (ms)                                                                       |
| `METRICS_ALERT_TARGET_ERROR_RATE_PCT` | — (off)                                 | Alert when any downstream target's error rate ≥ this %                                                   |
| `METRICS_ALERT_TRAFFIC_DROP_PCT`      | — (off)                                 | Alert when traffic drops ≥ this % vs the previous window                                                 |
| `METRICS_ALERT_SLO_AVAILABILITY_PCT`  | — (off)                                 | Availability SLO (e.g. `99.5`) for multiwindow burn-rate alerts (14.4× over 5m AND 6× over 1h)           |
| `METRICS_ALERT_WINDOW_MS`             | `300000` (5m)                           | Evaluation window                                                                                        |
| `METRICS_ALERT_EVAL_INTERVAL_MS`      | `60000`                                 | How often thresholds are evaluated                                                                       |
| `METRICS_ALERT_COOLDOWN_MS`           | `900000` (15m)                          | Minimum gap between repeats of the same breach (Valkey `SET NX` in cluster mode → exactly one pod posts) |
| `METRICS_ALERT_MIN_REQUESTS`          | `10`                                    | Ignore windows/targets with less traffic than this                                                       |

### OpenTelemetry

| Variable                               | Default                            | Purpose                                              |
| -------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `OTEL_ENABLED`                         | `false`                            | Master switch for the OTEL SDK                       |
| `OTEL_SERVICE_NAME`                    | `experience-middleware`            | Service name on traces/metrics                       |
| `OTEL_EXPORTER_OTLP_ENDPOINT`          | `http://localhost:4318/v1/traces`  | OTLP base endpoint (traces fallback)                 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`   | falls back to the above            | Trace-specific endpoint                              |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`  | `http://localhost:4318/v1/metrics` | Metrics endpoint                                     |
| `OTEL_EXPORTER_OTLP_HEADERS`           | `{}`                               | JSON object of headers (e.g. auth) for the exporters |
| `OTEL_LOG_LEVEL`                       | —                                  | `debug`/`verbose` for SDK diagnostics                |
| `OTEL_METRIC_EXPORT_INTERVAL`          | SDK default                        | Metric export cadence (ms)                           |
| `OTEL_INSTRUMENTATION_FS_ENABLED`      | `false`                            | Enable fs auto-instrumentation                       |
| `OTEL_INSTRUMENTATION_RUNTIME_ENABLED` | `false`                            | Enable runtime metrics instrumentation               |
| `OTEL_RESOURCE_ATTRIBUTES`             | —                                  | Extra `key=value,key=value` resource attributes      |
| `SERVICE_VERSION`                      | package version                    | `service.version` resource attribute                 |
| `SERVICE_TEAM`                         | `ccp`                              | `service.team` resource attribute                    |
| `ENVIRONMENT`                          | `NODE_ENV` → `development`         | `deployment.environment` resource attribute          |

### Pod identity (usually injected by Kubernetes)

| Variable                       | Default   | Purpose                                                 |
| ------------------------------ | --------- | ------------------------------------------------------- |
| `HOSTNAME`                     | `local`   | Pod name shown on the System tab, error feed and alerts |
| `APP_VERSION` (or `IMAGE_TAG`) | `unknown` | Version shown per pod and stamped on deploy markers     |

### Frontend build-time (Vite — baked in at `npm run build:frontend`)

| Variable                | Default | Purpose                                                                                                                                                |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_LOG_URL_TEMPLATE` | —       | Log-store deep-link template; `{requestId}` is substituted (e.g. a Kibana Discover URL). Unset → request-id chips copy to clipboard instead of linking |

## Helm checklist

Minimum for a production pod, beyond the downstream URLs/keys your environment already
sets:

```yaml
env:
  - { name: APP_ENV, value: 'prod' }
  - { name: CACHE_ENABLED, value: 'true' }
  - { name: CACHE_PROFILE, value: 'prod' }
  - { name: VALKEY_HOST, value: '<valkey-host>' } # or VALKEY_CLUSTER_*
  - { name: VALKEY_SSL, value: 'true' }
  - { name: METRICS_CLUSTER_ENABLED, value: 'true' } # all-pod dashboard
  - { name: OTEL_ENABLED, value: 'true' }
  - { name: METRICS_ALERT_WEBHOOK_URL, valueFrom: { secretKeyRef: ... } } # enables paging
  - { name: JWT_SECRET, valueFrom: { secretKeyRef: ... } }
  - { name: VALKEY_PASSWORD, valueFrom: { secretKeyRef: ... } }
```

`METRICS_RETENTION_MS`, sample quotas and alert thresholds have sensible defaults —
override only when tuning. Alert thresholds are normally managed from the dashboard UI
once the service is up (stored in Valkey, shared across pods and browsers).

---

## Authors

- Sachin Sharma — sachin.sharma@jsw.in
- Shubham Bansal — shubham.bansal@jsw.in

## Support

JSWONE Experience Middleware is maintained by the CCP Team.

## Contact For Support

- Sachin Sharma — sachin.sharma@jsw.in
- Shubham Bansal — shubham.bansal@jsw.in
