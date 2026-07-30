# Rubitime retirement R7 drop/restore proof template

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Do not rename this template to the final proof until R6 is complete and owner archive/drop decision is recorded.

Final proof filename:

`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`

## R6 proof link and commit hash

`TODO: link RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md and route/code removal commit`.

## owner archive/drop decision

`TODO: owner decision for archive/drop or explicit defer`.

## schema audit JSON

`TODO: JSON output from the read-only schema audit`.

## post-R6 static reference audit

`TODO: output from post-R6 inventory/static reference audit`.

## archive directory and SHA256SUMS

`TODO: archive directory and checksums, or explicit not-required owner decision`.

## raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV

`TODO: confirm archived Rubitime raw tables are retained only for audit/rollback and were not used to import, resurrect, or block on integrator-only rows absent from the fresh CSV`.

## integrator-led reconciliation is forbidden when the fresh CSV exists

`TODO: confirm raw integrator state did not create a new import backlog or block the gate for rows absent from the fresh CSV`.

## migration file name or explicit defer record

`TODO: migration file that performs approved drops, or explicit defer record`.

## fresh restore + migrate output

`TODO: output from fresh restore + migrate proof`.

## typecheck/lint/test output

`TODO: commands and results for required validation`.

## explicit rollback horizon

`TODO: owner-approved rollback horizon and restore/archive path`.
