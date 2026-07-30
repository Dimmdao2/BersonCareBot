# Rubitime retirement R1 Sol stage audit

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

## Audit metadata

- `audit_run_id`: `R1-SOL-STAGE-AUDIT-codex-2026-07-14`
- `agent/model`: `gpt-5.6-sol`
- `reasoning_effort`: `high`
- `branch`: `auto/code-pg-delta`
- `audited_head`: `2f354b09f7afc7f342d1d3005c0e0c76f73f288b`
- `audited_commits`:
  - `2f354b09f7afc7f342d1d3005c0e0c76f73f288b` - R1 owner review packet.
  - `430ab451dedcda9f69413a91bb69a11bf62752e9` - R1 proof evidence and PII-safe backfill summary mode.
  - `5c348afd47253984806238cb27bee0d18cf3e006` - R1 dual-source audit diagnostics fix.
- `scope`: R1/RR-PROOF-01 stage audit only; no DB connection, no R2 work, no code changes.

## Verdict

**BLOCKED**

The current artifacts are PII-safe and sufficient read-only evidence to support keeping R1 blocked. They are not sufficient to pass `RR-PROOF-01-DUAL-SOURCE` or enter R2. The unresolved data classifications, missing stale-CSV proof, absent owner approval, absent commit run or approved no-commit exception, non-zero post-run diagnosis, and missing doctor smoke remain acceptance blockers.

## Findings

### P0

None found.

### P1

1. **`RR-PROOF-01-DUAL-SOURCE` does not meet R1 acceptance.** Evidence records `legacy-only=312`, `status_mismatch=4`, `record_at_mismatch=2`, dual-source legacy unmapped `129`, backfill live unmapped `126`, and `7` duplicate clusters. The CSV stale check was skipped, owner review is unresolved, no `--commit` was run, zero-state or approved exceptions are not recorded, and doctor calendar/list/KPI smoke was not run. `BLOCKED`, not `PASS`, is the only valid gate state.
2. **The saved aggregate evidence cannot itself complete row-level owner classification.** `--sample-size=0` correctly prevents external-id disclosure, but the proof matrix requires mismatch classification and the owner decisions require reviewer analysis. Any row-level review must remain in an approved secure channel or use a separately approved PII-safe identifier scheme; it must not be added to this repository artifact as raw identifiers.

### P2

1. **The `129` vs `126` unmapped counts have different populations.** The dual-source audit covers all `403` legacy rows with external ids; the backfill diagnosis covers `400` live legacy rows. The packet preserves both counts, but owner disposition must not treat them as interchangeable.
2. **Six unexpected canonical-source mappings and six mappings missing expected metadata remain unresolved.** The owner packet surfaces both counts, but they still need explicit reviewer disposition as part of mapping/conflict acceptance before RR-PROOF-01 can pass.
3. **Future backfill dry-runs rely on command discipline.** The observed run is read-only because `--commit` was absent and execution exits before write functions. Unlike the dedicated dual-source runner, the backfill script does not enforce a read-only transaction or reject non-dev database names. This does not invalidate the saved run, whose artifact identifies loopback `bcb_webapp_dev`, but reruns must continue to follow the owner packet and dev-isolation rules.

## Audit questions

| Question                                                                 | Result                                 | Evidence-based conclusion                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are the current R1 artifacts PII-safe and sufficient read-only evidence? | **PASS, qualified**                    | They contain aggregate counts, operational DB identity, timestamps, and an internal organization id, but no patient names, phones, emails, raw external ids, payloads, or credentials. They are sufficient to prove the blocked state, not sufficient for R1 acceptance or row-level classification.                                                          |
| Is RR-PROOF-01 correctly blocked?                                        | **PASS**                               | All recorded blockers and missing gates require `BLOCKED`; the evidence does not support `PASS`.                                                                                                                                                                                                                                                              |
| Is the owner packet complete enough and does it forbid R2?               | **PASS, qualified**                    | It enumerates the required gate-level owner choices, the write gate, smoke acceptance, and an explicit hard prohibition on R2. Secure reviewer analysis is still required for row-level dispositions and the mapping anomalies noted above.                                                                                                                   |
| Did the proof runner avoid DB writes, production env, and PII output?    | **PASS for the recorded run**          | The dual-source runner rejects non-dev DB names, refuses `/opt` env references, uses `BEGIN READ ONLY`, executes aggregate `SELECT` queries, and masks optional samples. The result records loopback `bcb_webapp_dev` with sample size zero. The backfill artifact records dry-run/summary-only and no `--commit`; its control flow exits before write paths. |
| Are there P0/P1/P2 blockers to keeping task #757 blocked awaiting owner? | **No blocker to preserving the block** | No P0 was found. The P1/P2 items above are reasons to keep #757 blocked and must be resolved before changing the R1 verdict.                                                                                                                                                                                                                                  |

## R1 / RR-PROOF-01 checklist

| Gate item                                                            | Status  | Audit note                                                               |
| -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `appointment_records` vs `integrator.rubitime_records` anti-join run | PASS    | Aggregate dual-source result saved.                                      |
| Max `record_at` / freshness recorded for both sources                | PASS    | Both source maxima and canonical max start are saved.                    |
| Raw-only delta imported or owner-waived                              | PASS    | Raw-only count is zero; no import or waiver is required for this run.    |
| Legacy-only records classified                                       | BLOCKED | `312` remain unclassified.                                               |
| Status/freshness mismatches classified                               | BLOCKED | `4` status and `2` `record_at` mismatches remain unclassified.           |
| Canonical mapping coverage recorded                                  | PASS    | Raw `91/91`; legacy `274/403`, with `129` unmapped.                      |
| Backfill dry-run output saved in PII-safe mode                       | PASS    | Summary-only artifact records dry-run and suppressed detail rows.        |
| Owner reviews `UNMAPPED`, `DUPLICATE`, `STALE`, `CONFLICTS`          | BLOCKED | Owner packet is prepared, but decisions are unresolved.                  |
| Commit approved before `--commit`                                    | BLOCKED | No approval is recorded.                                                 |
| Approved commit completes or no-commit exception is accepted         | BLOCKED | No commit was run and no owner-approved exception exists.                |
| Post-run diagnosis is zero or has approved exceptions                | BLOCKED | Unmapped and duplicate findings remain; stale was not evaluated.         |
| Doctor calendar/list/KPI smoke passes or is owner-waived             | BLOCKED | No smoke or waiver is recorded.                                          |
| `RR-PROOF-01-DUAL-SOURCE` artifact can pass                          | BLOCKED | Read-only evidence is complete enough to prove blockers, not acceptance. |
| Entry into R2                                                        | BLOCKED | Explicitly forbidden by the plan and owner packet.                       |

## Checks run

| Check                                                                                          | Result                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `git show --stat 2f354b09f7afc7f342d1d3005c0e0c76f73f288b`                                     | PASS; confirms the owner packet commit and its report link update.                                                                            |
| `git status -sb` before editing                                                                | PASS; expected branch/HEAD confirmed and unrelated dirty `docs/ORCHESTRATION_BINDINGS.md` identified and left untouched.                      |
| `node --check docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`            | PASS.                                                                                                                                         |
| `pnpm run check:rubitime-retirement-r0`                                                        | PASS; `check-rubitime-retirement-r0-freeze: OK`.                                                                                              |
| Targeted PII scan over the report, JSON result, backfill summary, owner packet, and this audit | PASS; zero email, E.164 phone, Telegram token, credential-bearing URL, or detail external-id patterns; all `masked_samples` arrays are empty. |
| `git diff --check`                                                                             | PASS.                                                                                                                                         |
| `git status -sb` before commit                                                                 | PASS; only this audit artifact is selected for commit; unrelated orchestration bindings remain unstaged.                                      |

No full CI, DB connection, production env access, smoke test, or R2 action was performed by this audit.

## Residual risks

- Aggregate evidence cannot determine which source is correct for each mismatch or whether each legacy-only row is valid history.
- No current approved CSV means stale records cannot be proven absent or classified.
- A future approved write run can change mapping, duplicate, and conflict counts; new sanitized post-run evidence is required after any such run.
- Doctor UI behavior and KPI/list/calendar parity remain unverified.
- The owner must explicitly dispose of the mapping-source/metadata anomalies or include them in an approved exception list.

## Next gate

Keep task `#757` **blocked**. Do not enter R2 until every unresolved decision in `RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md` is resolved, the R1 checklist records the decisions or explicit exceptions, required write/no-write acceptance and doctor smoke are complete, and `RR-PROOF-01-DUAL-SOURCE` is independently updated from `BLOCKED` to an evidence-supported pass.
