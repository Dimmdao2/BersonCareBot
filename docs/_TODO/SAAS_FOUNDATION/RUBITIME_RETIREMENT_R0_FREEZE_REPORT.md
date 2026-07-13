# Rubitime retirement R0 freeze report

Run id: `R0-freeze-codex-2026-07-14`

Scope: Phase R0 only. No R1/R2/R3 work, no backfill, no DB writes, no production/env/crontab changes, no Rubitime runtime removal.

## Static search report summary

Required first search was run before broad `rg`:

```bash
node /home/dev/brain/tools/code-search.mjs "rubitime booking read source static guard settings" --repo bcb -k 50
```

The BM25 index result pointed to the live read-source settings, BookingEngine settings UI, migration seeds `0099`/`0100`, patient-booking read source code, and current Rubitime architecture docs.

Focused `rg` inventory, excluding archives and R0 artifacts:

```bash
rg -l -i "rubitime|rubitime_legacy|booking_doctor_appointments_read_source|booking_slots_read_source|booking_rubitime_bridge_enabled|RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED" apps packages docs --glob '!docs/archive/**' --glob '!docs/_ARCHIVE/**' --glob '!docs/rubitime_queue_+_multi-slot_ae5a569b.plan.md' --glob '!docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R0_*' --glob '!docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs'
```

Baseline file counts:

| Area | Files |
| --- | ---: |
| `apps` | 480 |
| `docs` | 126 |
| `packages` | 17 |
| Total | 623 |

Key runtime settings still present:

- `booking_doctor_appointments_read_source`
- `booking_slots_read_source`
- `booking_rubitime_bridge_enabled`
- `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED`
- read-source values `rubitime_legacy` and `rubitime`

## Current route map

Integrator Rubitime routes:

| Method | Route | File |
| --- | --- | --- |
| `POST` | `/webhook/rubitime/:token` | `apps/integrator/src/integrations/rubitime/webhook.ts` |
| `GET` | `/api/rubitime` | `apps/integrator/src/integrations/rubitime/webhook.ts` |
| `POST` | `/api/bersoncare/rubitime/update-record` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| `POST` | `/api/bersoncare/rubitime/remove-record` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| `POST` | `/api/bersoncare/rubitime/create-record` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| `POST` | `/api/bersoncare/rubitime/slots` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| `POST` | `/api/bersoncare/rubitime/booking-event` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| `GET`/`POST`/`DELETE` | `/api/bersoncare/rubitime/admin/branches[/:id]` | `apps/integrator/src/integrations/rubitime/adminM2mRoute.ts` |
| `GET`/`POST`/`DELETE` | `/api/bersoncare/rubitime/admin/services[/:id]` | `apps/integrator/src/integrations/rubitime/adminM2mRoute.ts` |
| `GET`/`POST`/`DELETE` | `/api/bersoncare/rubitime/admin/cooperators[/:id]` | `apps/integrator/src/integrations/rubitime/adminM2mRoute.ts` |
| `GET`/`POST`/`DELETE` | `/api/bersoncare/rubitime/admin/booking-profiles[/:id]` | `apps/integrator/src/integrations/rubitime/adminM2mRoute.ts` |

Webapp Rubitime route files:

- `apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/route.ts`
- `apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/link/route.ts`
- `apps/webapp/src/app/api/admin/booking-engine/rubitime-mapping/duplicates/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/branches/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/branches/[id]/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/services/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/services/[id]/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/cooperators/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/cooperators/[id]/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/booking-profiles/route.ts`
- `apps/webapp/src/app/api/admin/rubitime/booking-profiles/[id]/route.ts`
- `apps/webapp/src/app/api/doctor/appointments/rubitime/cancel/route.ts`
- `apps/webapp/src/app/api/doctor/appointments/rubitime/update/route.ts`

## Current table/reference map

Drop/archive candidates after later proof, not touched in R0:

| Table/reference | Current evidence |
| --- | --- |
| `public.appointment_records` | `apps/webapp/db/schema/schema.ts`, `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts`; still referenced by legacy doctor/client/history projections. |
| `integrator.rubitime_records` | `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts`; raw/projection state. |
| `integrator.rubitime_events` | `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts`; raw webhook/event audit. |
| `integrator.rubitime_create_retry_jobs` | `apps/integrator/src/infra/db/schema/integratorQueues.ts`; retry/drain candidate. |
| `integrator.rubitime_api_throttle` | `apps/webapp/db/schema/schema.ts` shadow/introspection reference; runtime throttle candidate. |
| `rubitime_booking_profiles`, `rubitime_branches`, `rubitime_services`, `rubitime_cooperators` | `apps/webapp/db/schema/schema.ts` and integrator legacy profile/catalog code; v1 profile catalog candidate. |

Keep/migrate, not drop in Rubitime retirement R0:

| Table/reference | R0 disposition |
| --- | --- |
| `integrator.booking_calendar_map` / `public.booking_calendar_map` | Keep or migrate provider-neutral later; GCal map is not removed in R0. |
| `public.patient_bookings` | Compatibility/business booking table, not a Rubitime-owned drop target. |
| `public.be_external_entity_mappings` | Keep; Rubitime rows are traceability/mapping, table is canonical infrastructure. |
| `public.booking_cities`, `booking_branches`, `booking_branch_services`, `booking_services`, `booking_specialists` | Live patient/public catalog until R3-CATALOG proves replacement. |

## Guards/checks added

Added `docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs`.

The guard freezes current baseline and fails on:

- new imports from `apps/integrator/src/integrations/rubitime/**` outside the existing baseline allowlist;
- new imports from `@bersoncare/booking-rubitime-sync` outside existing baseline consumers;
- new `booking_doctor_appointments_read_source`, `booking_slots_read_source`, `booking_rubitime_bridge_enabled`, or `rubitime_legacy` branches outside existing baseline files;
- new webapp API route files with `rubitime` in `apps/webapp/src/app/api/**/route.ts`;
- new integrator `app.get/post/put/patch/delete(...rubitime...)` route literals outside the existing Rubitime route files.

Connected checks:

- `pnpm run check:rubitime-retirement-r0`
- root `pnpm lint` now runs the R0 guard after `scripts/check-db-chokepoint.mjs`.

## UI deprecation/internal-only marking

Safe R0 UI-only marking was applied:

- Booking admin tab label is now `Rubitime legacy`.
- Rubitime catalog details summary is now `Справочник Rubitime legacy/internal`.
- Booking engine integration controls label Rubitime read sources as `Rubitime legacy`.
- Integration-mode settings show a short internal retirement notice and label the bridge as `Rubitime-мост (legacy/internal)`.

No controls were disabled and no setting value semantics changed.

## R0 checklist

- [x] Static search report for current Rubitime references is saved.
- [x] No-new-Rubitime-dependency guard is added.
- [x] Rubitime settings UI is marked deprecated/internal-only.
- [x] New route/feature work is blocked from adding `rubitime` / `rubitime_legacy` branches through the R0 guard.
- [x] Current Rubitime route map is recorded.
- [x] Current Rubitime table/reference map is recorded.
- [x] R0 review confirms no runtime behavior changed.

Open items: none for R0. Later phases remain open by design.

## Execution log

Commands and results:

| Command | Result |
| --- | --- |
| `sed -n ... AGENTS.md`, `docs/ORCHESTRATION_BINDINGS.md`, R0 plan, required `.cursor/rules/*` | Read. |
| `find .cursor .claude .codex -maxdepth 3 -type f` | `.cursor` has rules/plans; `.claude` has no files/folder in this worktree; `.codex` exists and is empty. |
| `node /home/dev/brain/tools/code-search.mjs "rubitime booking read source static guard settings" --repo bcb -k 50` | Passed; baseline index search completed before broad `rg`. |
| Focused `rg` inventory above | Passed; 623 baseline files excluding archives/R0 artifacts. |
| `rg -n "app\\.(get\|post\|delete)\\(...rubitime" apps/integrator/src/integrations/rubitime --glob '*.ts'` | Passed; route map recorded. |
| `find apps/webapp/src/app/api -type f -path '*rubitime*' -name 'route.ts'` | Passed; route map recorded. |
| `rg -n "export const ...|be_external_entity_mappings" apps/webapp/db/schema apps/integrator/src/infra/db/schema --glob '*.ts'` | Passed; table/reference map recorded. |
| `pnpm run check:rubitime-retirement-r0` | Passed. |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs --self-test` | Passed. |
| `pnpm exec eslint docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs apps/webapp/src/app/app/settings/BookingEngineSection.tsx apps/webapp/src/app/app/doctor/admin/booking/bookingAdminTabs.ts apps/webapp/src/app/app/doctor/admin/booking/integrations/page.tsx` | Passed with 0 errors; app files were reported as ignored by current ESLint patterns. |
| `pnpm --dir apps/webapp run lint` | Passed. |
| `pnpm --dir apps/webapp typecheck` | Passed. |
| `pnpm lint` | Failed before reaching the R0 guard on pre-existing integrator `no-secrets/no-secrets` findings for literal `DB_PRINCIPAL_CONTEXT_MODE=locked` in `apps/integrator/src/infra/runtime/scheduler/main.ts`, `worker/main.ts`, and `worker/outgoingDeliveryWorker.ts`. |

Implementation note: an initial patch was accidentally applied to sibling `/home/dev/dev-projects/BersonCareBot` because the tool cwd differed from the requested worktree. Those self-made changes were immediately reverted; `git status --short` there returned clean before continuing in `/home/dev/dev-projects/bcb-walls`.

## R0 runtime review

R0 changed only:

- static guard script and npm check wiring;
- UI labels/internal deprecation copy;
- this report and the R0 checklist in the execution plan.

No route handler behavior, service behavior, read-source parsing, DB schema, migrations, env, cron, production runtime, or Rubitime integration runtime was changed.
