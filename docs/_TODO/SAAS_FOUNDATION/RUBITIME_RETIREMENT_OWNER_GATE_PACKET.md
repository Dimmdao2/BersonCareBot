# Rubitime retirement owner gate packet

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the single owner/ops packet for the remaining Rubitime retirement gates.

It does not approve production changes and does not replace the phase runbooks. It lists the exact owner decisions
and proof artifacts required before the final checklist may be completed.
`check-rubitime-final-gate` treats the proof bullet text below as the required content contract for final proof
files. If a proof file exists but omits these fragments, the check fails.
Use the sibling `.template.md` files as copy sources; they are not final proof and do not close any gate.

Canonical entrypoints:

- Agent start: `docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`
- Execution plan: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`
- Final gate manifest: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md`
- R6 runbook: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`
- R7 runbook: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`

Machine check:

```bash
pnpm run check:rubitime-final-gate
```

## Data Canon

- Fresh Rubitime CSV decides the preservation set.
- The approved CSV is one-specialist context: `89643805480` / tail `9643805480`, matched through existing city/branch mappings.
- `integrator.rubitime_records` is audit-only when the CSV exists.
- Integrator-only rows absent from the fresh CSV must not be imported, resurrected, or used as final-gate blockers.
- Extra rows present only in `integrator.rubitime_records` do not expand the preservation set and do not justify a
  new backfill.

## Remaining Owner Gates

### Gate 1 — R5 production disable

Required proof:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md`

Owner decisions required:

- approve production `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` timing;
- approve monitoring window length;
- accept rollback boundary from `RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md`.

Proof must include:

- production flag-change timestamp;
- monitoring window start/end;
- aggregate v1 `/api/bersoncare/rubitime/slots` request count;
- aggregate v1 `/api/bersoncare/rubitime/create-record` request count;
- source of aggregate counts without secrets or PII;
- confirmation that no user-facing booking path required v1 profile resolution;
- owner approval note;
- rollback notes if rollback was tested or needed.

### Gate 2 — R6 cutoff/drain/runtime removal

Required proof:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`

Owner decisions required:

- approve provider cutoff timestamp;
- confirm external Rubitime webhook ingress is disabled;
- confirm outbound Rubitime bridge is disabled;
- approve treatment of any non-zero pending/dead queue rows;
- approve fresh post-cutoff CSV reconciliation result.

Proof must include the sections required by `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`:

- backup filename;
- read-only drain snapshot;
- runtime Rubitime traffic snapshot before/after disable;
- fresh CSV filename, size, date span and reconciliation output;
- fresh CSV is canon; integrator-only rows absent from CSV are audit-only;
- owner waivers, if any;
- route/code removal commit hash;
- pre/post `rubitime-r6-r7-static-inventory.mjs` outputs;
- validation commands and results.

### Gate 3 — R7 archive/drop/restore

Required proof:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`

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
- R5 code/non-prod proof is closed; production monitoring/approval is pending.
- R6 is pending owner-approved cutoff/drain and final post-cutoff CSV reconciliation.
- R7 is pending R6 completion, owner archive/drop decision and restore/migrate proof.
- Final `--require-complete` gate must remain red until the three required proof files exist with real evidence.
