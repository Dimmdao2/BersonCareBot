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

The script emits paths/counts, not row data. It excludes tests/spec files and does not scan docs/archive as runtime
evidence. Ops/audit scripts are reported separately as `rubitimeOpsToolingRefs`; they are not post-R6 runtime
blockers unless they are wired into live runtime code.

## Current pre-cutoff output summary

Latest run time after legacy integrator source cleanup: 2026-07-14 11:16 MSK.

| Category | Phase | Current result | Meaning |
| --- | --- | ---: | --- |
| `mountedRubitimeRouteLiterals` | R6 | 0 hits / 0 files | No Rubitime-named runtime route surfaces remain in scanned runtime source. |
| `integratorRubitimeRuntimeImports` | R6 | 0 hits / 0 files | Integrator app wiring no longer imports/mounts Rubitime runtime registrars. |
| `rubitimeApiClientRuntimeTokens` | R6 | 0 hits / 0 files | No Rubitime API client/throttle/post-create runtime tokens remain. |
| `legacyAppointmentRecordRuntimeRefs` | R6/R7 | 148 hits / 30 files | Legacy appointment table references remain for archive/backfill/compat paths. |
| `rubitimeRawTableRuntimeRefs` | R7 | 131 hits / 26 files | Raw Rubitime table/queue references remain until R6 removal and R7 archive/drop decision. |
| `providerNeutralKeepTableRefs` | R7 keep-list | 159 hits / 38 files | Explicit keep-list references, not a drop signal. |
| `rubitimeOpsToolingRefs` | R6/R7 ops | 552 hits / 22 files | Ops/audit/backfill scripts with Rubitime references; reported, not a post-R6 runtime blocker. |

The post-R6 static inventory gate now passes for runtime Rubitime route/API blockers:

```text
mountedRubitimeRouteLiterals=0
integratorRubitimeRuntimeImports=0
rubitimeApiClientRuntimeTokens=0
```

This does not by itself complete R6 because `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` still requires owner-approved
cutoff/drain, fresh post-cutoff CSV reconciliation and proof capture.

## Current R6 blocker files

Mounted Rubitime route literals:

- none after `R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14`.

Integrator Rubitime runtime imports:

- none after `R6-INTEGRATOR-RUNTIME-WIRING-codex-2026-07-14`.

Rubitime API/client/runtime tokens:

- none after `R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14`.

Ops/audit/backfill tooling with Rubitime references is reported under `rubitimeOpsToolingRefs`. It includes
historical backfills, schema cleanup scans, phone-admin purge tooling and seed/audit scripts. These files are not
allowed to call live Rubitime endpoints after R6, but their archival/table references do not make the R6 runtime gate
fail by themselves.

## How to use this in R6/R7

1. Before owner-approved cutoff/drain: use this document as inventory only.
2. After cutoff/drain proof passes: remove/unmount Rubitime runtime routes and connector code.
3. Run `node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`.
4. R6 code removal is not complete until the three post-R6 categories above are zero. Remaining
   `rubitimeOpsToolingRefs` must stay ops-only and must not be wired into runtime routes/workers.
5. R7 archive/drop is not complete until this static inventory, the R7 runbook reference scans, fresh restore/migrate
   proof, and owner archive/drop decision all pass.

## 2026-07-14 R6 Integrator Wiring Cleanup

`R6-INTEGRATOR-RUNTIME-WIRING-codex-2026-07-14` removed active integrator wiring for Rubitime record M2M routes,
Rubitime admin M2M routes, Rubitime webhook registrar default injection, Rubitime registry capability, and the
operator-health outbound Rubitime schedule probe. The provider-neutral
`/api/bersoncare/booking/lifecycle-event` route remains mounted.

This does not close R6. Remaining post-R6 blockers are legacy source modules with Rubitime route literals and API
client/throttle/post-create tokens, plus the webapp Rubitime M2M/admin client cleanup.

## 2026-07-14 R6 Webapp M2M Client Cleanup

`R6-WEBAPP-M2M-CLIENT-RETIRE-codex-2026-07-14` retired webapp Rubitime M2M/admin clients without removing the
provider-neutral lifecycle emitter. `createBookingSyncPort().emitBookingEvent` remains the signed webapp to integrator
lifecycle-event path. Legacy slots/create/update/cancel/delete methods fail closed without HTTP, and the Rubitime admin
M2M facade fails closed without calling integrator.

After this cleanup, the post-R6 inventory no longer reports webapp files under `mountedRubitimeRouteLiterals`.
Remaining route literal blockers are the legacy integrator Rubitime source modules listed above.

## 2026-07-14 R6 Legacy Integrator Source Cleanup

`R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14` removed legacy Rubitime route source, external API client,
throttle, post-create projection and related tests from `apps/integrator/src/integrations/rubitime`. The old
compare/resync ops scripts no longer import the live Rubitime client and fail closed with
`rubitime_external_api_retired` for external fetch attempts.

After this cleanup, `node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`
passes for the R6 runtime route/API blocker categories. R6 still needs the owner-approved cutoff/drain proof before
the final checklist may be checked.
