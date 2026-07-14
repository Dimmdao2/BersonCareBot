# Rubitime retirement R6/R7 static inventory

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.
Commit when created: pending commit after this document.

## Scope

This is a static, aggregate-only pre-cutoff inventory for R6/R7. It does not prove R6 complete and does not approve
R7 archive/drop. It records what must become zero only after the owner-approved cutoff/drain proof allows Rubitime
runtime route/code removal.

No production DB, env, service, webhook, Rubitime endpoint, or patient data was accessed.

## Tool

Command:

```bash
pnpm run check:rubitime-retirement-inventory
```

Underlying script:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs
```

Post-R6 gate command:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
```

The script scans runtime source roots only and emits paths/counts, not row data. It excludes tests/spec files and does
not scan docs/archive as runtime evidence.

## Current pre-cutoff output summary

Run time: 2026-07-14 09:39 MSK.

| Category | Phase | Current result | Meaning |
| --- | --- | ---: | --- |
| `mountedRubitimeRouteLiterals` | R6 | 51 hits / 5 files | Rubitime-named HTTP surfaces still exist before cutoff. |
| `integratorRubitimeRuntimeImports` | R6 | 13 hits / 6 files | Integrator still wires/imports Rubitime runtime code before cutoff. |
| `rubitimeApiClientRuntimeTokens` | R6 | 26 hits / 10 files | Rubitime client/throttle/post-create/retry code still exists before cutoff. |
| `legacyAppointmentRecordRuntimeRefs` | R6/R7 | 159 hits / 38 files | Legacy appointment table references remain for archive/backfill/compat paths. |
| `rubitimeRawTableRuntimeRefs` | R7 | 120 hits / 24 files | Raw Rubitime table references remain until R6 removal and R7 archive/drop decision. |
| `providerNeutralKeepTableRefs` | R7 keep-list | 159 hits / 38 files | Explicit keep-list references, not a drop signal. |

The expected post-R6 gate currently fails:

```text
rubitime-r6-r7-static-inventory: post-R6 blockers remain:
mountedRubitimeRouteLiterals=51,
integratorRubitimeRuntimeImports=13,
rubitimeApiClientRuntimeTokens=26
```

This failure is expected before `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` exists. It becomes a hard validation
failure after R6 code removal.

## Current R6 blocker files

Mounted Rubitime route literals:

- `apps/integrator/src/integrations/rubitime/adminM2mRoute.ts`
- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
- `apps/integrator/src/integrations/rubitime/webhook.ts`
- `apps/webapp/src/modules/integrator/bookingM2mApi.ts`
- `apps/webapp/src/modules/integrator/rubitimeAdminApi.ts`

Integrator Rubitime runtime imports:

- `apps/integrator/src/app/di.ts`
- `apps/integrator/src/app/operatorHealthProbeRunner.ts`
- `apps/integrator/src/app/routes.ts`
- `apps/integrator/src/infra/scripts/compare-rubitime-records.ts`
- `apps/integrator/src/infra/scripts/resync-rubitime-records.ts`
- `apps/integrator/src/integrations/registry.ts`

Rubitime API/client/runtime tokens:

- `apps/integrator/src/infra/db/repos/jobQueue.ts`
- `apps/integrator/src/infra/db/schema/integratorQueues.ts`
- `apps/integrator/src/integrations/rubitime/client.ts`
- `apps/integrator/src/integrations/rubitime/postCreateProjection.ts`
- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
- `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts`
- `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts`
- `apps/webapp/src/infra/platformUserFullPurge.ts`
- `apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts`
- `apps/webapp/scripts/user-phone-admin.ts`

## How to use this in R6/R7

1. Before owner-approved cutoff/drain: use this document as inventory only.
2. After cutoff/drain proof passes: remove/unmount Rubitime runtime routes and connector code.
3. Run `node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`.
4. R6 code removal is not complete until the three post-R6 categories above are zero or the remaining files are
   explicitly reclassified into non-runtime archive tooling with a documented owner-approved reason.
5. R7 archive/drop is not complete until this static inventory, the R7 runbook reference scans, fresh restore/migrate
   proof, and owner archive/drop decision all pass.
