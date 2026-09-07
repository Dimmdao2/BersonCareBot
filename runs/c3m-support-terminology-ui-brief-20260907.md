# C3M worker — one support group, terminology and per-client controls

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §15–§18,
§21, §22 and §24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`,
`docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`, the terminology design named by C3M.6, and
accepted C3M-02/03/04/06/09/10 code before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-11 — «Представить
существующий `onSupport` звездой, фильтром и выбранным названием одной группы; подключить `Клиенты / Пациенты` и
`Избранные / На сопровождении` ко всем inventoried UI surfaces через общий resolver; развить support panel в
tri-state overrides chat/comments/media и portal с явным reset-to-default. Не создавать вторую механику и не
добавлять booking policy».

Implement C3M-11 only. The lead closes it after independent behavior audit and live desktop/mobile acceptance.

## Required behavior

1. `doctor_patient_support.on_support` remains the only organization-scoped membership property. Present that one
   property consistently as a star, filter and the chosen group label. Do not add `favorite`, a second group, a
   second membership switch or data synchronization between parallel concepts.
2. The specialist chooses only the display terms already persisted by C3M-04: `Клиенты | Пациенты` and
   `Избранные | На сопровождении`. Extend the accepted central terminology resolver; do not scatter per-page
   conditionals or introduce a competing dictionary.
3. Apply resolved terms to every active inventoried specialist/client UI surface that names these concepts:
   navigation, lists, headings, patient/client cards, filters, settings, analytics, communications, empty/error
   states, notifications and accessibility/title text. Preserve correct grammatical forms supplied by the resolver;
   do not mechanically replace unrelated clinical meanings or internal identifiers.
4. Extend the existing `DoctorClientSupportPanel`; do not create another client-policy panel. For direct chat,
   program comments, program media and client portal, the control must expose `inherit | allow | deny`, show the
   effective result and its source, and provide an explicit reset to the organization default.
5. The effective/source display follows accepted policy: explicit client allow/deny wins; otherwise channel default
   `off | all | on_support`; portal follows its accepted workspace/default contract and does not become a
   support-group default. Changing `onSupport` immediately affects only inherited `on_support` channels.
6. Hide or disable controls for unavailable/effective-OFF parent modules using the accepted resolver without
   overwriting stored per-client choices. Re-enable restores those choices.
7. Two organizations sharing a patient keep independent membership, labels and overrides. Editing one organization
   must not mutate or rename the other organization's view.
8. Booking, scheduling, cancellation, prepayment and public booking never consult `onSupport` and receive no
   favorite-only policy. Existing patient/client data and histories are unchanged by any display-name switch.

## Explicit non-scope

No new group/favorite entity, profession role, preset/onboarding, tariff/add-on/domain/solo/clinic fork, booking
policy, module enforcement already owned by prior slices, symptom policy, or broader medical/wellness terminology
beyond the two owner-approved choices. Today presentation stays unchanged.

This product worker writes no tests (`AGENTS.md` §10b). In particular, do not test labels, DOM shape, source text,
control counts, function formatting or inventory completeness by scanning files. The independent auditor owns blind
behavior checks for resolver/policy/tenant boundaries; visual text, responsive layout, star/filter affordance and
control usability are accepted live. Run affected existing resolver/policy/service tests, webapp typecheck, scoped
ESLint, architecture checks and `git diff --check`; no full CI or shared dev server.

Commit explicit in-scope paths only with `#1098`, why, evidence, `C3M-11`, and remaining independent/live audit.
Never `git add -A`, never push, and do not finish before the commit exists.
