# Rubitime retirement final gate manifest

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This manifest is the single machine-readable status packet for the last Rubitime retirement gates.

It does not claim retirement is complete. It records which final checklist items are already proven and which
items are still blocked by owner-approved production cutoff/drain, production flag acceptance, or archive/drop proof.

Machine checks:

```bash
pnpm run check:rubitime-final-gate
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs --require-complete
```

The default check verifies that every current blocker has an explicit expected proof and gate. The
`--require-complete` mode is the final retirement gate and must fail until all final proof artifacts exist.

## Required Missing Final Proofs

| Proof | Required before | Gate |
| --- | --- | --- |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` | R5 final checkbox | Owner-approved production flag change plus monitoring window showing no v1 requests. |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` | R6 route/code removal final acceptance | Owner-approved provider cutoff, disabled webhook/outbound bridge, drained queues, fresh post-cutoff CSV reconciliation. |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` | R7 archive/drop final acceptance | R1-R6 complete, owner archive/drop decision, archive export, migration-backed drop/defer proof, fresh restore/migrate proof. |

## Current Blocking Items

| ID | Checklist item | Status | Expected proof |
| --- | --- | --- | --- |
| `R5-PROD-DISABLE` | R5 legacy v1 resolve disabled in production | `gated` | `RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` |
| `R6-RUNTIME-REMOVAL` | R6 runtime routes/code removed | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `R7-ARCHIVE-DROP` | R7 archive/drop complete or explicitly deferred with no runtime references | `gated` | `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` |
| `NO-RUNTIME-RUBITIME-API` | No runtime code calls Rubitime API | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` plus post-R6 static inventory |
| `NO-RUBITIME-PROVIDER-ROUTE` | No runtime route accepts Rubitime webhook/provider traffic | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `ONLY-PROVIDER-NEUTRAL-LIFECYCLE-ROUTE` | Provider-neutral booking lifecycle route is the only live lifecycle integration route | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `ALL-RR-PROOFS-SAVED` | All `RR-PROOF-*` artifacts are saved | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` and `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` |
| `PRODUCTION-ROLLBACK-BOUNDARY-ACCEPTED` | Production rollback boundary is accepted by owner | `gated` | R5/R6/R7 proof files with owner acceptance notes |

## Non-Negotiable Data Canon

- Fresh Rubitime CSV decides the preservation set.
- The approved CSV is one-specialist context: `89643805480` / tail `9643805480`, matched through existing city/branch mappings.
- `integrator.rubitime_records` is audit-only when the CSV exists.
- Integrator-only rows absent from the fresh CSV must not be imported, resurrected, or used as final-gate blockers.

## How To Use

1. Keep `RUBITIME_RETIREMENT_EXECUTION_PLAN.md` section 15 unchecked for every item listed above until the expected
   proof exists.
2. Run `pnpm run check:rubitime-final-gate` before any handoff. It should pass while the blockers are explicitly
   documented.
3. Run `node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs --require-complete` only when claiming
   final Rubitime retirement. It must fail until all blockers are converted to `pass` with proof files.
4. Do not create placeholder proof files to satisfy the checker. Proof files must contain real command output,
   owner decisions and commit hashes from the relevant production/non-prod run.
