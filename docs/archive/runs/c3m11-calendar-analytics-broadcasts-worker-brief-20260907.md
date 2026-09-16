# C3M-11 worker — calendar, analytics and broadcasts terminology sweep

Read the `AGENTS.md` heading map before every action, then read applicable sections including §5, §9–§10b,
§16–§17, §21–§22 and §24. Read `README.md`, the complete C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, accepted C3M-04/C3M-11 code and
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`. Workstream: taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Mechanically replace remaining active direct `Клиенты | Пациенты` person copy and any literal
display name for the existing patient `onSupport` group only in:

- `apps/webapp/src/app/app/doctor/calendar/**` except `DoctorCalendarPatientSearch.tsx`;
- `apps/webapp/src/app/app/doctor/schedule/**` and its notification-template presentation;
- `apps/webapp/src/app/app/settings/AppointmentReminderSettingsSection.tsx`,
  `BookingSoloServicesSection.tsx`, `BookingSoloSpecialistsSection.tsx`;
- active doctor analytics activity/records UI;
- doctor broadcasts UI and `modules/doctor-broadcasts/broadcastEligible.ts` presentation copy.

Use the existing central resolver/context; extend `patientTerms.ts` only if required for the branch to compile, and do
not create local term dictionaries or page conditionals. Before a helper, extend the common passage per AGENTS.md §5.
Every star/filter/group display derived from `onSupport` must use `supportGroupLabel`; replace hardcoded
`Избранные`, `На сопровождении` or `Сопровождение` only when it names that group. Preserve the same word
when it means an actual organization relationship.
Do not alter booking policy, reminders behavior, audiences, persistence, APIs, tariffs, modules or support membership.
Cover visible, empty/error, placeholder, title and accessibility text; preserve technical “client” uses.

Do not edit `DoctorCalendarPatientSearch.tsx`, any `patients/[userId]/**`, Today/core card files, patient cabinet,
CMS/catalog/program code, tests or migrations. Product worker writes no tests. Run webapp typecheck, scoped ESLint,
relevant existing resolver tests if present, architecture checks and `git diff --check`; no full CI, server, DB or
deploy. Commit explicit paths only, never `git add -A`; message includes `#1098`, why, evidence, `C3M-11`, and
remaining independent/live audit. Do not push or exit before the commit exists.
