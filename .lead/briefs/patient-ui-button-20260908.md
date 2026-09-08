# Worker brief: patient Button adapter

## Authority

Owner 2026-09-08: «свести к одному общему набору элементов и стилей без хардкода в тегах и дублирования
значений в css»; «давай агентам один примитив/токен на объединение по очереди чтобы не пересекались».
Систематизируется существующий кабинет пациента; новый visual target не придумывать. Сохранять Manrope,
patient colors и уже принятые action classes.

Read `AGENTS.md` heading map and §§10a, 10b, 15, 17, 21, 24; read
`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` and R/S1 button inventory in
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md`. Use `code-search` before exact
`rg`.

## Exact scope

You own only:

- `apps/webapp/src/shared/ui/patient/primitives/button.tsx`
- if server-safe variants require it, a new patient-local `primitives/button-variants.ts`
- the existing button action class declarations in
  `apps/webapp/src/shared/ui/patient/patientVisual.ts` only as needed to remove duplicate chrome
- repeated primary submit/action callers in:
  - `apps/webapp/src/app/app/patient/diary/lfk/LfkSessionForm.tsx`
  - `apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx`
  - `apps/webapp/src/app/app/patient/diary/lfk/journal/LfkJournalClient.tsx`
  - `apps/webapp/src/app/app/patient/diary/symptoms/journal/SymptomsJournalClient.tsx`
  - `apps/webapp/src/app/app/patient/diary/symptoms/SymptomTrackingRow.tsx`
  - `apps/webapp/src/app/app/patient/support/PatientSupportForm.tsx`
- tests for those user actions only if a real behavior gap requires them.

Do not edit `patient.css`, Card/Input/Textarea/Select/Label, modal/chat files, doctor UI, API/domain/DB or any
other patient page. Concurrent work owns those areas.

## Required outcome

1. Turn patient `Button` from a bare re-export into a strict typed patient adapter while preserving all existing
   global-compatible `variant`/`size` calls and `buttonVariants` use by links/server components.
2. Add explicit patient action/size variants that reuse the current canonical `patientButtonPrimaryClass` (and
   related existing patient action classes only where necessary). Do not copy their class strings and do not
   invent colors, radii, heights or typography.
3. Migrate the allowed repeated primary submit/action buttons so equal semantic actions use the same patient
   variant instead of relying on the global default plus local chrome. Preserve labels, pending/disabled logic,
   submit semantics and widths unless the current canonical patient action already defines them.
4. Do not force all patient buttons to 44px by changing the global-compatible default; compact icon/toolbar/menu
   buttons must remain compatible. Do not migrate unique warning/success/skip/rating actions in this pass.
5. Prefer parameterizing the existing patient boundary and `patientVisual` action classes over creating a second
   wrapper. No cross-import from doctor or global app UI outside the patient primitive implementation.
6. No source/count/class formatting tests. Test only observable submit/disabled behavior if needed.

Run `git diff --check`, targeted ESLint and cheapest relevant existing behavior tests. Commit only allowed paths
on `wt/patient-ui-button-20260908`; no push/landing. Finish the single turn with SHA and checks; do not wait on a
background process.
