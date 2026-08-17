# Pre-B0 disposable database executors — retired

The executable paths represented by `retired-executor-paths.json` were removed at `fb44002ce`. The exact
classification is not inferred from deletion: `retired-executor-consequences.json` preserves all 123 source paths,
all 121 top-level declarations from the 35 product PostgreSQL test files, and a separate classification of the other
88 paths (55 independent oracles, 29 harness/fixture support files, and 4 historical replay files). Deleted source is
historical evidence only; it is not a command, test entry point, or migration guide.

Active database work starts at the canonical B0 baseline and applies forward migrations only to the named DEV or
TEST database through the repository's reviewed migration/application ports. Replacement behavior accounting is in
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md`. A behavior without a compliant named
environment product/application-port oracle remains explicitly blocked; the retired executor is never restored.

The registries are checked by `scripts/check-retired-db-consequence-inventory.mjs`. The B0 gate rejects an unmarked
active instruction that routes an agent to a deleted path. A document may preserve the original path/result only
when its first line is the exact retired-path notice stating that it is historical and non-runnable; this keeps old
evidence truthful without turning it into current guidance.
