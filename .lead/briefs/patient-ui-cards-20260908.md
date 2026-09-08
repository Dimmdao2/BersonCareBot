# Worker brief: patient Card primitive and repeated surfaces

## Authority

Owner 2026-09-08: «свести к одному общему набору элементов и стилей без хардкода в тегах и дублирования
значений в css»; for parallel execution: «давай агентам один примитив/токен на объединение по очереди чтобы
не пересекались».

Read `AGENTS.md` heading map and §§15, 17, 21, 24; read
`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` and the Card/list inventory in
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md` (S2, R2, R6 and the 2026-09-08
appendix). Use `code-search` before exact `rg`.

## Exact scope

You own only:

- `apps/webapp/src/shared/ui/patient/primitives/card.tsx`
- `apps/webapp/src/app/app/patient/cabinet/CabinetInfoLinksCard.tsx`
- `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx`
- `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx`
- `apps/webapp/src/app/app/patient/cabinet/CabinetPastBookings.tsx`
- `apps/webapp/src/shared/ui/patient/organization/PatientOrganizationContext.tsx`
- `apps/webapp/src/shared/ui/patient/organization/PatientOrganizationRelationships.tsx`

Do not edit `patient.css`, `patientVisual.ts`, Button/form primitives, other feature files, tests, docs, API or
doctor UI. A concurrent worker owns the token layer.

## Required outcome

1. Turn patient `Card` into a patient-owned adapter with typed spacing/surface variants sufficient for the
   allowed files: `default`, `compact`, `list`, `flush` (names may differ only if existing API dictates).
2. Reuse the current patient tokens and preserve the visible appearance. The primitive must remove the current
   need to combine global Card chrome with patient classes and then cancel it via `ring-0`, `!p-0`, `!py-0`.
3. Migrate the allowed cabinet cards. Preserve DOM semantics, links, actions and data behavior.
4. In organization UI, replace locally reconstructed neutral/info/warning rows with the existing patient semantic
   surface/list roles or the Card variant when it is the same semantic element. Do not change product copy.
5. Do not invent a new visual system and do not import doctor UI.
6. Do not write source-format/count tests. This is a visual/construction refactor; accept with diff inspection,
   existing behavior checks, ESLint/typecheck and later live review.

Run `git diff --check`, targeted ESLint and the cheapest relevant typecheck. Commit only allowed paths with an
explicit commit message; no push, no landing. Finish the single turn with commit SHA and checks.
