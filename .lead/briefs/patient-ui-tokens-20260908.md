# Worker brief: patient semantic token foundation

## Authority

Owner 2026-09-08: «свести к одному общему набору элементов и стилей без хардкода в тегах и дублирования
значений в css»; для параллельной работы: «давай агентам один примитив/токен на объединение по очереди чтобы
не пересекались».

Read `AGENTS.md` heading map and §§15, 17, 21, 24; read
`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` and the exact token inventory in
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md` (S3–S6 and the 2026-09-08
appendix). Use `code-search` before exact `rg`.

## Exact scope

You own only:

- `apps/webapp/src/app/styles/patient.css`
- `apps/webapp/src/shared/ui/patient/patientVisual.ts`

Do not edit patient primitives, feature/page components, tests, docs, schemas, APIs or any doctor UI. Other
workers concurrently own controls and cards.

## Required outcome

1. Preserve the current patient appearance exactly; this is token consolidation, not a redesign.
2. Make all patient semantic palette needed by portals available in `:root`; `#app-shell-patient` may override
   tenant/clinic brand only. Remove the need for primary fallback hex in `patientVisual.ts`.
3. Introduce semantic tokens for the repeated roles proven by the audit: primary hover and CTA shadow; complete
   warning/success/danger action and badge states; control height/radius; segmented navigation states; rating
   palette; shell translucent surface; modal footer surface. Use the current literal values as token values.
4. Replace literal palette/shadow values in `patientVisual.ts` with these variables wherever the role is repeated.
   Keep genuinely unique product visuals (booking hero, recommendation gradient, program-specific composition)
   only when no repeated semantic role exists; do not invent a replacement meaning.
5. Do not move doctor tokens into patient scope and do not import doctor UI.
6. Do not add tests that inspect source strings, counts, CSS order or formatting. This refactor is accepted by
   diff inspection plus existing lint/typecheck and later live verification after integration.

Run `git diff --check` and targeted ESLint/typecheck if affordable. Commit only the two allowed files with an
explicit commit message; no push, no landing. Finish the single turn with commit SHA and checks.
