# Rubitime retirement R1 fallback import audit

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-FALLBACK-IMPORT-SELF-AUDIT-codex-2026-07-14`

Verdict: **PASS with orchestration caveat**.

Scope: audit of commit `d4062b3ce` after independent subagent audit could not be started because Codex returned `agent thread limit reached`. This is a self-audit artifact, not a substitute for the next available independent audit pass.

## What Was Checked

- `scopeOverride` is optional on `RubitimeCanonicalProjectionInput`; existing runtime callers do not pass it.
- Historical fallback import requires explicit `--historical-owner-doctor-phone=<phone>` and a CSV.
- Historical fallback import filters to CSV-present active unmapped legacy rows, so the stale active row is not imported.
- Phone fallback must resolve to exactly one active platform-user organization.
- Dominant specialist fallback refuses a tie/no specialist; it selected the existing dominant Rubitime-history specialist only after owner confirmation.
- Branch scope is restored from legacy `appointment_records.branch_id -> branches.integrator_branch_id`, then resolved through existing Rubitime branch mappings.
- Legacy `status='canceled'` is cleanup-eligible even when payload fields look active.
- Docs use masked owner phone wording and aggregate counts only.
- R1 is not marked accepted/passed; R2 remains forbidden.

## Verification

Commands run:

```bash
pnpm --dir apps/webapp exec vitest --run src/scripts/backfill-canonical-from-legacy-appointments.test.ts
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint scripts/backfill-canonical-from-legacy-appointments.ts src/scripts/backfill-canonical-from-legacy-appointments.test.ts src/infra/repos/pgBookingRubitimeBridge.ts src/modules/booking-rubitime-bridge/ports.ts
pnpm run check:rubitime-retirement-r0
node --check docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs
git diff --check
```

Results:

| Check             | Result                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| targeted vitest   | PASS, 15 tests                                                               |
| webapp typecheck  | PASS                                                                         |
| targeted eslint   | PASS                                                                         |
| R0 guard          | PASS                                                                         |
| classifier syntax | PASS                                                                         |
| diff check        | PASS                                                                         |
| PII scan          | PASS except pre-existing explicit test-phone allowlist in the cleanup script |

Read-only post-run classifier:

| Check                  | Count |
| ---------------------- | ----: |
| unmapped real active   |     1 |
| stale-vs-owner-CSV     |    10 |
| duplicate clusters     |     3 |
| status mismatches      |     4 |
| `record_at` mismatches |     2 |
| legacy-only rows       |   312 |

## Residual Risk

- This audit was not independent because subagent capacity was exhausted.
- The remaining `10` stale active rows still require owner/reviewer policy before cleanup.
- The remaining `3` duplicate clusters overlap stale rows and must not be broad-collapsed without a stale/duplicate decision.
- Doctor calendar/list/KPI smoke is still not recorded.
