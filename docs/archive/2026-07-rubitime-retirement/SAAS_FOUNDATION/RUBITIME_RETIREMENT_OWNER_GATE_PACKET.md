# Rubitime retirement owner gate packet

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the single owner/ops packet for the remaining Rubitime retirement gates.

It does not approve live-environment changes and does not replace the phase runbooks. It lists the exact owner decisions
and proof artifacts required before the final checklist may be completed.
`check-rubitime-final-gate` treats the proof bullet text below as the required content contract for final proof
files. If a proof file exists but omits these fragments, the check fails.
Use the sibling `.template.md` files as copy sources; they are not final proof and do not close any gate.

Canonical entrypoints:

- Agent start: `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`
- Execution plan: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`
- repo-first DB cleanup sequence: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`
- Final gate manifest: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md`
- R5 historical runbook: `docs/archive/2026-07-plans/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md`
- R6 runbook: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`
- R7 runbook: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`

Machine check:

```bash
pnpm run check:rubitime-db-cleanup-sequence
pnpm run check:rubitime-final-gate
```

The repo-first DB cleanup sequence is the current TEST/disposable SaaS handoff package. It does not ask the owner to
run live-environment operations for task `#757`; the owner gates below are only for later final execution.

## Data Canon

- Fresh Rubitime CSV decides the preservation set.
- The approved CSV is one-specialist context: `89643805480` / tail `9643805480`, matched through existing city/branch mappings.
- `integrator.rubitime_records` is audit-only when the CSV exists.
- Integrator-only rows absent from the fresh CSV must not be imported, resurrected, or used as final-gate blockers.
- Extra rows present only in `integrator.rubitime_records` do not expand the preservation set and do not justify a
  new backfill.
- Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot create a new
  import backlog or block final gates for rows absent from the CSV.

## Remaining Owner Gates

### Gate 0 — R3-CATALOG compatibility deadline

The `2026-07-21` deadline expired while patient/public `branchServiceId` compatibility remains live. The narrower
`RR-PROOF-05` table-read proof remains valid, but final R3-CATALOG closure is reopened.

Owner decision required:

- either approve a new exact cutoff after evidence that old URLs/rows are drained, followed by a bounded code stage
  that rejects legacy `branchServiceId` and requires `branchId+serviceId`;
- or explicitly defer/rebaseline the compatibility adapter with a new date, reason and rollback boundary.

Until this decision and its evidence exist, agents must not remove the adapter by inference and R7 must continue to
defer public `booking_*` catalog drop planning. See
`RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`.

### Gate 1 — R5 TEST retired-route acceptance (PROD untouched)

Required proof:

**ABSENT / PENDING in this historical packet:** the expected
`RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` was never materialized. The real R5 template, runbook and
legacy source proof remain under `docs/archive/2026-07-plans/SAAS_FOUNDATION/`; none is a final proof.

The historical proof filename is retained for final-gate compatibility, but it is not a flag-change authorization.
The resolver source is removed: `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED` must not be set or restored in TEST or
PROD. For this Track C milestone, owner evidence is only the declared TEST window and, if required, its exact
timestamp/operator; PROD remains untouched.

Proof must include:

- TEST integrated SHA and declared monitoring-window start/end;
- monitoring window start/end;
- aggregate v1 `/api/bersoncare/rubitime/slots` request count;
- aggregate v1 `/api/bersoncare/rubitime/create-record` request count;
- source of aggregate counts without secrets or PII;
- TEST negative/unmounted result for the retired v1 routes, without assuming `legacy_resolve_disabled`;
- canonical slots/create/reschedule/cancel and doctor Today/KPI/calendar/list smoke;
- aggregate-only source of route/error counts without secrets or PII;
- incremental code rollback boundary, if tested, without re-enabling the removed resolver.

The superseded production-flag contract is not a machine proof contract and cannot close this gate. It remains only
as a historical manifest row; the current TEST evidence bullets above are the complete R5 contract.

### Gate 2 — R6 cutoff/drain/runtime removal

Required proof:

`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`

Owner decisions required:

- approve provider cutoff timestamp;
- confirm external Rubitime webhook ingress is disabled;
- confirm outbound Rubitime bridge is disabled;
- approve treatment of any non-zero pending/dead queue rows;
- approve fresh post-cutoff CSV reconciliation result.

Repository route/code removal artifacts already exist, but they were applied before the mandatory cutoff/drain
proof. The owner must also decide whether those artifacts remain dormant repository provenance until Gate 2 is
executed, or whether a separately scoped restoration is required before any deployment. Agents must not infer either
choice; repository provenance alone does not close R6.

The linked R6 runbook is a production/final reference and is **non-executable for this Track C incremental TEST
milestone**. Do not substitute TEST env/host paths into it. The next routine milestone is the integrated-SHA gate,
forward-migration compatibility check, `deploy/host/deploy-test.sh`, and TEST smoke; cutoff/drain begins only after
a separately recorded TEST cutoff/operator decision and TEST-valid operational runbook.

Proof must include the sections required by `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`:

- backup filename;
- read-only drain snapshot;
- runtime Rubitime traffic snapshot before/after disable;
- fresh CSV filename, size, date span and reconciliation output;
- fresh CSV is canon; integrator-only rows absent from CSV are audit-only;
- integrator-led reconciliation is forbidden when the fresh CSV exists;
- one-specialist context: `89643805480` / tail `9643805480`;
- matched through existing city/branch mappings;
- owner waivers, if any;
- route/code removal commit hash;
- pre/post `rubitime-r6-r7-static-inventory.mjs` outputs;
- validation commands and results.

### Gate 3 — R7 archive/drop/restore

Required proof:

`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`

Owner decisions required:

- approve archive/drop or explicit defer policy;
- approve archive retention horizon;
- approve rollback horizon;
- confirm R1-R6 are complete.

Proof must include the sections required by `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`:

- R6 proof link and commit hash;
- owner archive/drop decision;
- schema audit JSON;
- post-R6 static reference audit;
- archive directory and SHA256SUMS if archive is required;
- raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV;
- integrator-led reconciliation is forbidden when the fresh CSV exists;
- migration file name or explicit defer record;
- fresh restore + migrate output;
- typecheck/lint/test output;
- explicit rollback horizon.

## What Agents Must Not Do

- Do not create placeholder final proof files.
- Do not mark section 15 final checklist items checked while this packet still lists them as required.
- Do not use `integrator.rubitime_records` to add/import rows absent from the fresh Rubitime CSV.
- Do not change production env, DB, services, webhook registration, or archive/drop state without owner approval.
- Do not run ad hoc SQL drops; R7 drops require repo migrations and restore proof.

## Current Status

- R1-R4 are closed in the working branch.
- R5 TEST acceptance is open; the declared TEST negative-route window and canonical smoke are still required.
- R6 is pending owner-approved cutoff/drain and final post-cutoff CSV reconciliation.
- R7 is pending R6 completion, owner archive/drop decision and restore/migrate proof.
- Final `--require-complete` gate must remain red until the three required proof files exist with real evidence.
