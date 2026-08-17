# Pre-B0 disposable database executors — retired

The executable paths represented by `retired-executor-paths.json` were removed at `fb44002ce` because they
created disposable PostgreSQL instances or replayed pre-B0 database history. They are historical evidence only;
they are not commands, test entry points, or migration guidance.

Active database work starts at the canonical B0 baseline and applies forward migrations only to the named DEV or
TEST database through the repository's reviewed migration/application ports. Replacement behavior accounting is in
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md`. A behavior without a compliant named
environment product/application-port oracle remains explicitly blocked; the retired executor is never restored.

The JSON registry is consumed by `scripts/check-b0-migration-baseline.mjs` so an active document cannot silently
route an agent back to one of the deleted paths.
