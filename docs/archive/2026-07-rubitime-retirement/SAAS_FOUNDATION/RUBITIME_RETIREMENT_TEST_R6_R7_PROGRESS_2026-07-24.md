# Rubitime retirement on TEST — R6 drain + R7 batch plan (2026-07-24)

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

> Track C execution progress on TEST (owner authorized the destructive batch ON TEST, not prod). Runbooks remain
> authoritative: `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`, `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`,
> `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. Sequence: R6 drain → R3C-11 branchServiceId removal → R7 archive+DROP.

## R6 drain state on TEST — PROVEN CLEAN (read-only, 2026-07-24)

- `integrator.projection_outbox`: `outbox_due = 0`, `outbox_dead = 0` (3330 done, 9 cancelled). ✓
- Provider quiet: `integrator.rubitime_records` = 91 total, **0 updated in last 24h**. ✓
- `rubitime_create_retry_jobs` renamed → `message_retry_jobs` (generic delivery queue, KEEP); its 46 stuck
  `message.deliver` rows were cleared earlier (owner-authorized test junk). ✓
- No live Rubitime exchange on TEST (send-safety; no provider) → drain trivially satisfied. R6 pass-criteria met.

## R3C-11 branchServiceId removal — IN PROGRESS (worker)

Gates the legacy `booking_*` catalog drop. Removing the deprecated `branchServiceId` compat shim (catalog already
migrated to `be_*`). `patient_bookings.branchServiceId` = historical trace-only, untouched.

## R7 batch plan (for owner GO on the exact list before any DROP)

7 `integrator.rubitime_*` tables present on TEST:

| Table                       | Rows | Disposition                                         |
| --------------------------- | ---- | --------------------------------------------------- |
| `rubitime_records`          | 91   | **ARCHIVE** (pg_dump --data-only + SHA) → then DROP |
| `rubitime_events`           | 409  | **ARCHIVE** → then DROP                             |
| `rubitime_api_throttle`     | —    | **DROP** (after archive + static no-ref)            |
| `rubitime_booking_profiles` | —    | **DROP**                                            |
| `rubitime_branches`         | —    | **DROP**                                            |
| `rubitime_services`         | —    | **DROP**                                            |
| `rubitime_cooperators`      | —    | **DROP**                                            |

Also archive `public.appointment_records` before its (later) removal. `message_retry_jobs`, `patient_bookings`,
`be_external_entity_mappings`, `integrator.booking_calendar_map`, `public.booking_*` (until R3C-11 done) = **KEEP**.

**Gates before DROP (per runbook):** R3C-11 done → archive done + SHA256SUMS → `pnpm run
check:rubitime-retirement-inventory --expect-post-r6` green + `rg` shows only docs/archives/migrations → generate a
NORMAL repo migration for the DROP (no ad-hoc DROP) → **explicit owner GO on this exact table list** → disposable
restore+migrate proof. Then apply on TEST.

## R7 code cleanup + migration authoring — DONE (worker, not yet applied)

- Last runtime reader removed: `apps/webapp/src/infra/platformUserFullPurge.ts` GDPR full-purge no longer
  deletes from `rubitime_records` / `rubitime_events` (dropped tables make purging them moot). Test added
  in `platformUserFullPurge.bridge.test.ts` proving other purge targets (`message_retry_jobs`, `users`) stay
  intact and no SQL references the two dropped tables.
- Static reference audit (`check:rubitime-retirement-inventory`) confirms `platformUserFullPurge.ts` no
  longer appears under `rubitimeRawTableRuntimeRefs`; only declarative Drizzle schema mirrors remain
  (`apps/integrator/src/infra/db/integratorDrizzleSchema.ts`, `.../schema/integratorDomainRepos.ts` — type
  declarations, not a query path, not gated).
- DROP migration authored (idempotent, not applied to any DB):
  `apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql`.
- FK check: only internal FK is `rubitime_booking_profiles` -> `rubitime_branches`/`rubitime_services`/`rubitime_cooperators`,
  all in the same drop batch; no table outside the batch references any of the 7.
- `pnpm --dir apps/integrator typecheck`, `pnpm -C apps/webapp run typecheck`, touched vitest, and
  `check:rubitime-r7-table-disposition` / `check:rubitime-retirement-inventory` all green.
- NOT done here: applying the migration to any DB (orchestrator's job on TEST after independent audit).

## Status

R6 drain ✓ · R3C-11 done (merged) · **R7 APPLIED on TEST 2026-07-24** — 7 rubitime raw tables DROPPED (archived first),
deploy GREEN (p0-5b deploy-breaker fixed, no FATAL), smoke 22/22, KEEP tables intact (message*retry_jobs/
appointment_records/patient_bookings/booking*_/be*external_entity_mappings/booking_calendar_map). Merge 50880c042.
Re-verified live on TEST 2026-07-24 (separate worker pass): all 7 tables confirmed absent (`to_regclass` NULL) and
migration `rubitime:20260724_0002_drop_r7_raw_tables.sql` confirmed in `integrator.schema_migrations`
(`applied_at 2026-07-24 17:34:46+03`). This "R7 applied" line is correct; do not trust any later report that
claims the R7 drop migration is unapplied on TEST without re-querying the live DB/ledger.
**Remaining Track C:** appointment_records drop (still has runtime refs — reconfirmed 2026-07-24, see
`RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` "Track C — appointment_records disposition"), legacy booking*_
catalog drop (~~unblocked by R3C-11, separate step~~ **SUPERSEDED 2026-07-24 — this was wrong**: R3C-11 only
removed the patient/public `resolveBranchService` compat path; the admin CRUD surface
(`pgBookingCatalog.ts` + 10 `/api/admin/booking-catalog/*` routes) and `pgRubitimeMapping.ts`'s admin
mapping-status view still read/write `booking_*` directly, so the tables are still referenced and the drop is
still blocked — see `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` "Track C — booking\_\* legacy catalog
disposition"), R6 connector/webhook code removal if any remains.
