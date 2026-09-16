# C3M-11 worker — core doctor UI terminology sweep

Read the `AGENTS.md` heading map before every action, then applicable sections including §5, §9–§10b,
§16–§17, §21 and §24. Read `README.md`, the complete C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, accepted C3M-04/C3M-11 code and
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`. Workstream: taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Mechanically sweep the core doctor UI for both persisted display choices:
`patient_label` (`Клиенты | Пациенты`) and `support_group_label`
(`Избранные | На сопровождении`). Scope:

- doctor shell navigation/header/mobile bottom navigation and screen titles;
- Today dashboard/quick actions/KPIs/charts and its presentation fallback;
- patient/client list, star, filters, empty states and accessibility labels;
- patient/client card shell and its tabs, account, overview, records, files, encounters, symptom-tracking controls;
- existing client support panel and chat-hook copy;
- comments list;
- `content/ContentForm.tsx`, `ContentNav.tsx`, `content/sections/SectionForm.tsx`,
  `courses/new/DoctorCourseDraftCreateForm.tsx`, and doctor `patient-home/page.tsx` only.

Use only the existing central `patientTerms.ts` resolver and `DoctorPatientTermsContext`. Extend that resolver with
necessary grammatical forms; do not add a second dictionary or local conditionals. Every star/filter/group display
driven by the existing patient `onSupport` property must use `supportGroupLabel`. A literal `Избранные`,
`На сопровождении` or `Сопровождение` naming that group is a bypass; preserve the word when it means an
actual organization relationship. `onSupport` remains the only membership property. Do not add favorite/group data.

Do not edit tasks, general messaging outside the named chat hook/comments, calendar/schedule/settings, analytics,
broadcasts, other CMS/catalog/program surfaces, patient cabinet, server notification copy, tests or migrations. Do
not alter tariffs, mechanics, booking policy, permissions, persistence, routes or broader medical/wellness language.

Product worker writes no tests. Run webapp typecheck, scoped ESLint, relevant existing resolver tests if present,
architecture checks and `git diff --check`; no full CI, server, DB or deploy. Commit explicit paths only, never
`git add -A`; message includes `#1098`, why, evidence, `C3M-11`, and remaining independent/live audit. Do not push or
exit before the commit exists.
