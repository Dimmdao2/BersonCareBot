# Тест или взгляд: Track D final duplicate-store cutover

Role: independent `auditor-live`. Audit candidate `50794b541` on branch
`wt/track-d-final-cutover-20260823` against its parent. This is a binary pre-landing gate for #987.

Before every action follow the header-map rule in `AGENTS.md`. Read `AGENTS.md` §1 migration rules, §5,
§10a, §10b and §24 in full. Authority, in order:

1. `docs/OWNER_DECISIONS.md`, current Track D section and later dated owner quotes/back-references;
2. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, current Track D rules and open items;
3. `docs/_TODO/runs/briefs/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md`;
4. `docs/_TODO/runs/integrator-cleanup/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md`.

Owner oracle for this audit:

- One concrete reminder/date has one physical occurrence row and one lifecycle. Do not preserve a second
  equivalent occurrence/result journal.
- Planning marks the occurrence ready/in-flight; the same resident integrator process attempts delivery.
- Real provider failure records an attempt and retry time. Provider success marks delivery sent. A later
  bookkeeping failure must not cause a second provider send.
- No new scheduler service, retry store, duplicate journal or integrator identity mirror.
- External messenger identifiers stay in contact/channel bindings.
- Old terminal operational records are auto-retained through the existing maintenance chokepoint.
- The pre-session phone lookup keeps its accepted-context gate; runtime overlays must not replace it.
- Runtime delivery uses the narrow integrator tenant service role. Do not restore the broad membership role.

Classify each item first as one-time state inspection or repeatable behavior. Before reading any candidate tests,
write the blind kill-set from the authority above. Then inspect the diff, migrations, privilege declaration,
generated artifacts, runtime wiring and tests.

Required checks:

1. Prove the consolidation migration is fail-closed: parity/identity/uniqueness gates precede destructive drops,
   drops are non-CASCADE, FORCE-RLS data moves use the sanctioned backfill path, and every changed function has
   the correct owner/runtime capabilities from the declaration.
2. Run the canonical rollback-only candidate preflight on named DEV if safe and needed; never create a database,
   never execute/apply the migration, never touch TEST or PROD, and leave no persistent data or owner changes.
3. Prove duplicate-send prevention at the cheapest public behavior boundary. Fault-inject at least the class
   “provider accepted, later occurrence/bookkeeping write fails” and record exactly which assertion turns red.
   Also inspect the reachable case where marking the queue sent itself fails after provider acceptance; report it
   as a finding only if the current design can really send twice and authority requires prevention.
4. Prove actual provider failures alone increment attempts and schedule retries; successful delivery is not
   recorded into another equivalent result journal.
5. Verify removal of the old retry writer/worker and two old occurrence/result stores by final state inspection,
   not source-text tests.
6. Verify the migration rehome marker is exact, transactional, rollback-safe, and cannot rehome an unrelated
   signature; verify the overlay no longer owns a second function body.
7. Verify generated privileges match declaration and the final reminder function/table access is sufficient at
   runtime without granting the broad role.
8. Inspect automatic retention for every still-live terminal journal/queue/attempt target. Pending, processing and
   retryable work must not be swept. Do not require documents to block runtime or deploy.

You may add and commit only durable acceptance tests and one audit artifact under
`docs/_TODO/runs/integrator-cleanup/`. Do not make a product fix. Temporary production fault injections must be
fully reverted. Stage only explicit paths; do not push, merge, delete branches/worktrees or touch any Therapysto/
night/branding branch. Do not run full CI. Do not end waiting for a process: run targeted commands in foreground
and finish the audit in this one turn.

Verdict is `PASS` only when every kill-set item is either caught by a green test proven red under the named fault,
or accepted by one-time inspection/live rollback evidence. Otherwise `FAIL` with each reachable scenario, impact,
exact violated authority, and the smallest fix boundary. Commit permitted audit artifacts/tests before exiting and
report the final SHA, exact commands and results.
