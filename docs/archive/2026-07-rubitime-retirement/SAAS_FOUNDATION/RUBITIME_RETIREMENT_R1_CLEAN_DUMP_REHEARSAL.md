# Rubitime retirement R1 — clean-dump rehearsal

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-CLEAN-DUMP-REHEARSAL-sol-2026-07-14`

Verdict: **PASS on fresh current prod dump** after the 2026-07-14 replay below.

Next agent entrypoint: `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`. Do not repeat this
rehearsal as restore + plain migrate; the valid proof uses the existing owner doctor/admin data-fix,
`scripts/deploy-saas-667.sh`, placeholder booking cleanup, specialist consolidation and R1 aggregate
audits from that runbook.

All evidence below is aggregate-only. No production DB or `/opt/env` path was accessed, no current dev DB
was modified, and no patient row identifiers, names, phones, emails, payloads, or message bodies are
recorded.

## Canonical TEST full-chain replay — PASS (2026-07-19)

The owner-authorized TEST rehearsal used the already protected local fresh dump and exact hash-bound owner inputs;
it did not fetch another production dump. The sole destructive entrypoint was
`deploy/host/deploy-test-full-reset.sh --confirm-full-reset`. Ordinary `deploy-test.sh` was not involved in restore
and remains code-only.

The executed order was: restore -> doctor/admin data-fix -> current Drizzle migrations -> TEST settings ->
placeholder purge -> specialist consolidation -> full Rubitime cleanup/import -> second non-confirmed cleanup ->
aggregate retirement gates -> reviewed FIO apply -> B1 assertion -> strict SaaS/FORCE closure -> synthetic fixtures
-> five-unit restart -> health/product smoke. No writer ran between restore and data normalization.

Aggregate final proof before/after fixture boundaries:

| Check                                                 |                                                  Result |
| ----------------------------------------------------- | ------------------------------------------------------: |
| Rubitime one-pass resume mutations                    |                                                       0 |
| Legacy live rows                                      |                                                     315 |
| Canonical live `rubitime_projection` rows             |                                                     313 |
| Stale / unmapped / duplicate / non-confirmed blockers |                                                       0 |
| Owner-organization active specialists after closure   |                                                       1 |
| Appointments on null/inactive specialist              |                                                       0 |
| Reviewed FIO result                                   | 165 updated; 3 matched; 1 expected missing; 1 preserved |
| Locked product smoke                                  |                      22/22 + clinical-write denial PASS |
| TEST services / health                                |                                       5/5 active; DB up |

The first run stopped at a static retirement checker whose R0 baseline and R5-template expectation had become stale
relative to the already approved current contracts. Those repo gates were corrected and passed targeted self-tests;
the database was not restored again. The chain resumed from the failed Rubitime gate, proved the one-pass sequence
idempotent, then continued through FIO and the shared post-migration closure. This is the canonical evidence that the
current from-dump algorithm is understandable, ordered and repeatable without making database reset part of normal
deploys.

## Fresh current prod dump replay — PASS

Run id: `R1-CLEAN-DUMP-REHEARSAL-codex-2026-07-14-fresh-0415`

| Field                                 | Value                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Source dump                           | `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_20260714_041501.dump` |
| Dump archive timestamp                | 2026-07-14 04:15:01 MSK                                                     |
| Dump source DB name in archive header | `bcb_webapp_prod`                                                           |
| Rehearsal DB                          | `bcb_webapp_dev_rubitime_fresh_20260714_041501_owner2`                      |
| Runtime owner                         | disposable local role `bcb_rubitime_rehearsal_owner`                        |
| Superuser/operator                    | disposable local role `bcb_rubitime_rehearsal_super`                        |
| Owner CSV                             | `records-2.csv`, 392 parsed ids, 2026-01-16...2026-08-29                    |

Sequence:

1. Restored the dump into a disposable loopback DB owned by the rehearsal runtime-owner.
2. Ran `scripts/deploy-saas-667.sh` with disposable `DATABASE_URL` and `SUPERUSER_URL`.
3. `deploy/postgres/p0-data-fix-doctor-admin-split.sql` normalized the owner doctor/admin split and
   archived 2 identifier-less active admin stubs before staff membership seeding.
4. `#667` post-state assertions passed: doctor=1, admin=1, active specialist=1, required memberships=2,
   Drizzle migrations=181, integrator org NULL checks passed, runtime-owner is `NOSUPERUSER NOBYPASSRLS`.
5. Ran the existing R1 cleanup/import sequence from `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`:
   `--delete-test --collapse-canceled-dups`, `--delete-non-confirmed`, historical owner fallback import,
   repeat `--delete-non-confirmed`, then `--drop-stale-from-csv`, all with `--summary-only` and the owner CSV.
6. Re-ran `rubitime-r1-clean-dump-preflight.mjs`, `rubitime-r1-classify-blockers.mjs`, and
   `rubitime-r1-dual-source-audit.mjs --threshold-minutes=5 --sample-size=0`.

Final aggregate result:

| Check                                                  | Count / result |
| ------------------------------------------------------ | -------------: |
| R1 clean-dump preflight                                |           PASS |
| Legacy live rows                                       |            268 |
| Canonical `rubitime_projection` live rows              |            266 |
| Stale vs owner CSV                                     |              0 |
| Unmapped real active                                   |              0 |
| Duplicate clusters                                     |              0 |
| Non-confirmed cleanup candidates                       |              0 |
| Raw-only records                                       |              0 |
| Legacy-only records                                    |            290 |
| Status mismatches                                      |              4 |
| `record_at` mismatches over 5 minutes                  |              2 |
| Raw mapping coverage                                   |        91 / 91 |
| Legacy mapping coverage                                |      351 / 381 |
| Legacy unmapped mappings                               |             30 |
| Legacy mappings to soft-deleted canonical appointments |             74 |
| Unexpected canonical source mappings                   |              6 |
| Missing expected mapping metadata                      |              6 |

Interpretation: the fresh-copy R1 cleanup proof is now self-contained for the owner-approved cleanup/import
sequence. The stale/unmapped/duplicate buckets are closed on a clean current prod dump. The remaining
legacy-only/mismatch/mapping-anomaly policy was resolved by the owner source-of-truth decision: fresh Rubitime CSV is
canon, and `integrator.rubitime_records` is audit-only when it disagrees. Doctor UI smoke was later recorded as PASS in
`RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md`.

## Previous isolated rehearsal target — superseded FAIL

| Field                                 | Value                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Source dump                           | `/home/dev/brain/backup/home-dev-cleanup-20260709T082543Z/bcb-test-setup/bcb_test_restore.dump` |
| Dump archive timestamp                | 2026-06-25 09:17 MSK                                                                            |
| Dump source DB name in archive header | `bersoncarebot`                                                                                 |
| Dump SHA-256                          | `bcedd122e4362e087295df61e492f3c54fc892a6388dbf4eb995e74f4da67d58`                              |
| Local PostgreSQL                      | user-owned PG16, loopback `127.0.0.1:55432`                                                     |
| Rehearsal DB                          | `bcb_webapp_dev_rubitime_clean_20260714`                                                        |
| Post-run state                        | user-owned PostgreSQL stopped; port `55432` closed                                              |
| Current `bcb_webapp_dev`              | not connected; not modified                                                                     |

The dump was restored with `pg_restore --no-owner --no-privileges` into a new database created from
`template0`. The local cluster and database were used only for this rehearsal.

## Source search result

Locally readable candidates were checked through repository documentation, `pg_restore --list`, and a
filesystem search outside `/opt`.

- The two May 2026 repo-local demo-seed dumps predate the canonical booking tables and are not R1 inputs.
- The June 25 custom dump above is the only locally readable unified prod-like dump containing both
  `public` and `integrator` Rubitime/canonical data.
- The previously attempted DB clone
  `bcb_webapp_dev_rubitime_rehearsal_20260714040111`, sourced from
  `bcb_saas_c1_rehearsal_20260713021531`, was reported by the prior run to have zero canonical Rubitime
  projections, mappings, specialists, canonical branches, and platform contacts. It is not a valid R1
  clean source.
- Repo-local env files are unavailable in this host-orch run and the existing cluster copy could not be
  independently queried. This does not affect the isolated dump restore result.

Required replacement: a fresh custom-format dump of the current unified production-like database after
the current migration ledger/state, copied by the owner into an approved non-prod location. After restore,
`pnpm run migrate` must pass and `rubitime-r1-clean-dump-preflight.mjs` must return `PASS`. The rehearsal
also requires the exact fresh Rubitime CSV used for the cleanup cutoff. Replay additionally requires the
owner resolver input used by the historical fallback import; neither input is present locally now.

## Baseline counts from the restored dump

| Aggregate                                    | Count |
| -------------------------------------------- | ----: |
| `appointment_records` total                  |   384 |
| `appointment_records` live                   |   381 |
| `integrator.rubitime_records`                |    91 |
| `integrator.rubitime_events`                 |   363 |
| shared legacy/raw records                    |    91 |
| raw-only records                             |     0 |
| legacy-only records                          |   293 |
| shared status mismatches                     |     4 |
| shared `record_at` mismatches over 5 minutes |     2 |
| `be_appointments` total                      |   246 |
| canonical `rubitime_projection`              |   240 |
| `be_external_entity_mappings` total          |   270 |
| Rubitime appointment mappings                |   256 |
| Rubitime branch / specialist mappings        | 2 / 2 |
| Rubitime service + availability mappings     | 5 + 5 |
| active specialists                           |     2 |
| canonical branches                           |     2 |
| platform contacts                            |     2 |

All 240 baseline `rubitime_projection` appointments have at least one row in both
`be_appointment_events` and `be_appointment_history_events` (265 and 275 event rows respectively). No
baseline Rubitime projection has a reschedule row. Appointment mapping organization mismatches and
missing canonical targets are both zero. Six mappings have legacy/non-standard metadata.

This proves that the dump has the canonical seed missing from the prior clone. It does not make the dump
usable with current HEAD.

## Rehearsal commands and results

| Step                                                            | Result                       |
| --------------------------------------------------------------- | ---------------------------- |
| Restore dump into isolated PG16 DB                              | PASS                         |
| Apply `pnpm run migrate` with explicit rehearsal `DATABASE_URL` | FAIL                         |
| Run current dual-source audit                                   | FAIL after migration failure |
| Run current backfill dry-run `--summary-only`                   | FAIL after migration failure |
| Run clean-dump preflight                                        | expected FAIL                |
| Any cleanup/import `--commit`                                   | not run                      |

Migration fails in `0143_seed_staff_organization_members.sql`: the snapshot has zero active unmerged
`platform_users.role='doctor'` rows and three `admin` rows, while the migration requires exactly one
doctor. Drizzle does not reach the later schema needed by R1.

Against the restored pre-migration schema:

- `rubitime-r1-dual-source-audit.mjs` cannot query `be_appointments.deleted_at`;
- `backfill-canonical-from-legacy-appointments.ts` cannot read org-aware settings because
  `system_settings.organization_id` is absent;
- `be_organization_members` is absent, so the historical owner resolver cannot run;
- the required owner CSV is absent.

The new preflight fails before cleanup with `schema_not_current` and
`fresh_rubitime_csv_missing`; it reports the missing columns/table contract without selecting PII.

## Is the replay sequence self-contained?

**No.** Even on a dump with canonical rows, the current sequence depends on state and inputs outside the
dump/script pair:

1. The dump must first be compatible with the full current migration chain.
2. Cleanup classification depends on the exact owner CSV and its date range.
3. Historical fallback depends on an owner-provided phone resolver, an active organization membership,
   active specialists, and a unique dominant specialist selected by existing live Rubitime projection
   counts.
4. Ordinary projection depends on pre-existing branch/specialist/service mappings. A clean copy without
   those mappings produces unresolved scope or slot conflicts rather than rediscovering the final scope.
5. Projection writes stateful appointment mappings plus two canonical history streams. Replaying against a
   different seed can generate different appointment UUIDs, mapping metadata, event rows, and conflict
   outcomes.

Therefore replay is suitable only on a fresh copy of the same fully seeded/current-schema database with
the same cutoff CSV and resolver decision. It is not a general from-scratch import.

## Recommendation: transfer the audited final R1 state

Recommend **transfer-final-state**, not replay, for the already resolved historical R1 result. The transfer
must be a narrow transactional state bundle from the final current-dev R1 source into a fresh current-schema
copy, followed by the same aggregate audits. It must not be a blind full-DB copy and must not overwrite
target-only late Rubitime rows.

### State bundle

1. `appointment_records`: transfer only the final `deleted_at` state keyed by unique
   `integrator_record_id`. Do not copy legacy payload/PII merely to reproduce cleanup.
2. `be_appointments`: transfer full rows where `source='rubitime_projection'`, including stable `id`,
   `organization_id`, `branch_id`, `room_id`, `specialist_id`, `service_id`, optional
   `platform_user_id`, times/duration, status, attribution, and `deleted_at`.
3. `be_external_entity_mappings`: transfer all `external_system='rubitime' AND
entity_type='appointment'` rows, preserving stable mapping id, canonical id, organization, external id,
   metadata, and timestamps.
4. `be_appointment_events` and `be_appointment_history_events`: transfer rows for the bundled canonical
   Rubitime appointment ids, preserving event ids/types/timestamps and payloads in the secured transfer
   channel. These rows carry the projection/import baseline and fallback scope reason.
5. Manifest only, aggregate/no PII: source commit, source/target snapshot timestamps, counts, anti-join
   counts, and hashes of the sorted key sets. Do not commit the state bundle itself.

Do not transfer `integrator.rubitime_records` or `integrator.rubitime_events` as canonical final state;
audit the target's raw source separately. Do not synthesize or replace `be_appointment_reschedules`: the
Rubitime bridge intentionally does not write it. Existing target reschedule/lifecycle rows must be
preserved. `be_patient_timeline_events` is also not produced by this R1 bridge and is outside the bundle.

Rubitime appointment mappings whose canonical target is not a `rubitime_projection` row must be left as
target dependencies and explicitly classified; the transfer must not overwrite native/admin-manual rows.

### Required target dependencies

The target must already contain the same referenced UUIDs in `be_organizations`, `be_specialists`,
`be_branches`, optional `be_rooms`, `be_clinic_services`, and optional `platform_users`. It must also have
valid active `be_organization_members` for specialist ownership. These tables are preflight dependencies,
not part of the R1 transfer bundle. Missing dependency UUIDs abort the transfer; they must not be guessed or
recreated from legacy text.

`platform_user_contacts`, legacy `branches`, and Rubitime branch/specialist/service mappings are required
to replay the resolver, but are not required to apply already-resolved appointment rows. They remain useful
for audit and must not be deleted during R1.

### Transaction order and invariants

Apply only after provider cutoff or a proven source/target snapshot boundary:

1. Compare source and target legacy/raw external-id sets. Abort on target-only rows until they are separately
   audited/imported; never delete them to make counts match.
2. Validate every referenced dependency UUID and tenant relationship.
3. Begin one target transaction and load secured staging rows.
4. Upsert canonical Rubitime appointments by stable UUID without touching non-Rubitime canonical rows.
5. Upsert Rubitime appointment mappings by `(external_system, entity_type, external_id)`.
6. Insert/upsert both event streams by stable event UUID.
7. Apply legacy `deleted_at` state by `integrator_record_id`; never hard-delete.
8. Run all invariants below before commit; rollback on any failure.

Required invariants:

- every bundled appointment has non-null `organization_id`, `end_at > start_at`, allowed status/source,
  and all FK targets present;
- every live historical Rubitime projection has resolved `specialist_id`; branch/service remain nullable only
  where the audited source final state already had no recoverable value;
- appointment branch/specialist/service rows, when present, belong to the same organization;
- each Rubitime appointment external id maps exactly once; mapping organization equals appointment
  organization; mapping canonical target exists;
- mapping metadata is preserved byte-for-byte; metadata lacking `projectedFrom`, `sourceTable`, or
  `manualRecovery` remains an explicit owner-review bucket rather than being silently rewritten;
- every transferred projection has at least one canonical event and at least one canonical history event;
- a live legacy row never maps to a soft-deleted canonical appointment;
- a deleted legacy row may map to a live canonical appointment only when another live legacy mapping points
  to that same canonical row (the duplicate-safe stale-cleanup case);
- a soft-deleted canonical appointment has no live legacy mapping;
- no active specialist overlap/no-overlap constraint violation exists;
- post-transfer classifier gates remain `stale=0`, `unmapped_real_active=0`, and
  `duplicate_clusters=0`; dual-source mapping/FK/organization anomaly counts are zero or explicitly
  owner-approved; doctor list/calendar/KPI smoke is still required.

## Exact next actions

1. Owner supplies a fresh current unified dump and the exact cutoff CSV to an approved non-prod path.
2. Restore to a new loopback rehearsal DB, run current migrations, then require:

   ```bash
   DATABASE_URL='<loopback-rehearsal-url>' \
   node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs \
     --csv=<fresh-rubitime-csv>
   ```

3. Prefer building/applying the secured transfer bundle above from the audited final current-dev state.
4. If source/target key-set comparison shows target-only late rows, handle that delta separately through the
   canonical importer before transfer acceptance; do not rerun broad cleanup over the whole target.
5. Rerun aggregate classifier, dual-source audit, history coverage, FK/tenant/deletion invariants, and doctor
   smoke. Only then mark the clean-copy rehearsal PASS and prepare a production runbook.

## Repository changes and checks

- Added `rubitime-r1-clean-dump-preflight.mjs`.
- Explicit `DATABASE_URL` now bypasses unreadable repo-local env files in the two read-only R1 audit scripts.
- Updated the R1 cleanup runbook to require the preflight before cleanup/import.
- Checks: `node --check` for all changed `.mjs` scripts and path-scoped `git diff --check`.
