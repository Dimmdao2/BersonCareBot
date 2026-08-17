# Patient / B0 capability salvage — 2026-08-17

## Outcome

PASS for the repository-only stage. The preserved patient changes were completed as one B0-forward branch without touching DEV, TEST, PROD, or any database.

- `app_patient` has no direct `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` grants in either generated environment contract. Patient mutations use declaration-owned exact named capabilities with an independently checked callsite catalog.
- Exercise completion is recorded immediately by the completion action; optional sets/repetitions/difficulty are enrichment of that exact completion. Completion dots are driven by recorded completions, not by opening an exercise.
- The preserved patient fixes cover canonical FIO editing with first-name-only greeting, the disabled material-rating UI path, positive-size chart rendering, warmup completion, reminder/settings writes, patient chat/program discussion, symptoms, support channels, web push, program actions and tests, and the patient booking lifecycle preservation suite.
- Runnable historical/zero-state/disposable PostgreSQL paths in this branch were removed. The active migration surface is B0 plus forward Drizzle migrations only. The obsolete SAAS deploy prose is explicitly marked historical and non-executable.
- SAAS schema/regression gates now derive the current contract from B0/generated access artifacts and maintained forward ledgers instead of replaying deleted history.
- Gitleaks keeps the four confirmed `pg_dump` false-positive fingerprints ignored, while the five historical real credential fingerprints remain an explicit provider-rotation/revocation checklist item. Ignore entries are not treated as rotation evidence.

## Evidence

- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS; all four generated privilege/allowlist artifacts match byte-for-byte.
- `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l` — `0`.
- `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bersoncarebot_test.sql | wc -l` — `0`.
- `node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` — PASS, 58/58.
- `node scripts/check-b0-migration-baseline.mjs` — PASS: B0 roots + 17 webapp forward migrations + 0 integrator forward migrations; no legacy chain.
- `node --test scripts/check-b0-migration-baseline.audit.test.mjs` — PASS, 2/2 negative audit fixtures.
- `node scripts/check-saas-db-regression.mjs` — PASS, including descriptor, RLS, schema completeness, locked-policy, settings-security, D1 and D8 gates.
- `pnpm --dir apps/webapp typecheck` — PASS.
- App-local ESLint over every changed webapp TypeScript/TSX file — PASS. Root ESLint over every other changed TS/TSX/MJS file — PASS.
- Patient exercise/greeting/chart focused Vitest run — PASS, 13/13.
- Patient booking catalog/create/service Vitest run — PASS, 17/17.
- Doctor-message/payment preservation Vitest run — PASS, 16/16.
- `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --report-format sarif --report-path /tmp/bcb-patient-b0-salvage-gitleaks.sarif` — PASS; 7,276 commits and about 184.13 MB scanned, no leaks found.
- `git diff --check` — PASS.

## Integration and live-runtime boundary

- Migrations `0016` and `0017` carry the required temporary-local-number markers. The integrator must renumber them against the other parallel worktrees before merging.
- This stage intentionally did not install migrations, restart services, or exercise browser/API flows against named DEV accounts. Independent audit and named-DEV runtime verification remain integration gates, not claims of this report.
- TEST transfer and TEST notification/worker delivery remain after a fully working DEV, per the owner's ordered rollout. PROD A-to-B0 migration work is separate and was not started.
- The five historical credential fingerprints require provider-side rotation/revocation evidence before that security item can be closed.
