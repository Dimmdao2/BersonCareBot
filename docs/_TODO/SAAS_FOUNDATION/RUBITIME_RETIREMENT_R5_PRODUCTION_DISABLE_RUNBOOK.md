# Rubitime retirement R5 production disable runbook

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

> **SUPERSEDED / HISTORICAL REFERENCE — 2026-07-22 Track C.** The resolver source was removed. This file is retained
> solely for historical/final-gate filename compatibility; none of its flag-edit, restart, monitoring, or rollback
> commands is executable for the current incremental TEST milestone or for PROD. Do not set or restore
> `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED`. Current R5 acceptance is TEST negative/unmounted route evidence plus
> healthy canonical booking smoke, as defined in the execution plan.

## Current Track C status — non-executable historical reference

The prepared flag-change, PROD env-edit, service-restart, monitoring and resolver-restore procedure that formerly
lived here is removed. It is superseded because the resolver source is gone. Do not recreate it: no flag is set or restored, no PROD env or service is changed, and no retired v1 resolver is restored for this milestone.

The historical filename remains solely because final-gate materials refer to it. It does not authorize an operation.
Current R5 TEST acceptance is still **open** and requires a declared TEST window with aggregate-only counts,
negative/unmounted retired-route observations, canonical booking smoke, and a rollback boundary that does not
re-enable the removed resolver. The expected evidence file retains its historical filename:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md`

Do not create a placeholder proof file. R5 is not complete and is not awaiting PROD monitoring.
