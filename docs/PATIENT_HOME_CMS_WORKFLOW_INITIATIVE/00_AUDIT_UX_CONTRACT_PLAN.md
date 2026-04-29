# 00 - AUDIT UX CONTRACT PLAN

## Goal

Зафиксировать фактическое текущее поведение настройки главной пациента, чтобы все следующие фазы опирались на один контракт и не "угадывали" поведение.

## Input Docs (mandatory)

- `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md`
- `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_9.md`

## Code Areas To Review

- `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockItemsDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeRepairTargetsDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx`
- `apps/webapp/src/modules/patient-home/blocks.ts`
- `apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts`
- `apps/webapp/src/modules/patient-home/patientHomeResolvers.ts`

## Deliverables

- `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
- update `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`

## BLOCK_EDITOR_CONTRACT.md Required Table

For each block code:

- `code`
- `title (admin copy)`
- `allowed target types`
- `item noun (RU)`
- `add action label`
- `can manage items (yes/no)`
- `empty preview behavior`
- `empty runtime behavior`
- `missing target behavior`
- `inline create status (none / partial / full)`

## Out Of Scope

- No app code changes.
- No migration/schema changes.
- No test changes.

## Phase Checklist

- [ ] Reviewed all mandatory docs.
- [ ] Reviewed all listed code files.
- [ ] Contract table covers all `PatientHomeBlockCode`.
- [ ] Allowed target types are aligned with `blocks.ts`.
- [ ] Empty/runtime behavior documented honestly.
- [ ] Missing-target behavior documented.
- [ ] `LOG.md` updated.

## Gate

No CI/test commands required.

## Completion Criteria

- Contract doc is complete and self-consistent.
- Ready to start Phase 1 without ambiguity.

