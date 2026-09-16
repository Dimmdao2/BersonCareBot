# C3M-09 communications — final independent acceptance

## Тест или взгляд

- Repeated access, policy, preservation and delivery behavior: reuse the existing blind behavior tests and their
  recorded fault injection; rerun only what is stale on the final candidate.
- Responsive presentation and hidden-work absence: inspect live on desktop and mobile; do not automate UI form.
- Migration ownership/backfill, generated privilege parity and one-resolver wiring: direct inspection and named-DEV
  preflight/runtime evidence; never test source or SQL wording.

Read the `AGENTS.md` heading map before every action, then §1/§1a migration, DEV and host-lock rules,
§4/§4a, §5, §9, §10/§10a/§10b, §12, §15–§22 and §24 in full. Read `README.md`, the complete current C3M
section and owner decisions, the candidate diff, and the existing auditor artifact before acting.

Taskdb: `#1098`. Binding authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner
decisions, C3M-09 and C3M.8. Candidate branch/worktree: `wt/c3m-communications-slice-20260907` at
`016477803`. Exact scope: `apps/webapp/**`, `apps/integrator/**`, `deploy/postgres/**`, and the single artifact
`docs/audit/c3m-09-communications-2026-09-07.md`.

This is a continuation/finalization of the already completed first blind pass, not a fresh audit. Reuse the blind
kill-set and auditor-owned tests committed in `b51bc98d2`; do not create another kill-set or repeat fault injection
already evidenced by the existing run. The lead fixed its one red oracle in `016477803`: the doctor patient-card
message snapshot now enters the central `direct_chat` API gate. Verify this fix with the same test and inspect the
final diff. Do not make product fixes; any new reachable finding must be reported with impact and exact authority.

Finish the existing artifact with one `PASS|FAIL|BLOCKED` line and concrete evidence for every numbered kill-set
class. Preserve only durable behavior/security tests. The removals of tests over generated SQL text, exact columns
or line/count shape are intentional under §10a; do not restore or replace them with another static implementation-
form test. Never add UI wording, DOM-shape, snapshot, source-text, SQL-text, formatting or element-count tests.

Run only the targeted suites needed for the current SHA, affected-project typechecks/scoped lint if not already
fresh, architecture/static migration/privilege inspection, and `git diff --check`; no full CI. Then perform the
remaining pre-landing acceptance on the candidate:

- isolated-port desktop and mobile live inspection of Communications visibility, first available tab, absence of
  disabled tabs/badges/preloads, and retained mailing independence;
- canonical named-DEV migration preflight/execute only if the current migration is not already applied, using the
  repository scripts and DEV rules, never a disposable database; prove statement ownership, ambiguity-safe
  backfill, generated declaration parity, and rollback/restore every mutable specialist setting used by the check;
- runtime probes for module OFF/ON and client deny/inherit/allow on chat/comments/media, including no hidden work,
  plus mailing delivery-time fail-closed behavior. Do not send real external messages or touch PROD.

If a long host operation is genuinely needed, launch it detached per §24.2 and record its log; verify it in a
separate short pass. Otherwise keep commands foreground and finish them in this turn. Commit the completed audit
artifact and only necessary auditor-owned test corrections with explicit paths and `#1098`; never `git add -A` and
never push. Do not finish before the commit exists. Report candidate SHA, audit SHA, exact commands, live viewport
evidence, DEV restore evidence, every kill-set verdict, and any remaining blocker.
