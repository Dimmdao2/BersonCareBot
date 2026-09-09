# Тест или взгляд

Concurrent token reconciliation, logout/disable ordering, fresh-login registration, malformed detector handling
and permission gating are repeatable behavior, so they are proved by narrow tests plus one fault injection per
independent class. Exact file placement, single-boundary architecture, raw-token absence and restored product diff
are one-time inspection facts and must not become source-text tests.

# Auditor-live continuation — #915 NativeRuntime / native-push lifecycle acceptance

Continue the independent acceptance of the exact committed candidate at `4e6a5b188`. This is not a new blind
audit and must not invent a second kill-set: reuse
`.lead/runs/mobile-web-runtime-push-audit-20260909/00-blind-killset.md`. The first audit commit `2a49acab0` is not
accepted as a PASS because its own K1 was not fault-injected, K5 exercised only sequential calls, and it did not
cover the reachable logout→login dedupe failure later found by the lead. The lead correction `4e6a5b188` is the
product fix. Product code is read-only in this run.

Run the `AGENTS.md` heading map and read the global decision method, §1/§1b, §5, §9–§12 and §24 completely, with
§10a/§10b before touching tests. The tracked authority/checklist is
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M1-07/M3-01…03/M6-03/M6-09/M7. Read those sections, the original kill-set/report, exact
`d54b34775..4e6a5b188` diff and every touched implementation. You may update existing acceptance tests and audit
artifacts only; do not add a parallel test file when an existing one owns the behavior. Do not fix product code,
touch Android/media/video/backend/schema/services/DEV/TEST/PROD, or run full CI/shared services.

## Required acceptance continuation

Use the existing K1/K4/K5/K6 oracle and add only the missing stable behavioral assertions:

1. A throwing/malformed synchronous Capacitor detector returns browser-safe `false` instead of crashing a PWA
   chokepoint. A blank/whitespace project id never reaches `UniversalPush.configure`.
2. Simultaneous mount/resume/token reconciliation of the same token (hold the first POST unresolved, start the
   rest) produces one POST, not the sequential-only proof from the first report.
3. With `crypto.subtle.digest` unavailable/rejecting, two different equal-length tokens remain distinguishable:
   rotation POSTs twice without persisting/logging raw token material.
4. Logout/disable serializes behind an in-flight register, performs DELETE after it, clears the durable dedupe
   marker, and blocks a later lifecycle event in the same page. After a fresh module/session reload, the same token
   registers again for the newly authenticated user; this is the concrete regression fixed by `4e6a5b188`.
5. Permission request remains absent from mount/resume lifecycle and occurs only through the explicit enable
   action. Use the cheapest public client/hook seam; do not assert wording, DOM count or source text.

For each independent missing class, temporarily inject the corresponding product fault into the worktree, run
the narrow test to red, restore the exact committed product bytes, and rerun green. Do not leave product mutations.
If the corrected product still fails, commit the failing acceptance test and return MUST FIX; do not repair it.

Correct the false current readiness record in
`.lead/runs/mobile-web-runtime-push-audit-20260909/90-final-audit-report.md`: it must state that the first PASS was
superseded by this continuation and link the final result. Write the final continuation report at
`.lead/runs/mobile-web-runtime-push-audit-correction-20260909/90-final-audit-report.md` with binary verdict,
exact candidate SHA, test/fault matrix, commands and remaining live gates. Reuse the existing kill-set file; do not
copy it. Run only the retained/new targeted tests, webapp typecheck, scoped ESLint and `git diff --check`. Commit
only modified test files and the two report paths explicitly, never `git add -A`; do not push. Do not finish while
a foreground check is running.
