# Test Cases — app-order-tracking aggregate route

Scenarios expected to be covered by tests in this PR, mapped against the
acceptance criteria in `jira.md`.

| # | Scenario | Type |
|---|----------|------|
| 1 | Registered user with a valid order ID gets combined order status + courier ETA | Happy path |
| 2 | Courier API times out — response still includes order status, omits ETA gracefully | Resilience |
| 3 | Courier API returns 500 — response still includes order status, omits ETA gracefully | Resilience |
| 4 | Order service (JOMS) errors — whole request fails with a clear error message | Error handling |
| 5 | Guest user (no `SF-ID`/`CT-ID`) calling the route receives 401 | Auth |
| 6 | Unknown/invalid order ID returns 404, not a 500 | Edge case |
| 7 | Aggregate response shape matches the documented contract (order status + tracking history + ETA fields) | Contract |

## Notes for reviewer

- Test names should map 1:1 to the rows above where practical.
- Any row without a matching test in the PR should be called out explicitly
  in the coverage table the review produces.
- This is a **sample** for reference only — not a real test plan. Real
  context files go in `.github/reviews/<branch-name>/testcases.md`, keyed by
  feature branch name so they can be committed before a PR exists.
