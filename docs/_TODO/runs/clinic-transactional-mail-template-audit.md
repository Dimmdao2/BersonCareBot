# Clinic transactional mail template — audit

Candidate: `69ffd09c5f0bf0145d05a6f724b25d0b270d7153` (`wt/mail-template-settings`)

## Verdict: FAIL

### MUST FIX 1 — the internal settings service has a write bypass

Scenario: a server-side caller invokes the public `persistSettingsBatch()` method of
`deps.systemSettings` with `clinic_transactional_mail_template` without first clearing
`branding`. The tariff wrapper passes that batch through unchanged; the same batch method is the
canonical settings write API used by the admin and doctor settings routes. The new acceptance test
reproduces the successful write attempt without clearance.

Impact: a non-entitled caller can persist the branded identity that the integrator uses for patient
OTP mail. This violates the required physical service boundary even when a new route or action is
added outside the current HTTP guard.

Authority: audit brief item 2; `AGENTS.md` §24.5; C4 in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.

Evidence: `wrapSystemSettingsServiceWithTariffMechanicWriteClearance()` wraps only `updateSetting`
and `updateSettingIfUnchanged`; it does not wrap `persistSettingsBatch`. Focused Vitest produced
`promise resolved "[]" instead of rejecting` in
`mechanicSettingsWriteClearance.mechanicWriteClearance.test.ts`.

### MUST FIX 2 — the UI invents owner copy in placeholders

Scenario: an owner whose organization has no stored `clinic_transactional_mail_template` opens the
branding tab. `ClinicDeliveryChannelsSection.tsx` shows the invented sender, subject and body
formulations in the three placeholders.

Impact: the required owner-authored clinic/platform wording is presented as a default and can be
copied into a saved branded mail template. The confirmed incident requires copy to remain absent and
delivery fail-closed until the owner supplies it.

Authority: audit brief item 4; C4: `clinic_transactional_mail_template` "должен написать
владелец" and owner-copy absence must not be substituted.

Evidence: `ClinicDeliveryChannelsSection.tsx:157`, `:167`, `:177` contain
`Имя отправителя: {{clinicName}} · {{platformName}}`, `Тема: {{senderDisplayName}}`, and
`Текст: {{senderDisplayName}} · {{code}}`.

### MUST FIX 3 — new notification text bypasses the notification dictionary

Scenario: saving the template succeeds or the settings API returns a known failure. The branding
screen emits a direct `toast.success` string and a direct fallback passed to `safeUserMessage`.

Impact: the same user-visible event can diverge from the shared error/notification vocabulary and
cannot be maintained at its required single source.

Authority: `AGENTS.md` §21a.

Evidence: `ClinicDeliveryChannelsSection.tsx:192` and `:195` contain the new literal toast text;
neither is read from `notificationText` or `errorCodeText`.

## Kill-set and inspection

Derived before reading candidate tests:

1. Tenant A can save complete owner copy and tenant B cannot read or overwrite it — behavior test.
2. HTTP and service write doors reject missing `branding`; own-SMTP availability is irrelevant —
   behavior test.
3. The stored value matches `mailProfile.ts` field names, lengths and required placeholders;
   incomplete values fail closed — behavior test.
4. No default owner copy exists — code inspection.
5. Existing branding tab/settings endpoint and doctor primitives are reused — code inspection.

Inspection result: the candidate uses `/api/admin/settings`, the existing
`ClinicDeliveryChannelsSection` and doctor `Card`, `Input`, `Textarea`, `Button` primitives.
The template has no separate page or endpoint. The route skips the SMTP availability map for this
key. The webapp validator matches the integrator reader exactly: three fields, maximums 500/500/4000,
and clinic/platform, sender-display-name, and code placeholders. Its registry entry is per-org,
server structured, with an absent default. The two copy and notification violations above prevent
PASS.

## Test review and fault injection

- Removed the candidate's registry-membership assertion and route DTO/call assertion: they pinned
  implementation structure rather than a public result.
- Retained and strengthened the service behavior test: incomplete copy is rejected and two
  organizations retain distinct values.
- Retained the route’s HTTP invalid-copy and missing-branding refusals; retained the service
  `updateSetting` physical-door test.
- Added the smallest missing public-service acceptance test for batch writes. It is intentionally
  red on this candidate and is the handoff oracle for MUST FIX 1.

Fault injections:

| Injected fault | Assertion that turned red |
| --- | --- |
| Remove `branding` from the route entitlement map | route test expected HTTP 403, received 200 |
| Classify the template as global instead of per-org | tenant-isolation test observed organization `null` and tenant B's value overwriting tenant A's |
| Stop requiring `{{platformName}}` in the webapp validator | service test expected incomplete copy rejection, received a stored row |
| Call the unwrapped `persistSettingsBatch` without clearance | batch acceptance expected `MechanicWriteClearanceRequiredError`, received `[]` |

No UI/DOM/copy test and no Next server were run.

## Validation

- `git diff --check` — passed before and after the audit changes.
- Focused non-UI Vitest: 51 passed, 1 failed (the intentional batch-bypass acceptance test).
- `pnpm --dir apps/integrator exec vitest run src/integrations/email/mailProfile.unit.test.ts` — 5 passed.
- `pnpm --dir apps/webapp typecheck` — passed.
- Scoped ESLint over all candidate and audit-test source paths — passed.

## Lead correction — 2026-09-19

- `persistSettingsBatch` теперь проходит тот же `TARIFF_MECHANIC_SETTING_KEYS` guard для каждой строки
  до обращения к базовому сервису; сохранённый batch acceptance-oracle стал зелёным.
- Три примера неутверждённой формулировки удалены из placeholders: поля показывают только нейтральные
  названия, пустое состояние не предлагает owner-copy.
- Успех и ошибка сохранения используют существующие `notificationText.settingsSaved` и
  `notificationText.settingsSaveFailed`; второй словарь не создан.
- Focused webapp-набор: `52 passed`; integrator consumer: `5 passed`; webapp typecheck, scoped ESLint
  и `git diff --check` — PASS. По §24.5 новый blind-pass тех же трёх findings не запускается;
  live UI и реальная доставка остаются post-land проверкой.
