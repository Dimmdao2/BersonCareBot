# Rubitime retirement R7 static reference audit

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.
Commit when created: pending commit after this document.

## Scope

This is a non-final post-R6 static reference audit. It does not approve archive/export/drop and does not create
`RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`.

No production DB, env, service, webhook, Rubitime endpoint, or patient data was accessed.

## Data Canon

Fresh Rubitime CSV is the canon for record preservation. `integrator.rubitime_records`, `integrator.rubitime_events`
and any raw archive are audit/rollback material only.

If a row exists only in integrator raw state and is absent from the fresh owner-approved Rubitime CSV, it must not be
imported, resurrected into canonical, or treated as an R1/R2 blocker. Raw archive export in R7 is for traceability and
rollback only; it does not expand the preservation set beyond the CSV.
Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot create a new import
backlog or block final gates for rows absent from the CSV.

The current owner-approved export context is the one-specialist Rubitime export for phone `89643805480` / tail
`9643805480`, matched through existing city/branch mappings.

## Code Cleanup Applied Before Audit

The following non-canonical Rubitime runtime source was removed before this audit:

- unused `apps/integrator/src/integrations/rubitime/*` runtime/test/config/schema files;
- Rubitime-specific e2e webhook scenario;
- autoloaded `apps/integrator/src/content/rubitime` orchestrator scripts/templates;
- `apps/integrator/src/infra/db/repos/bookingRecords.ts`, the only remaining runtime writer to
  `integrator.rubitime_events`;
- `writePort` special-case raw booking event journal write.

The historical SQL migration chain under `apps/integrator/src/integrations/rubitime/db/migrations/` was intentionally
kept. The integrator migrator still discovers integration migrations from `src/integrations/*/db/migrations`, so those
files are historical migration input until a later migration-backed R7 drop.

## Static Inventory

Command:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
```

Result from 2026-07-14 12:11 MSK:

| Category                             |              Result | Meaning                                                                                                                                                 |
| ------------------------------------ | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mountedRubitimeRouteLiterals`       |    0 hits / 0 files | No Rubitime-named runtime HTTP surface remains in scanned source.                                                                                       |
| `integratorRubitimeRuntimeImports`   |    0 hits / 0 files | No runtime imports from `apps/integrator/src/integrations/rubitime/**` remain.                                                                          |
| `rubitimeApiClientRuntimeTokens`     |    0 hits / 0 files | No live Rubitime API/client/throttle/post-create tokens remain.                                                                                         |
| `legacyAppointmentRecordRuntimeRefs` | 147 hits / 29 files | Legacy compatibility/archive/backfill references remain; not a CSV preservation blocker.                                                                |
| `rubitimeRawTableRuntimeRefs`        |   20 hits / 5 files | Raw-table references remain in schema declarations, active provider-neutral retry storage and strict purge cleanup. Ops tooling is reported separately. |
| `providerNeutralKeepTableRefs`       | 158 hits / 38 files | Explicit keep-list references, including `booking_calendar_map`; not a drop signal.                                                                     |
| `rubitimeOpsToolingRefs`             | 551 hits / 22 files | Ops/audit/backfill scripts; not a live Rubitime endpoint by themselves.                                                                                 |

## Reference Scan

Command:

```bash
rg -n "rubitime_records|rubitime_events|rubitime_api_throttle|rubitime_create_retry_jobs|rubitime_booking_profiles|rubitime_branches|rubitime_services|rubitime_cooperators|appointment_records|booking_calendar_map" \
  apps packages docs \
  --glob '!docs/archive/**' \
  --glob '!docs/archive/legacy-underscore/**'
```

Result: `3022` lines. Classification:

- Drizzle snapshots, legacy SQL migrations and DB dump docs dominate the count. These are not runtime call sites.
- `apps/integrator/src/integrations/rubitime/db/migrations/**` remains as historical migration chain only.
- `apps/integrator/src/infra/db/schema/*` and `apps/integrator/src/infra/db/integratorDrizzleSchema.ts` still declare
  existing tables until a migration-backed R7 drop.
- `apps/integrator/src/infra/db/repos/jobQueue.ts` still queries the legacy physical retry table as provider-neutral
  message retry storage; this is a storage migration/drop decision, not a live Rubitime API path.
- `apps/webapp/src/infra/platformUserFullPurge.ts` still deletes raw-table remnants during strict client purge; this is
  an active cleanup path and remains visible as runtime until the R7 table decision is implemented.
- `apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts` no longer reads `integrator.rubitime_records`; the admin
  bridge projection path only projects legacy `appointment_records` and does not resurrect integrator-only rows absent
  from the fresh CSV.
- `apps/webapp/src/infra/repos/pgDoctorAppointments.ts` and `pgAppointmentProjection.ts` still mention
  `appointment_records` for admin/projection/backfill compatibility. Doctor/client no-legacy-read gates remain
  separate and already cover visible runtime paths.
- `integrator.booking_calendar_map` remains explicitly kept while Google Calendar sync is active.

`node /home/dev/brain/tools/code-search.mjs ...` was also run during the audit flow, but the local code-search index
timestamp (`2026-07-14T08:15:02.065Z`) predates the cleanup in this commit and still showed deleted files. Final R7
proof must rerun code-search after index refresh or nightly reindex; this non-final audit uses the fresh static
inventory plus `rg` output above as the current source snapshot.

## Drop Scanner

Command:

```bash
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/05_drop_deprecated.ts --repo-root ../..
```

Result: command exited `0` in dry-run mode. It still reports `integrator.rubitime_records` and
`public.appointment_records` as unsafe. Its hardcoded reason text is stale after R6 cleanup, but the conclusion remains
correct for R7: destructive drop is not approved while schema declarations, compatibility/audit references, archive
decision and restore/migrate proof are still pending.

## Remaining R7 Gates

R7 remains pending until all of these exist:

- completed `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`;
- owner archive/drop decision;
- read-only schema audit on production host or fresh production dump restore;
- archive export evidence and SHA256SUMS for owner-approved raw tables;
- migration-backed drop/defer implementation, not ad hoc SQL;
- non-prod fresh restore + migrate proof;
- final `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`.

Until then, `pnpm run check:rubitime-retirement-complete` must stay red.

## 2026-07-14 11:51 MSK Raw Projection Cleanup

`R7-WEBAPP-RAW-PROJECTION-RETIRE-codex-2026-07-14` removed the `projectRubitimeRecords` port/service/repository path.
The admin booking bridge no longer scans `integrator.rubitime_records` during projection. This reduced
`rubitimeRawTableRuntimeRefs` from 70 hits / 19 files to 64 hits / 17 files.

Validation:

- `pnpm --dir apps/webapp exec vitest --run src/modules/booking-engine/service.test.ts src/infra/repos/pgBookingRubitimeBridge.test.ts`
  PASS.
- `pnpm --dir apps/webapp typecheck` PASS.
- `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6` PASS.

## 2026-07-14 12:06 MSK Generic Retry Queue Runtime Naming Cleanup

`R7-INTEGRATOR-GENERIC-RETRY-QUEUE-NAMING-codex-2026-07-14` renamed the integrator runtime Drizzle symbol for the
legacy physical queue table from `rubitimeCreateRetryJobs` to `messageRetryJobs`. At the time of this audit the
physical table `integrator.rubitime_create_retry_jobs` was not renamed or dropped and was not a Rubitime raw-table
drop candidate (it was already a repurposed provider-neutral message-delivery retry queue).

STALE, corrected 2026-07-24: per owner directive, the physical rename was done now instead of deferred to R7.
`integrator.rubitime_create_retry_jobs` is renamed to `integrator.message_retry_jobs` --
`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`.
It was never a Rubitime raw-table drop candidate and remains not one after the rename.

Static inventory after this cleanup:

| Category                             |              Result | Meaning                                                                                   |
| ------------------------------------ | ------------------: | ----------------------------------------------------------------------------------------- |
| `mountedRubitimeRouteLiterals`       |    0 hits / 0 files | No Rubitime-named runtime HTTP surface remains in scanned source.                         |
| `integratorRubitimeRuntimeImports`   |    0 hits / 0 files | No runtime imports from `apps/integrator/src/integrations/rubitime/**` remain.            |
| `rubitimeApiClientRuntimeTokens`     |    0 hits / 0 files | No live Rubitime API/client/throttle/post-create tokens remain.                           |
| `legacyAppointmentRecordRuntimeRefs` | 147 hits / 29 files | Legacy compatibility/archive/backfill references remain; not a CSV preservation blocker.  |
| `rubitimeRawTableRuntimeRefs`        |  63 hits / 17 files | Raw-table references remain for physical table names, schema declarations and R7 tooling. |
| `providerNeutralKeepTableRefs`       | 158 hits / 38 files | Explicit keep-list references, including `booking_calendar_map`; not a drop signal.       |
| `rubitimeOpsToolingRefs`             | 551 hits / 22 files | Ops/audit/backfill scripts; not a live Rubitime endpoint by themselves.                   |

Validation:

- `pnpm --dir apps/integrator test -- src/infra/adapters/jobQueuePort.test.ts src/infra/db/repos/jobQueue.test.ts`
  PASS.
- `pnpm --dir apps/integrator typecheck` PASS.
- `pnpm run check:rubitime-retirement-current` PASS.
- `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6` PASS.

## 2026-07-14 12:11 MSK Ops Tooling Classification Cleanup

`R7-STATIC-INVENTORY-OPS-CLASSIFY-codex-2026-07-14` updated
`rubitime-r6-r7-static-inventory.mjs` so `rubitimeRawTableRuntimeRefs` no longer double-counts ops/audit scripts.
Those files remain reported in `rubitimeOpsToolingRefs`, so the scanner still exposes them without treating them as
runtime raw-table references.

Static inventory after this cleanup:

| Category                             |              Result | Meaning                                                                                                            |
| ------------------------------------ | ------------------: | ------------------------------------------------------------------------------------------------------------------ |
| `mountedRubitimeRouteLiterals`       |    0 hits / 0 files | No Rubitime-named runtime HTTP surface remains in scanned source.                                                  |
| `integratorRubitimeRuntimeImports`   |    0 hits / 0 files | No runtime imports from `apps/integrator/src/integrations/rubitime/**` remain.                                     |
| `rubitimeApiClientRuntimeTokens`     |    0 hits / 0 files | No live Rubitime API/client/throttle/post-create tokens remain.                                                    |
| `legacyAppointmentRecordRuntimeRefs` | 147 hits / 29 files | Legacy compatibility/archive/backfill references remain; not a CSV preservation blocker.                           |
| `rubitimeRawTableRuntimeRefs`        |   20 hits / 5 files | Runtime/schema references remain only for Drizzle schema, provider-neutral retry storage and strict purge cleanup. |
| `providerNeutralKeepTableRefs`       | 158 hits / 38 files | Explicit keep-list references, including `booking_calendar_map`; not a drop signal.                                |
| `rubitimeOpsToolingRefs`             | 551 hits / 22 files | Ops/audit/backfill scripts; not a live Rubitime endpoint by themselves.                                            |

Remaining `rubitimeRawTableRuntimeRefs` are not safe repo-only deletes before owner R6 cutoff/drain proof, archive/drop
decision, and migration-backed R7 drop/defer. The cleanup did not create
`RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`, did not run SQL, and did not approve archive/export/drop.

Validation:

- `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6` PASS.
