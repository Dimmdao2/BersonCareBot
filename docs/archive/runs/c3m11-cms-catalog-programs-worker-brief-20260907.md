# C3M-11 worker — CMS, catalogs and programs terminology sweep

Read the `AGENTS.md` heading map before every action, then read applicable sections including §5, §9–§10b,
§16–§17, §20–§21 and §24. Read `README.md`, the complete C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, accepted C3M-04/C3M-11 code and
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`. Workstream: taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницами.»

Mechanically replace remaining active direct `Клиенты | Пациенты` person copy and any literal
display name for the existing patient `onSupport` group only in doctor
CMS, media library/folder presentation, clinical-test/catalog usage summaries, course edit, treatment-program
constructor/library/statistics/mutation-guard surfaces, and active patient-home settings components.

Use the existing central resolver/context; extend `patientTerms.ts` only if required for the branch to compile. Do not
add page-level conditionals or another term dictionary. Before a helper, extend the common passage per AGENTS.md §5.
Every star/filter/group display derived from `onSupport` must use `supportGroupLabel`; replace hardcoded
`Избранные`, `На сопровождении` or `Сопровождение` only when it names that group. Preserve the same word
when it describes an actual organization relationship.
Presentation labels for stored folders may change, but persisted folder names/ids/data must not. Do not alter module
behavior, program behavior, routes, tariffs, permissions, medical/wellness vocabulary or support membership.

Do not edit the lead-owned `content/ContentForm.tsx`, `ContentNav.tsx`, `content/sections/SectionForm.tsx`,
`courses/new/DoctorCourseDraftCreateForm.tsx`, `patient-home/page.tsx`, any `patients/[userId]/**`, Today/core card,
calendar/tasks/messages/broadcasts/analytics, patient cabinet, tests or migrations. Product worker writes no tests.
Run webapp typecheck, scoped ESLint, relevant existing resolver tests if present, architecture checks and
`git diff --check`; no full CI, server, DB or deploy. Commit explicit paths only, never `git add -A`; message includes
`#1098`, why, evidence, `C3M-11`, and remaining independent/live audit. Do not push or exit before the commit exists.
