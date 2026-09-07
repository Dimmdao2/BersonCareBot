# C3M-09 independent behavior audit — continuation after system interruption

Read the `AGENTS.md` heading map before every action, then §1 migration/privilege rules, §4/§4a, §5, §9,
§10/§10a/§10b, §12 and §24 in full. Read `README.md`, the whole current C3M section, accepted prerequisites,
communications/chat/comments/media/mailings docs and candidate diff.

Taskdb workstream: `#1098`. Binding authority/checklist:
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner decisions, C3M-09 and C3M.8.
Candidate product is `5283a3ff3` on `wt/c3m-communications-slice-20260907`. Exact scope:
`apps/webapp/**,apps/integrator/**,deploy/postgres/**`.

## Тест или взгляд

- Client-policy precedence, route/action denial, hidden work, queued-delivery denial and tenant isolation are
  repeatable behavior and require blind tests plus fault injection.
- Migration ownership/backfill, central privilege declaration/generated parity and one-resolver architecture are
  direct inspection/static-check facts; never create source/SQL wording tests for them.
- Responsive tabs, controls and layout require live inspection, but are explicitly deferred to the following
  bounded live pass and are not claimed by this run.

The preceding run `c3m-communications-audit-20260907` ended at the runner system boundary with a clean tree: it
left no tests, artifact, commit or verdict. Its narrative is not acceptance. This run must complete the independent
behavior/static audit. Live responsive UI and named-DEV rollback preflight are deliberately a later bounded audit
pass so this run can finish coherently.

Before reading existing tests, write the blind kill-set from C3M-09/C3M.8 into the audit artifact. It must cover:
override precedence and inherited `on_support`; chat ensure/read/write/snapshot/unread/payment-link/notification
bypasses; comments/media read/write and parent dependencies; hidden tabs/badges/preloads/pollers; Communications
absence/default-tab behavior; mailing independence from chat/support; queued broadcast work after `mailings=OFF`;
signed integrator status authentication and tenant isolation; OFF→ON preservation; two-organization isolation; and
parent OFF preserving stored child/client choices.

Inspect production wiring and add only missing durable behavior tests. For every named fault, either demonstrate a
red acceptance test on the candidate or fault-inject once and show the test goes red, then restore all production
mutations. In particular inspect the integrator delivery-time gate, its failure behavior and every real runtime
caller; do not accept a button-only or enqueue-only mailing gate. Inspect migration ownership, backfill and central
privilege declaration/generated parity directly; do not test SQL/source wording.

Delete any encountered in-scope test that checks source/SQL wording, formatting, function/DOM shape, labels or
counts instead of behavior. Do not add UI wording/DOM/snapshot tests. Do not make product fixes. Run the targeted
behavior suites, typecheck for affected projects, scoped ESLint, architecture/static migration/privilege checks and
`git diff --check`; no full CI, shared dev server, live UI or named-DEV mutation/preflight in this pass.

Commit only durable auditor-owned tests plus one audit artifact, with explicit paths and `#1098`; never `git add -A`
or push. Report candidate SHA, audit SHA, each kill-set class caught/uncovered, exact commands and any reachable
finding with impact and violated authority. Do not finish before the commit exists.
