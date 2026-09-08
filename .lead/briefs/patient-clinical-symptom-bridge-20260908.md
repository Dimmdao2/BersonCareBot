# Worker brief: clinical complaint → patient symptom tracking

## Authority

Владелец поручил: «реализовать возможность пациентам добавлять записи по симптомам. То есть если доктор
добавил симптом, у пациента как бы этот симптом привязан.» Также: «Отметки, которые на приеме сохранил врач,
по идее они как бы должны как-то отличаться… Если, блядь, сейчас очень сложно это сделать, то хуй с ним.
Тогда пока не делать это разделение.»

Текущий принятый patient diary path уже существует (`SymptomTrackingRow` → `addSymptomEntry` →
`symptom_entries`; график читает `/api/patient/diary/symptom-stats`). Его не переписывать. Реальный разрыв:
основной врачебный симптом в `clinical_complaints`/`clinical_complaint_updates` не связан с
`symptom_trackings`/`symptom_entries`, поэтому обычный симптом из карты или приёма пациенту не появляется.

## Rules to read before work

- `AGENTS.md`: heading map, §1 migration rules including schema B, §4a, §5, §7, §10a/§10b, §15–§17, §24.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md` only for confirmed DB/migration facts.
- Current schema, ports, repository and both doctor write entrances before designing the change.
- Use `code-search` before exact `rg`.

No disposable DB, no historical migration replay, no PROD/TEST/deploy, no push, no landing. Do not read or print
secrets. Do not edit patient visual/modal files. Do not implement author/source distinction in this stage.

## Required outcome

1. A clinical complaint created by the doctor has a durable one-to-one link to exactly one symptom tracking for
   the same organization and patient. Never link by title at runtime.
2. The initial complaint severity and later doctor severity updates, including the visit write path, are mirrored
   into the linked symptom history consumed by the patient graph. Reuse/parameterize the existing diary service,
   port and repository write path; do not create a second symptom-entry implementation.
3. Patient `instant` entries continue to write the same tracking and remain visible in the same graph/modal.
4. Resolving/archiving the clinical complaint hides/deactivates the active tracking but preserves history.
5. Existing open complaints are migrated/backfilled deterministically when the required columns/data permit it;
   if an exact safe backfill is impossible, document the specific data constraint and implement forward behavior
   without guessing.
6. Organization/patient ownership remains fail-closed. A cross-organization or cross-patient id cannot be linked
   or written.
7. Preserve the existing standalone «Симптомы дневника» capability unless code evidence proves it is only a
   duplicate; do not silently delete product functionality. Prevent duplicate linked tracking for the same
   complaint structurally (unique FK/constraint or equivalent).
8. Schema changes follow the current Drizzle migration/snapshot convention and privilege declaration rules. A
   migration does not grant/revoke rights.
9. Production worker does not author tests; the independent auditor-live owns missing acceptance tests and fault
   injection under `AGENTS.md` §10a/§10b. Run the cheapest relevant compile/lint checks that do not require DB.

## Existing evidence / starting points

- Doctor tracking path: `apps/webapp/src/app/api/doctor/clients/[userId]/symptom-trackings/route.ts`.
- Patient graph path: `apps/webapp/src/app/app/patient/diary/symptoms/`,
  `apps/webapp/src/app/api/patient/diary/symptom-stats/route.ts`,
  `apps/webapp/src/modules/diaries/symptom-service.ts`, `apps/webapp/src/infra/repos/pgSymptomDiary.ts`.
- Clinical paths: `apps/webapp/src/app/api/doctor/patients/[userId]/complaints/route.ts`,
  `apps/webapp/src/app/api/doctor/patients/[userId]/visits/route.ts`,
  `apps/webapp/src/infra/repos/pgPatientClinical.ts`, `apps/webapp/db/schema/patientClinical.ts`.

## Done

- Inspect all clinical complaint create/update/resolve entrances, not only one route.
- Implement the complete bounded behavior above in one coherent pass.
- `git diff --check`, targeted typecheck/lint or narrower checks pass; report unrelated pre-existing failures
  honestly.
- Commit only this stage's explicit paths on `wt/patient-symptom-clinical-bridge-20260908`; no push.
- Final report names commit, changed architecture, migration, checks, and any remaining owner question.
