# Rubitime retirement R1 stale CSV proof audit

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-STALE-CSV-AUDIT-codex-2026-07-14`

Auditor: independent Codex audit on `/home/dev/dev-projects/BersonCareBot`, branch `feat/doctor-ui-rebuild`.

Audited HEAD: `f74fa7d6f434af6620f57da65bf2679377d1372d`.

Verdict: **PASS** for the narrow stale CSV proof audit.

Important scope note: this is not R1 acceptance. `RR-PROOF-01-DUAL-SOURCE` remains **BLOCKED**, and R2 remains closed.

## What was checked

- Required repository instructions and scoped rules were read: `AGENTS.md`, `docs/ORCHESTRATION_BINDINGS.md`, R1 Rubitime retirement artifacts, `dev-prod-isolation-no-real-creds`, `host-psql-database-url`, `test-execution-policy`, `pre-push-ci`, and `unified-task-db`.
- Required R1 artifacts are present on `feat/doctor-ui-rebuild` after the merge.
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md` is aggregate-only and PII-safe for the audited scope.
- Stale CSV proof command blocks use safe mode: summary-only dry-run, dev env paths only, no `--commit`, no stale/drop commit flags, no production env, no `/opt`, and dual-source sample size `0`.
- Aggregates agree across stale proof, owner packet, dual-source report, and dual-source JSON:
  - stale vs owner CSV: `29`
  - unmapped real active: `99`
  - duplicate clusters after approved cleanup: `3`
  - raw-only: `0`
  - legacy-only: `312`
  - status mismatches: `4`
  - `record_at` mismatches: `2`
- R1 acceptance is not marked passed in the execution-plan checklist; unresolved checklist items remain open.
- R2 is not opened; the R1 artifacts explicitly say not to start R2.
- `docs/ORCHESTRATION_BINDINGS.md` has no conflict markers and still contains current model overrides plus validation and prompt-context rows.

## Commands and results

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status -sb
```

Result: branch `feat/doctor-ui-rebuild`, HEAD `f74fa7d6f434af6620f57da65bf2679377d1372d`, clean before creating this audit artifact.

```bash
ls -l docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md
```

Result: all listed artifacts exist.

```bash
rg -n '^(<<<<<<<|=======|>>>>>>>)' AGENTS.md docs/ORCHESTRATION_BINDINGS.md docs/_TODO/SAAS_FOUNDATION .cursor/rules || true
```

Result: no conflict markers.

```bash
rg -n --pcre2 '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s()\-]*\d{2}[\s()\-]*\d{2}' \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md
```

Result: one numeric false positive in the dry-run summary metadata; no email or phone values.

```bash
rg -n --pcre2 '\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?\b' \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt \
  docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md
```

Result: no Russian full-name pattern matches.

```bash
pnpm run check:rubitime-retirement-r0
```

Result: PASS, `check-rubitime-retirement-r0-freeze: OK`.

## Findings

No blocking findings for this narrow audit.

The owner packet contains `R1 evidence collection and sanitized artifact audit: PASS`, but the same packet and the execution plan keep `RR-PROOF-01-DUAL-SOURCE` blocked and keep R2 closed. I did not treat that sentence as R1 acceptance.

## Remaining R1 blockers

- Owner/reviewer classification is still required for `29` stale-vs-owner-CSV rows.
- `UNMAPPED real active` remains `99`.
- Duplicate clusters remain `3`.
- Legacy-only records remain `312`.
- Status mismatches remain `4`; `record_at` mismatches remain `2`.
- Mapping anomalies still need classification or explicit exceptions.
- Doctor calendar/list/KPI smoke is still not recorded.
- `RR-PROOF-01-DUAL-SOURCE` remains **BLOCKED** until the owner decisions and execution-plan checklist are updated.
