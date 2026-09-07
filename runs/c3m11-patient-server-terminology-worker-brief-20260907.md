# C3M-11 worker — client cabinet and server presentation terminology

Read the `AGENTS.md` heading map before every action, then read all applicable sections in full, including §5,
§9–§10b, §15–§17, §21 and §24. Read `README.md`, the complete C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`,
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`, and the accepted C3M-04/C3M-11 code before
editing. Workstream: taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Implement only the remaining client-facing and server-generated presentation terminology for the already persisted
organization choice `patient_label` (`Клиенты | Пациенты`). This is the second non-overlapping
correction stream for C3M-11; another stream owns doctor-page UI. Do not change tariffs, modules, booking policy,
permissions, data, routes, medical/wellness terminology, or the `on_support` group model.

## Required result

1. Extend the existing central `modules/system-settings/patientTerms.ts` resolver with the grammatical forms needed
   by active copy. Do not add local ternaries or a second dictionary. First ask whether the existing resolver can be
   parameterized/extended instead of creating any new helper, per AGENTS.md §5; the answer should be yes unless an actual
   boundary proves otherwise.
2. Mount/read the existing organization-scoped `patient_label` in active authenticated patient/client cabinet
   presentation through the existing patient organization context/layout. A patient linked to two organizations must
   see the selected organization's term; do not use a global fallback when exact organization context exists.
3. Replace active client-cabinet person-label copy identified by the inventory in `app/app/patient/**`,
   `shared/ui/patient/**`, patient maintenance/access error presentation, and patient reminders/actions. Preserve
   technical uses of “client”, legal text, tenantless login, platform/global-admin UI and clinical domain meanings.
4. Replace active server-generated specialist/patient presentation copy where it directly names the configurable
   person concept: booking staff messages, task reminder display, notification-topic display, messaging fallback/reply
   copy, appointment/client-history display labels, treatment-program user-visible errors and patient payment error.
   Pass resolved terms from the existing organization-aware call path; do not make persistence or authorization depend
   on wording.
5. Inspect the final diff and exact-string inventory. Report any line that cannot be made organization-aware without a
   new product or architecture decision; do not invent one.

## Boundaries and verification

- Do not edit `apps/webapp/src/app/app/doctor/**`, `apps/webapp/src/app/app/settings/**`, tests, migrations, tariff or
  entitlement code. Shared edits are limited to the central patient terms resolver and patient shared UI/context.
- Product worker writes no tests. Do not add source-text, label-count, DOM-shape or snapshot tests. Retain existing blind
  behavior tests unchanged.
- Run webapp typecheck, scoped ESLint for changed files, relevant existing resolver/context tests if they already exist,
  architecture checks and `git diff --check`. Do not run full CI, a shared dev server, migration or deploy.
- Commit explicit in-scope paths only, never `git add -A`; message includes `#1098`, reason, evidence, `C3M-11`, and
  remaining independent/live audit. Do not push. Do not finish before the commit exists, and do not leave a background
  process running when the one-shot agent exits.
