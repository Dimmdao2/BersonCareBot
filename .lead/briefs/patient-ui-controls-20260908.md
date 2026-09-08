# Worker brief: patient form-control primitive

## Authority

Owner 2026-09-08: «свести к одному общему набору элементов и стилей без хардкода в тегах и дублирования
значений в css»; for parallel execution: «давай агентам один примитив/токен на объединение по очереди чтобы
не пересекались».

Read `AGENTS.md` heading map and §§10a, 10b, 15, 17, 21, 22, 24; read
`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` and the form-control inventory in
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md`. Use `code-search` before exact
`rg`.

## Exact scope

You own only:

- `apps/webapp/src/shared/ui/patient/primitives/input.tsx`
- `apps/webapp/src/shared/ui/patient/primitives/textarea.tsx`
- `apps/webapp/src/shared/ui/patient/primitives/select.tsx`
- `apps/webapp/src/shared/ui/patient/primitives/label.tsx`
- optional new `apps/webapp/src/shared/ui/patient/PatientField.tsx`
- `apps/webapp/src/app/app/patient/diary/lfk/journal/LfkJournalClient.tsx`
- `apps/webapp/src/app/app/patient/diary/symptoms/journal/SymptomsJournalClient.tsx`

Do not edit `patient.css`, `patientVisual.ts`, Button/Card primitives, any other feature files, tests, docs, API or
doctor UI. A concurrent token worker introduces `--patient-control-*`; reference those names without editing its
file. Until integration, fall back only to existing patient variables, never literal color/radius values.

## Required outcome

1. Turn the patient Input/Textarea/SelectTrigger boundary into a real patient control adapter instead of a bare
   re-export, preserving component APIs and strict typing.
2. Add one explicit control variant/class for the repeated 40px journal field chrome. It owns height, radius,
   border/background/text and focus state through patient CSS variables; do not duplicate the long class string.
3. Consolidate the repeated field-label presentation either in the patient Label default/variant or a small
   `PatientField`/`PatientFieldLabel` primitive. It must preserve `htmlFor`, `aria-describedby`, help/error slots
   when present and must not own form state or domain validation.
4. Migrate the two allowed journal clients to the shared control/label API. Do not merge their domain models,
   persistence callbacks or text merely because their presentation is similar.
5. Preserve behavior, values and visible appearance. Do not redesign, add copy or change form semantics.
6. Do not write source-format/count tests. Add no test unless a real user action would silently break and the
   behavior cannot be covered cheaper; otherwise rely on existing tests, typecheck, ESLint and later live review.

Run `git diff --check`, targeted ESLint and the cheapest relevant typecheck. Commit only allowed paths with an
explicit commit message; no push, no landing. Finish the single turn with commit SHA and checks.
