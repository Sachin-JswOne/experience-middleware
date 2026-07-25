# Jira Reference

**Issue:** JSWOC-21490
**Link:** https://jswone.atlassian.net/browse/JSWOC-21490

## Summary

`ProxyService.handleTransformRequest` (`src/service/proxy.service.ts`, around
lines 456–528) unconditionally logs the full raw downstream **request body**
and **response payload** on every single proxied call, at `logger.log` (info
level — always on in production).

This is inconsistent with the rest of the codebase: every transformer in
`src/transformations/*` gates verbose response logging behind `safeDebug` /
`LOG_LEVEL=debug` (see `src/utils/common-functions.util.ts`), specifically so
this kind of payload isn't written to production logs by default.
`handleTransformRequest` is the single highest-traffic log line in the
service — it runs once per downstream call, for every route.

### Concrete impact

- Request headers get partial masking (`authorization` / `Authorization` /
  `access_token`), but the **request body itself is logged raw**
  (`JSON.stringify(transformedRequestBody.body ?? null)`). Routes such as
  `/v1/verify-passcode`, `/v1/reset-password`, and `/v1/register-user` send
  passwords, OTP codes, and other PII in the body — these currently land in
  logs in cleartext.
- The **response body** is logged raw via `inspect(responseData)`, also
  unconditionally — auth/token responses and KYC data are included.
- Because this runs at info level (not gated by `LOG_LEVEL=debug` like
  everywhere else), it also meaningfully inflates log volume/cost relative to
  the rest of the app.

## Acceptance Criteria

- [ ] Full downstream request/response payload logging in
      `handleTransformRequest` is gated behind `LOG_LEVEL=debug` (via
      `safeDebug`, consistent with the rest of the codebase) instead of
      unconditional `logger.log`.
- [ ] Sensitive fields (passwords, OTP codes, tokens/secrets) are
      masked/redacted before being logged, even at debug level — not just the
      `Authorization` header.
- [ ] Existing operational logging (target name, route, HTTP status,
      build/downstream/transform durations) stays at `logger.log`/info level
      unchanged — this is a logging-hygiene fix, not a reduction in
      observability.
- [ ] No change to request/response handling or business logic — logging
      only.

## Notes

- Real context files for a PR go in `.github/reviews/<branch-name>/`, keyed
  by feature branch name (this one: `feature/code-review`), so they can be
  committed before a PR number exists. See `.github/reviews/README.md`.
- See `.github/reviews/sample/` for an unrelated example of this file's
  format.
