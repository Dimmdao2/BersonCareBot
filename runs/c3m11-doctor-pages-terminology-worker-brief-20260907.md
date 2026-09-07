# C3M-11 worker — tasks and messaging terminology sweep

Read the `AGENTS.md` heading map before every action, then read all applicable sections in full, including §5,
§9–§10b, §16–§17, §21 and §24. Read `README.md`, the complete C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, the accepted C3M-04/C3M-11 code, and
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`. Workstream: taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Implement only the remaining active doctor-facing terminology for persisted organization settings `patient_label`
(`Клиенты | Пациенты`) and `support_group_label` (`Избранные | На сопровождении`). Another correction
stream owns patient-cabinet/server copy;
the lead owns the already edited core card/Today/support files listed below. Do not change tariffs, mechanics,
booking policy, permissions, stored data, routes, support membership, or broader medical/wellness language.

## Required result

Use the existing central `modules/system-settings/patientTerms.ts` resolver/context only. Every star/filter/group
display driven by the existing patient `onSupport` property must render `supportGroupLabel` from that context; a
literal `Избранные`, `На сопровождении` or `Сопровождение` for that group is a bypass and must be fixed.
It may be extended with
missing grammatical forms, but do not add page-level conditionals or a second dictionary. Before any helper, apply
AGENTS.md §5: extend/parameterize the existing common passage.

Sweep and correct all active direct person-label copy in this non-overlapping area:

- specialist tasks: `clients/SpecialistTaskDetailsDialog.tsx`, `SpecialistTaskFormDialog.tsx`,
  `SpecialistTaskRow.tsx`, and `tasks/DoctorTasksPageClient.tsx`;
- messaging/program discussions: `messages/DoctorSupportInbox.tsx`,
  `clients/[userId]/treatment-programs/[instanceId]/DoctorProgramDiscussionMessagesPanel.tsx`, and active
  treatment-program instance detail/constructor/library/statistics/mutation-guard surfaces;
- direct task/message-related presentation helpers used by those surfaces, where the exact organization terms are
  already available through the active doctor workspace context.

Cover visible text, error/empty states, placeholders, title and accessibility labels. Preserve technical uses of
“client”, tenantless/global-admin UI, legal text and clinical meanings. Do not replace “сопровождение” when it
means the actual organization relationship rather than the `onSupport` star group. Neutral wording is acceptable only when it
removes the entity term without weakening meaning; do not silently leave a configurable person term hardcoded.

## Files owned by the lead — do not edit

Do not edit: `DoctorToday*`, `doctor/page.tsx`, `loadDoctorTodayDashboard.ts`, `patients/PatientsPageClient.tsx`,
`patients/[userId]/**`, `clients/DoctorClientSupportPanel.tsx`, `clients/useDoctorPatientSupportChat.ts`,
`comments/DoctorCommentsTab.tsx`, `calendar/**`, `schedule/**`, `analytics/**`, `broadcasts/**`,
`content/**`, `courses/**`, `clinical-tests/**`, `treatment-program-templates/**`,
`treatment-program-shared/**`, `shared/ui/doctor/doctorNavLinks.ts`,
`calendar/DoctorCalendarPatientSearch.tsx`, `content/ContentForm.tsx`,
`content/ContentNav.tsx`, `content/sections/SectionForm.tsx`, `courses/new/DoctorCourseDraftCreateForm.tsx`,
`patient-home/page.tsx`, `shared/ui/doctor/doctorNavLinks.ts`, `shared/ui/doctor/shell/DoctorBottomNav.tsx`,
`shared/ui/doctor/shell/DoctorHeader.tsx`, `shared/ui/doctorScreenTitles.ts`, or
`modules/system-settings/patientTerms.ts`.

## Verification

- Product worker writes no tests. Do not add/update tests, source-text checks, snapshots, DOM/control-count tests.
- Run webapp typecheck, scoped ESLint, relevant existing resolver tests if already present, architecture checks and
  `git diff --check`. No full CI, dev server, database, migration or deploy.
- Commit explicit in-scope paths only, never `git add -A`; commit message includes `#1098`, why, evidence,
  `C3M-11`, and remaining independent/live audit. Do not push. Do not exit before the commit exists and do not leave
  a background process running.
