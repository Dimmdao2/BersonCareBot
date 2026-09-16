# C3M worker — canonical workspace settings

Read `AGENTS.md` by route before every action, including §4/§4a, §5, §10/§10a/§10b, §12, §16, §17,
§21, §22 and §24 in full. Read `README.md`, `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`,
`docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`, and C3M.1–C3M.8 in
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`.

Taskdb workstream: `#1098`. Authority is the owner decisions recorded in C3M and this exact item:

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-04 — «Создать одну секцию
«Рабочее пространство» в каноническом settings hub; перенести туда defaults off | all | on_support для
chat/comments/media, symptom create-time default, два выбора терминологии и dependency states; место пресета в
настройках — часть owner-gate C3M.5; убрать дублирующий write UI из Account, не создавая второй endpoint/owner».

- **C3M-04 — settings UI.** `Создать одну секцию «Рабочее пространство» в каноническом settings hub; перенести
  туда defaults off | all | on_support для chat/comments/media, symptom create-time default, два выбора
  терминологии и dependency states; место пресета в настройках — часть owner-gate C3M.5; убрать дублирующий write
  UI из Account, не создавая второй endpoint/owner.`

This worker implements C3M-04 only. The lead closes the checklist after independent audit/live acceptance.

## Required behavior

1. Extend the existing canonical organization settings page and its existing settings service/write endpoint.
   Do not create a second settings page, tree, endpoint, repository or ownership path. Before adding any helper,
   prove why the existing `createSystemSettingsService`, `SettingsForm`, admin settings route or an adjacent
   settings section cannot be parameterized.
2. Add one concise doctor-design-system section titled `Рабочее пространство` containing switches for the closed
   module registry accepted in C3M-01. Preferences may only narrow availability; unavailable modules are not offered
   as usable switches. Parent OFF makes children visibly ineffective without overwriting stored child choices.
   Re-enabling a parent restores those saved choices.
3. In the same section expose exactly these existing owner decisions:
   - channel default mode for `direct_chat`, `program_comments`, `program_media`: `off | all | on_support`;
   - symptom creation default: `off | all | on_support`, explicitly stored as a create-time template, not a live
     inheritance policy;
   - terminology choices `Клиенты | Пациенты` and `Избранные | На сопровождении`.
4. Persist module composition and client defaults as versioned structured per-organization values through the
   existing typed `system_settings` path. Keep the existing `patient_label` key and add the single
   `support_group_label` choice; do not introduce a second favorite/support entity. Validate all enum values at the
   canonical write boundary and preserve compatibility defaults from C3M.4/C3M.6.
5. Remove the duplicate cabinet-default write UI from `/app/account`; Account retains account/security/install and
   existing unrelated controls. Do not delete the underlying legacy values or change runtime comment/media policy in
   this stage; later C3M slices migrate/evaluate them.
6. Do not implement, name or render presets. Their contents, names, onboarding placement, skipping and repeat
   application are owner-gated in C3M.5.
7. Do not add tariff tiers, billing/add-on/domain logic, profession roles, a clinic/solo fork, client-level
   overrides, symptom schema, chat/portal enforcement, navigation filtering or module route guards in this worker.
8. Keep copy minimal and use existing labels from the plan. Do not add explanatory marketing/help paragraphs.
   Reuse `DoctorSection`, doctor primitives and `SelectTrigger displayLabel`; do not add a UI dependency.

## Compatibility and validation

- A missing workspace-composition row keeps every already-available module visible.
- Preserve the current channel behavior when the structured defaults are absent: direct chat resolves to `all`;
  symptom tracking creation resolves to `all`; each legacy comment/media boolean `true` resolves to `all` and
  `false` or absent resolves to `on_support`. This is the existing policy expressed in the new three-state model,
  not a new product default. Keep the legacy values readable and do not destroy them; later C3M slices migrate the
  per-client overrides and begin evaluating the structured modes at runtime.
- A failed save must not leave a partially applied structured configuration; reuse the existing atomic batch/write
  facility where a single user save spans multiple keys.
- This product worker writes no tests (`AGENTS.md` §10b). In particular do not write tests for labels, checkboxes,
  DOM count/order, component source, function formatting or SQL text. The independent auditor will classify
  behavior vs live inspection and add only indispensable business-contract coverage.
- Run existing targeted settings route/service checks affected by the change, webapp typecheck, scoped ESLint and
  `git diff --check`. Do not run full CI and do not occupy the shared dev server.

Inspect the final diff and commit explicit in-scope paths only with a message containing `#1098`, why, evidence,
`C3M-04`, and what remains for audit. Never use `git add -A`; do not push. Work in one turn, keep long commands in
the foreground, and do not end before the commit exists.
