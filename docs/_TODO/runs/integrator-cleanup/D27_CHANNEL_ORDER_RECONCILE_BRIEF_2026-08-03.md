# D27 — reconcile the code-delivery order with the owner's scheme, and unbreak the code screen

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать», §5, §10/§10a/§10b, §21/§22, §24.
Language: internal work is English; UI copy stays Russian.

Authority (the owner's own text, quoted below — this is what the code must match):
`docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §1a, §2, §3 (3.1–3.6);
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item **D27** and decision **Р-D27** (§2.3).

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §3.1 — «**Значение по умолчанию:** бот, которым **впервые
подтвердили номер**; либо почта, привязанная к тому OAuth, которым подтвердили номер.»

The owner said today, about the code that is now on `feat`: «проверь правильный порядок рассылки кодов — он был
в коде сделан некорректно и не согласован с моими решениями последними». Treat that as the reason this slice
exists. Do not widen it beyond the four findings below.

## Measured state

Branch `wt/trackd-d27de-login-code-screen` = the D27-D/E screen work (`96bad16a3`) merged with the B1 rewrite that
was landed straight onto `feat` (`053aad09c`). Both touch `apps/webapp/src/app/api/auth/phone/start/route.ts`.

## F1 — the default channel is not the one the owner defined

`pgChannelPreferences.getDefaultAuthOtpChannel` returns the **earliest linked** channel: `MIN` over
`user_channel_bindings.created_at` for telegram/max and `platform_users.email_verified_at`. The owner's rule is the
channel that **confirmed this phone number**. These differ in a reachable case: a person links Telegram in 2024
without a phone, then confirms their phone via MAX in 2026 — the code picks Telegram, the owner's rule says MAX.

`user_phone_history` records `source ∈ {otp, messenger, merge, admin, projection}` — it knows a messenger confirmed
the number but not **which** one, so today's data cannot answer the question for historical rows. Close it the
honest way: record the confirming channel at the moment of confirmation and read that back; for rows that predate
the recording, fall back to the current earliest-binding approximation and say so in the code and in the plan note.
TEST has no real users, so a migration plus a documented fallback is acceptable — do not invent a provenance value
for old rows.

## F2 — the record and the code disagree about a disabled channel

The D27-B1 note in `WORK_ORDER.md` states: «если резолвнутый канал не enabled+configured — тишина (не подмена
другим каналом)». The route does the opposite: when the resolved channel fails the policy check it falls through to
`else if (isRuMobile(normalized) && effectivePolicy.sms)` and sends SMS. One of the two is wrong. Decide which
behavior actually serves the person, make the code and the note agree, and justify the choice against §2 («входит…
только тот, что помечен как контакт для входа», login by a **confirmed** phone) and §1a (the owner accepted the
SIM-recycling risk and answered it with 2FA plus a new-device notice, not with a lockout). A false record is worse
than either behavior — do not leave them contradicting.

## F3 — merging the screen with the rewrite breaks the code screen

On this branch, four cases in `apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx` fail with
`Unable to find a label with the text of: Код подтверждения` — the flow no longer reaches the code step at all:

- `lets a browser login use SMS/email policy without sending an account-specific channel`
- `shows the same complete global channel list and neutral result for known and unknown phones`
- `adds the neutral spam-folder hint after choosing email`
- `returns from the real code screen to the other login methods`

Find the real cause in the automatic-delivery decision, fix the product (not the tests) unless a test genuinely
encodes the old ladder — and if you change any test, say exactly why in the report. All four elements the owner
listed in §3.2 must work on the real screen: code field, resend, «Подтвердить другим способом», and the top
«войти иначе» line.

## F4 — stale comment

`apps/webapp/src/app/api/auth/phone/start/route.ts:43` still documents the deleted ladder: «сервер сам выбирает
SMS → verified email». Correct it to what the code now does.

## Boundaries

- Do not change §3.3 neutrality: the alternate-channel list keeps showing every configured+enabled channel with the
  same message regardless of what the person actually has (this is accepted D27-A1 behavior — do not regress it).
- No integrator change, no D30/tariff/CMS change, no touching the deferred email timing oracle.
- A migration is allowed **only** for F1 provenance, and only if the existing tables cannot carry it. Reserve the
  number on the board in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` before creating the file.

## Done means

- Behavioral tests prove: the default is the confirming channel (with the documented historical fallback), an
  explicit profile choice still wins, the disabled-channel behavior matches the corrected record, and all four
  screen cases above pass.
- `pnpm --dir apps/webapp exec vitest run` over the touched auth/profile/channel-preference test files, plus
  `pnpm --dir apps/webapp typecheck`, scoped ESLint and `git diff --check` — all clean.
- The D27 notes in `WORK_ORDER.md` state what is true after this slice, including what is still open.
- One commit on `wt/trackd-d27de-login-code-screen`, no push, no merge into `feat`.
