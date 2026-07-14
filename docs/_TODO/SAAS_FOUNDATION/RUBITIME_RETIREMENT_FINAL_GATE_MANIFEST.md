# Rubitime retirement final gate manifest

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This manifest is the single machine-readable status packet for the last Rubitime retirement gates.

It does not claim retirement is complete. It records which final checklist items are already proven and which
items are still blocked by owner-approved live cutoff/drain, live flag acceptance, or archive/drop proof.

Machine checks:

```bash
pnpm run check:rubitime-db-cleanup-sequence
pnpm run check:rubitime-retirement-current
pnpm run check:rubitime-final-gate
pnpm run check:rubitime-retirement-complete
```

repo-first DB cleanup sequence for the current prep scope:
`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. It is a handoff package, not final proof.
The final live/archive blockers below remain gated until real R5/R6/R7 proof files exist.

The default check verifies that every current blocker has an explicit expected proof and gate. The
`check:rubitime-retirement-complete` is the final retirement gate and must fail until all final proof artifacts
exist. It intentionally runs every final sub-gate and reports all blockers, instead of stopping at the first failure.
The checker also reads `RUBITIME_RETIREMENT_EXECUTION_PLAN.md` section 15: gated items must remain unchecked.
Owner-facing remaining decisions are consolidated in `RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`.
If a final proof file exists, the checker validates its required content fragments against that packet.
The same fragments are present in `.template.md` files next to each expected final proof; templates are not final
proofs and must not be renamed until the corresponding owner-approved operation is executed. Real proof files must
not contain template placeholders such as `TODO:` or template warning text; the checker fails if they do.

## Required Missing Final Proofs

| Proof | Required before | Gate |
| --- | --- | --- |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` | R5 final checkbox | Owner-approved live flag change plus monitoring window showing no v1 requests and no user-facing need for v1 profile resolution. |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` | R6 route/code removal final acceptance | Owner-approved provider cutoff, disabled webhook/outbound bridge, drained queues, fresh post-cutoff CSV reconciliation with CSV as canon and integrator-only rows audit-only. |
| `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` | R7 archive/drop final acceptance | R1-R6 complete, owner archive/drop decision, archive-only export, migration-backed drop/defer proof, fresh restore/migrate proof. |

Templates:

- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.template.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.template.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.template.md`

Runbooks:

- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`

## Current Blocking Items

| ID | Checklist item | Status | Expected proof |
| --- | --- | --- | --- |
| `R5-LIVE-DISABLE` | R5 legacy v1 resolve disabled in live environment | `gated` | `RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` |
| `R6-RUNTIME-REMOVAL` | R6 runtime routes/code removed | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `R7-ARCHIVE-DROP` | R7 archive/drop complete or explicitly deferred with no runtime references | `gated` | `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` |
| `NO-RUNTIME-RUBITIME-API` | No runtime code calls Rubitime API | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` plus post-R6 static inventory |
| `NO-RUBITIME-PROVIDER-ROUTE` | No runtime route accepts Rubitime webhook/provider traffic | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `ONLY-PROVIDER-NEUTRAL-LIFECYCLE-ROUTE` | Provider-neutral booking lifecycle route is the only live lifecycle integration route | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` |
| `ALL-RR-PROOFS-SAVED` | All `RR-PROOF-*` artifacts are saved | `gated` | `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` and `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` |
| `LIVE-ROLLBACK-BOUNDARY-ACCEPTED` | Live rollback boundary is accepted by owner | `gated` | R5/R6/R7 proof files with owner acceptance notes |

## Non-Negotiable Data Canon

- Fresh Rubitime CSV decides the preservation set.
- The approved CSV is one-specialist context: `89643805480` / tail `9643805480`, matched through existing city/branch mappings.
- `integrator.rubitime_records` is audit-only when the CSV exists.
- Integrator-only rows absent from the fresh CSV must not be imported, resurrected, or used as final-gate blockers.
- Extra rows present only in `integrator.rubitime_records` do not expand the preservation set and do not justify a
  new backfill.
- Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot create a new
  import backlog or block final gates for rows absent from the CSV.

## How To Use

1. Keep `RUBITIME_RETIREMENT_EXECUTION_PLAN.md` section 15 unchecked for every item listed above until the expected
   proof exists. The checker fails if a gated section-15 item is marked `[x]`.
2. Run `pnpm run check:rubitime-final-gate` before any handoff. It should pass while the blockers are explicitly
   documented.
3. Run `pnpm run check:rubitime-retirement-current` before any handoff to cover all current non-destructive Rubitime
   retirement checks in one command.
4. Run `pnpm run check:rubitime-retirement-complete` only when claiming final Rubitime retirement. It must fail until
   all blockers are converted to `pass` with proof files.
5. Do not create placeholder proof files to satisfy the checker. Proof files must contain real command output,
   owner decisions and commit hashes from the relevant live/TEST run. Files containing template `TODO:`
   placeholders or template warning text fail the final gate.
6. If a proof file exists but omits required fragments from `RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`, the checker
   fails even in default mode.
7. Use the `.template.md` files as copy sources only after the corresponding operation is approved and executed.
