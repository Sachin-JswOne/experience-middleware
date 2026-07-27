# Jira Reference

**Issue:** PROJ-1234
**Link:** https://jsw.atlassian.net/browse/PROJ-1234

## Summary

Add a new AGGREGATE route `/xp-mi/public/v1/app-order-tracking` that combines
order status (from `jsw_order_service` / JOMS) with delivery ETA (from a
courier partner API) into a single response for the mobile app's order
tracking screen.

## Acceptance Criteria

- [ ] New route is defined in `route-config.json` with `routeHandler: AGGREGATE`
      and `aggregationType: PARALLEL`.
- [ ] Response includes order status, tracking history, and estimated delivery
      date in one payload.
- [ ] If the courier API times out or errors, the endpoint still returns order
      status — courier data is optional, not blocking.
- [ ] Only registered users can call this route (`SF-ID`/`CT-ID` must be
      present); guests receive `401`.
- [ ] Aggregate response time stays under 2s at p95 under normal load.

## Notes

- This is a **sample** for reference only — not a real ticket. Real context
  files go in `.github/reviews/<branch-name>/jira.md`, keyed by the feature
  branch name (see `.github/workflows/claude-code-review.yaml`), so they can
  be committed before a PR number exists.
- When this file contains a live Jira link or issue key, the review workflow
  fetches that issue directly from Jira and treats it as the source of truth
  over any text pasted here.
