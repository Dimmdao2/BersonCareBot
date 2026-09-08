# Тест или взгляд

Это проверка итогового runtime-состояния разовыми read-only действиями: службы и журналы — взгляд на фактическое
состояние, DB objects/owners/privileges — catalog introspection, пользовательские ошибки — корреляция с уже
выполненными живыми сценариями. Новые тесты не нужны и запрещены.

# TEST acceptance: runtime logs, database state and effective rights

This is a read-only operational evidence pass for the already deployed TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`. Read the `AGENTS.md` heading map, then full §1/1b migration,
server, TEST and grants sections, §6, §10a and §24; read `docs/ARCHITECTURE/SERVER CONVENTIONS.md` host identity
and TEST sections plus `deploy/HOST_DEPLOY_README.md` operator-health/deploy sections. The current host
`151.241.228.122` is DEV/TEST only. Never touch PROD, `*.prod`, or `*-prod.service`.

Do not modify code, DB, settings, services, queues, migrations, privilege declarations, cron, files, or external
providers. Do not run a migration, reconcile, deployment, retry, purge, backfill or notification. Do not read or
print env values, connection strings, tokens, signed media URLs, raw contacts or clinical text. No tests and no
commits. Use only bounded read-only catalog/operational queries against named TEST; every SQL command must begin
`BEGIN READ ONLY` and end `ROLLBACK`. Prefer existing operator-health/readiness scripts or authenticated admin
health UI/API. Raw SQL is only for the catalog/runtime facts that existing product surfaces cannot expose.

## Required evidence

1. Confirm the TEST checkout SHA, four TEST service states, version/health endpoints, and installed scheduled-job
   state. Record exact commands and outputs without secrets.
2. Inspect TEST webapp/api/scheduler/media-worker and nginx logs from the deploy and live-acceptance window starting
   2026-09-08 06:30 MSK. Group actionable 4xx/5xx, unhandled failures, `42501`, missing object/column/function,
   RLS/principal errors, media/storage/provider errors and repeated operator incidents. Do not report ordinary
   navigation aborts or expected restart SIGTERM as product defects.
3. With the existing platform-admin account and normal product path, read system health: SaaS isolation, job
   cadence, delivery providers, media transcode/HLS/proxy errors and open incidents. Do not acknowledge/resolve or
   mutate incidents.
4. Read-only TEST DB catalog proof: migration ledger contains the deployed forward migrations and no pending file
   relative to the deployed checkout; object owners/policies and effective declared runtime privileges for objects
   changed by this package match the generated declaration. Use existing privilege/catalog audit in a read-only
   mode if one exists; never run reconcile and never add GRANT/REVOKE. A zero row result under RLS is not evidence
   of emptiness unless the principal/catalog method is named.
5. Correlate concrete runtime failures from the UI reports: email OTP 503, existing exercise preview ORB/media row,
   any transcode failure, and failures recorded by the parallel passes. For each, distinguish confirmed product
   defect, external TEST configuration blocker, pre-existing data inconsistency, and unproved. Do not fix anything.
6. Produce one report with exact timestamp/window, command beside every numeric claim, redacted evidence, impact,
   and source requirement when known. Save only outside git checkout at
   `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/runtime-db-rights/REPORT.md` plus redacted raw
   summaries. Do not save journal lines containing secrets or personal/clinical payloads.

Finish only after the read-only transaction is rolled back and no persistent state was changed.
