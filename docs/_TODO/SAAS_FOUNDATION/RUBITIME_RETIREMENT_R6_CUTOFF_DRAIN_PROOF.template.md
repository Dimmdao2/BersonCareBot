# Rubitime retirement R6 cutoff/drain proof template

Do not rename this template to the final proof until owner-approved cutoff/drain is executed.

Final proof filename:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`

## backup filename

`TODO: backup path/name from the approved backup command`.

## read-only drain snapshot

`TODO: paste aggregate Section 1 output from RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`.

## runtime Rubitime traffic snapshot before/after disable

`TODO: paste aggregate Section 2 output before and after provider traffic disable`.

## fresh CSV filename, size, date span and reconciliation output

`TODO: filename, byte size, date span and read-only reconciliation output`.

## fresh CSV is canon; integrator-only rows absent from CSV are audit-only

`TODO: state the CSV-canon decision and confirm integrator-only rows absent from CSV were not imported, resurrected, or treated as blockers`.

## integrator-led reconciliation is forbidden when the fresh CSV exists

`TODO: confirm raw integrator state did not create a new import backlog or block the gate for rows absent from the fresh CSV`.

## one-specialist context: `89643805480` / tail `9643805480`

`TODO: confirm the approved Rubitime export is the one-specialist context for this phone/tail`.

## matched through existing city/branch mappings

`TODO: confirm CSV reconciliation used the existing city/branch mappings and did not expand the preservation set from integrator-only rows`.

## owner waivers, if any

`TODO: list ids/reasons for waivers, or state none`.

## route/code removal commit hash

`TODO: commit hash that removes/unmounts Rubitime runtime routes/code after cutoff proof`.

## pre/post `rubitime-r6-r7-static-inventory.mjs` outputs

`TODO: include pre-removal and post-removal outputs; post-R6 must pass with --expect-post-r6`.

## validation commands and results

`TODO: include integrator/webapp typecheck/lint/tests and git diff --check results from the removal batch`.
