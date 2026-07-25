# Test Cases — sensitive-data logging fix in `handleTransformRequest`

Scenarios expected to be covered by tests in this PR, mapped against the
acceptance criteria in `jira.md`.

| # | Scenario | Type |
|---|----------|------|
| 1 | Default/production log level (no `LOG_LEVEL=debug`) — a request to a route whose body contains a password/OTP field does NOT write the raw request body to logs | Security / regression |
| 2 | Default/production log level — the raw downstream response body is NOT written to logs | Security / regression |
| 3 | `LOG_LEVEL=debug` — downstream request/response is logged, but password/OTP/token fields appear masked or omitted, not in cleartext | Security |
| 4 | `LOG_LEVEL=debug` — a field not in the sensitive list (e.g. an order ID) still logs normally, so debugging isn't crippled by over-redaction | Regression |
| 5 | `Authorization` / `access_token` header masking behavior is unchanged at both log levels | Regression |
| 6 | Target duration/status metadata (`build_ms`, `downstream_ms`, `res_transform_ms`, HTTP status) is still logged at info level as before | Regression |
| 7 | A route with no sensitive fields in its body (e.g. `GET /health`) logs with no behavior change | Edge case |
| 8 | Large response body truncation/preview in tracing span attributes (existing 1000-char truncation) is unaffected | Regression |

## Notes for reviewer

- Test names should map 1:1 to the rows above where practical.
- Any row without a matching test in the PR should be called out explicitly
  in the coverage table the review produces.
- Real context files for a PR go in `.github/reviews/<branch-name>/`, keyed
  by feature branch name (this one: `feature/code-review`). See
  `.github/reviews/README.md`.
