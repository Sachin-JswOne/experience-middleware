# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `pnpm install` (both `package-lock.json` and `pnpm-lock.yaml` are present; README/scripts assume pnpm)
- Dev server, watch mode: `npm run start:dev`
- Debug (inspector + watch): `npm run start:debug`
- Build: `npm run build` / Prod start: `npm run start:prod` (runs `dist/main`)
- Lint: `npm run lint` — autofix: `npm run lint:fix`
- Format: `npm run format` (Prettier)
- Lint + format together: `npm run cleanup`
- Run all tests: `npm test` — watch mode: `npm run test:watch` — coverage: `npm run test:cov`
- Run a single test file: `npx jest path/to/file.spec.ts` (Jest `rootDir` is `src`; only `*.spec.ts` files match)
- Run a single test by name: `npx jest -t "test name"`
- Debug a test: `npm run test:debug`
- E2E tests: `npm run test:e2e` (separate config at `test/jest-e2e.json`)
- A pre-commit hook (Husky → `lint-staged`) runs `eslint --fix` + `prettier` on staged `.ts`/`.js`, and `prettier` on staged `.json`/`.md`/`.yml` — don't bypass it with `--no-verify`.

## Architecture

This is a config-driven BFF/API gateway: there is effectively **one controller and one service**, and almost all behavior is defined in JSON, not TypeScript.

- **Single entry point**: `main.ts` sets the global prefix `xp-mi`. Every request matches the single wildcard route `public/*path` in `src/controller/proxy.controller.ts`, which does nothing but delegate to `src/service/proxy.service.ts` (`ProxyService.handleRequest`) and map the result/error to an HTTP response.
- **Routes live in config, not code**: `src/assets/route-config.json` is a single list (currently 142 entries) shared across all environments. Per-environment values (URLs, secrets, timeouts) come from `src/assets/{dev,qa,preprod,prod}/env-config.json` and are substituted into `${VAR}` / `${VAR.nested}` placeholders by `replaceEnvPlaceholders` in `src/config/route.config.ts` — a real `process.env` var always wins over `env-config.json`. To add or change an endpoint, edit `route-config.json` (and `env-config.json` if a new per-env value is needed); avoid touching `ProxyService` itself. `ROUTES.md` at the repo root is a maintained human-readable index of live routes — check it before adding a route, and update it when adding one.
- **Route handler types** (`RouteHandler` enum) dispatch inside `ProxyService.handleRequest`:
  - `TRANSFORM` — one target, optional req/res transform.
  - `PASS_THROUGH` — returns a static canned `response`, no downstream call.
  - `AGGREGATE` — multiple `targets`, combined per `aggregationType` (`PARALLEL` / `SEQUENTIAL` / `SEQUENTIAL_THEN_PARALLEL`).
  - `CONDITIONAL` — branches to different target sets via a `conditionTransform` function; used for guest-vs-registered-user flows (see the `*-v3-guest*` / `*-v3-registered*` route pairs in `ROUTES.md`).
- **Transformers are resolved dynamically by string name**, not imported directly. A route's `reqTransform`/`resTransform` (e.g. `"app.transformers.mergeHomePageResponses"`) is loaded at request time via `import()` in `src/utils/transformer.util.ts` (`applyTransform`). Implementations live in `src/transformations/` (~35 files). Adding a transform means adding a function there and referencing it by name in the config.
- **Auth is per-target, not global**: `src/interceptors/auth.interceptors.ts` (`decryptAndAddUserDetails`) decodes the JWT (`jwt.verify` against a shared secret, no issuer/audience check), strips the `Authorization` header, and injects `SF-ID`/`CT-ID` headers for the downstream call. It only runs on targets that list it in their `interceptors` array in `route-config.json`, wired up via `getInterceptor` in `transformer.util.ts` and attached to the Axios client in `src/utils/http-client.factory.ts`.
- **Per-request identity propagation**: `sfId`/`ctId` are also captured into `AsyncLocalStorage`-backed request context (`src/utils/request-context.util.ts`, populated by `src/utils/request-context.middleware.ts`), so downstream code can read them without threading them through call arguments.
- **Redis caching is currently disabled**: `src/redis/redis.module.ts` sets up an `ioredis` client, and route configs still carry `isCacheRequired`, but the actual cache read/write block in `ProxyService.handleRequest` is commented out pending a Valkey migration. Don't assume responses are cached just because `isCacheRequired: true` appears in a route.
- **Mocking downstream services**: any target can declare `"mock": { "file": "..." }` (files under `src/assets/mocks/`, path relative to it). It is inert unless `MOCK_ENABLED=true`, which is itself ignored outside `local`/`dev`/`qa`. Only the network call is replaced — `reqTransform` validation and `resTransform` still run, and a mock `status` of 400+ raises a real downstream failure. `MOCK_TARGETS` narrows it to named targets. See `MOCKING.md`.
- **Tracing**: `src/instrumentation.ts` bootstraps OpenTelemetry auto-instrumentation and must stay the first import in `main.ts`. `TraceContextInterceptor` (`src/common/`) attaches trace/span IDs to the request object for log correlation.
- **Error propagation**: `CustomError` (`src/utils/CustomError.ts`) carries an `httpStatusCode` and a `downstreamResponse` payload. `ProxyController`'s catch block prefers re-emitting that captured downstream response/status verbatim over synthesizing a new error body, so upstream service failures reach the client close to their original shape.
