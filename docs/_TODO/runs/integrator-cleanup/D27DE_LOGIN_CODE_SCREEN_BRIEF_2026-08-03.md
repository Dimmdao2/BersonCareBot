# D27-D/E — the screen after entering the phone number

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать» (measure first, do not multiply entities),
§15/§17 (patient UI primitives and isolation), §21 (UI copy), §22 (`<Select>`), §10/§10a/§10b, §24.
Language: internal work is English; UI copy is Russian per the repo's own convention.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item **D27** and decision **Р-D27** (§2.3);
scheme `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §3.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item D27 — «экран после ввода номера —
поле кода, повторная отправка, «подтвердить другим способом», сверху строка «войти иначе»»; and Р-D27 — «Список
«другим способом» показывает ВСЕ включённые в админке каналы без разделения, есть ли они у человека, и сообщение
всегда одинаковое («код отправлен, проверьте входящие»; для почты — про спам): экран не должен подсказывать
постороннему, какие каналы есть у владельца номера.»

## Step 1 — measure before you build

Most of this screen already exists. `apps/webapp/src/shared/ui/patient/auth/` has `AuthFlowV2.tsx`,
`OtpCodeForm.tsx` (code field, resend with countdown, SMS fallback), `ChannelPicker.tsx`, `SmsCodeForm.tsx`,
`PhoneMessengerAuthFlow.tsx`. Read them and the phone start/confirm routes first, then write down — in your report —
exactly which of the four required elements are already live, which are partially wired, and which are missing.
Close only the gap. Do not build a second screen, a second picker or a parallel flow beside these.

## Step 2 — close the gap, nothing more

The four required elements, in the owner's words:

1. поле кода — the code field;
2. повторная отправка — resend;
3. «подтвердить другим способом» — a way to switch to another channel from this screen;
4. сверху строка «войти иначе» — a line at the top that returns to the other login methods.

And the Р-D27 constraint over element 3: the alternate-channel list shows **every channel enabled in the admin
panel**, with no split by whether this person actually has it, and the message after sending is always the same
(«код отправлен, проверьте входящие»; for email — the spam-folder hint). Nothing on this screen may reveal which
channels belong to the owner of the number. This constraint is already satisfied on the anonymous `check-phone`
path (D27-A1, accepted) — do not regress it, and reuse the existing global configured+enabled policy rather than
inventing another source.

If an honoured explicit preference exists (D27-B1, `wt/trackd-d27b1-auth-channel-preference`, under audit right
now), the screen must not contradict it: the preference decides where the code went; the list is still complete.

## Boundaries

- No DB migration, no new table, no new API unless an existing route provably cannot carry the behavior — and then
  say why in the report before writing it.
- No identity/merge change, no integrator change, no D30/tariff/CMS change.
- Do not touch the deferred timing oracle in the email OTP tests (D27-C/D30 owns it).

## Done means

- The four elements work on the real screen; behavioral tests cover element 3's neutrality (same list and same
  message regardless of whether the number is known) and element 4's return path.
- `pnpm --dir apps/webapp typecheck`, scoped ESLint and the targeted test files pass; `git diff --check` clean.
- One commit on your branch, no push. Report: the Step 1 measurement, what you changed, and the exact commands
  with counts.
