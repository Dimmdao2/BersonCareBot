# Independent audit — `media_files` Drizzle INSERT grant

Candidate: `45617093680acca66e1b6b436fd84cbacf42e502`
Parent: `e090994dd5f33e6688e26a9c56fbeb40262fc325`
Role: `auditor-live`
Status: PASS

## Authority and classification

- Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` §«Этап 7» and `AGENTS.md` DB-privilege rule: privileges belong solely to `deploy/postgres/privileges/` and reconcile, never to migrations.
- One-time final-state inspection: the `app_staff` grant declaration and the generated DEV/TEST privilege SQL.
- Repeatable behavior: the schema/grant drift guard must derive the real Drizzle `mediaFiles` insert shape and fail when its declared grant falls behind it.

## Kill-set — written before reading the guard

1. A real Drizzle-shaped `media_files` INSERT by `app_staff` still fails because any schema column is absent from the declared INSERT grant; impact: CMS and patient uploads again return PostgreSQL `42501`.
2. The correction accidentally widens access to table-level INSERT or grants another role or operation; impact: least-privilege boundary is weakened beyond the recorded failure.
3. DEV and TEST generated privilege SQL differ from the declaration or from each other for this change; impact: one managed environment deploys a different effective permission set.
4. The guard is vacuous: it hard-codes the same manual column list instead of loading executable Drizzle schema, or remains green after removal of the declared `delete_claim_token` grant; impact: future schema/grant drift reaches runtime silently.
5. The Stage 7 factual note claims live behavior beyond recorded evidence; impact: the plan could be marked ready before the required independent audit, deploy, and live upload repeat.

## Evidence log

- `git diff --check e090994dd5f33e6688e26a9c56fbeb40262fc325 456170936` exited `0`; the candidate changes only the `app_staff` column-scoped `INSERT` list for `public.media_files`, adding `delete_claim_token`. It neither makes INSERT table-wide nor changes a role or operation.
- Exact generated lines in `privileges.bcb_webapp_dev.sql` and `privileges.bersoncarebot_test.sql` are identical and each adds only `delete_claim_token` to that same `app_staff` INSERT grant.
- `node --test deploy/postgres/privileges/relation-access.test.mjs` passed: 45 tests, 0 failures. The new first subtest invokes `tsx` in `apps/webapp`, imports the executable `mediaFiles` Drizzle table, obtains its columns with `getTableColumns`, and compares that set to the sole declaration grant. It is not a second hand-maintained schema list.
- Fault injection: temporarily removed `delete_claim_token` from the declaration. The same command exited `1`; subtest `direct staff Drizzle inserts name every schema column allowed by their INSERT grant` failed with `delete_claim_token` present in the Drizzle-derived expected set and absent from the declared grant. The candidate line was restored before continuing.
- After restoration, `node --test deploy/postgres/privileges/relation-access.test.mjs` passed again (45/45) and `node deploy/postgres/privileges/generate-cli.mjs --check` confirmed byte-for-byte equality for both managed databases' privilege and allowlist artifacts.
- The Stage 7 note accurately limits its claim: it records the prior TEST denial and source-level evidence, and explicitly leaves independent audit, TEST deploy, and live repeat of both uploads open. This audit makes no live-DB claim and did not access DEV, TEST, or PROD.

## Result

PASS — `45617093680acca66e1b6b436fd84cbacf42e502`.

No reachable MUST FIX findings in the authorized scope.
