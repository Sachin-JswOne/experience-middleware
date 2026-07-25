# PR Review Context

The Claude Code review workflow (`.github/workflows/claude-code-review.yaml`)
looks for two optional files here, keyed by **feature branch name** (not PR
number, since the branch exists before a PR does):

```
.github/reviews/<branch-name>/jira.md
.github/reviews/<branch-name>/testcases.md
```

Branch names with slashes (e.g. `feature/order-tracking`) nest naturally,
e.g. `.github/reviews/feature/order-tracking/jira.md`.

- `jira.md` — Jira ticket link/key, summary, acceptance criteria. If it
  contains a live Jira link or issue key, the review fetches that issue and
  treats it as the source of truth over the file's text.
- `testcases.md` — the scenarios the PR's tests are expected to cover.

Both are optional — if missing, the review says so explicitly and proceeds
without them.

See [`sample/`](sample/) for example files showing the expected format. That
folder is reference only and is never read by the workflow itself.

Clean up or update your branch's folder when reusing/renaming a branch —
nothing enforces that the contents stay in sync with the branch's current PR.
