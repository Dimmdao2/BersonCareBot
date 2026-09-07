# C3M auditor-live — communications enforcement

Read the `AGENTS.md` heading map before every action, then the migration/privilege rules if schema changed, §4/§4a,
§5, §9, §10/§10a/§10b, §12, §15–§22 and §24 in full. Read `README.md`, current roadmap C3M in full, all accepted
prerequisite slices, communications/chat/comments/media/mailings docs and the candidate diff.

Candidate: `5283a3ff3` on `wt/c3m-communications-slice-20260907`. Exact audit scope is
`apps/webapp/**,apps/integrator/**,deploy/postgres/**`; the integrator delivery worker and signed webapp
workspace-status seam are part of the required C3M-09 path, not an out-of-scope expansion.

Taskdb workstream: `#1098`.

Источник оракула: roadmap C3M-09 — filter Communications tabs/default; enforce chat ensure/read/write, unread,
snapshots, payment-link-to-chat, comments/media and mailing read/write; stop corresponding jobs/notifications, not
only buttons.

## Тест или взгляд

- Client-policy precedence, route/action denial, tab/default selection, hidden work and tenant isolation are stable
  behavior for blind tests.
- Tabs, badges and control absence on desktop/mobile are live checks; no text/DOM/count/source/snapshot tests.
- Migration/backfill/privileges and one-resolver architecture are direct inspection/preflight facts.

Before existing tests, define faults for: explicit override not beating default; inherited `on_support` ignoring the
one `onSupport`; chat bypass through ensure/read/write/snapshot/unread/payment-link/notifications; comments/media
bypass or broken parent dependencies; mailing accidentally depending on chat/support; hidden tabs still loading or
polling; no effective tab not removing Communications; queued mailing work still reaching provider dispatch after
`mailings=OFF`; signed integrator status lookups accepting an invalid tenant/signature or leaking another tenant;
OFF→ON data loss; two-org leakage; and stored child/client preferences overwritten by parent OFF.

Add only missing durable behavior tests and fault-inject each class once. Live-check desktop/mobile on an isolated
port. Run targeted tests, typecheck, scoped ESLint, architecture/migration/privilege checks and diff-check; no full
CI. Commit only tests and one artifact, never product fixes. Findings need reachable impact and authority. Explicit
paths only, `#1098`, candidate SHA/evidence; never `git add -A` or push.

If an existing in-scope test encountered during the audit checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
