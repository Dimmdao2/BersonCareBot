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

---

## F5 — SECOND SLICE (do not start until the F1–F4 run has returned)

Added 2026-08-03 after the owner corrected a false record: «насколько помню было исследовано поведение в серьёзных
продуктах и решено что одна почта является основной а остальные — для восстановления». The decision exists and is
already written down — `IDENTITY_AND_MERGE_SCHEME.md` §3.4: «**первая привязанная почта — основная, код всегда
уходит в неё; остальные — резервные.**»

The previous D27-B1 note claimed §3.4 was inapplicable because «в текущей модели у аккаунта ровно один
`platform_users.email`». That is wrong, and the note has been corrected in `WORK_ORDER.md`. Measured reality:

- `platform_users.email` + `email_verified_at` — one address (`db/schema/schema.ts:122-125`);
- `user_oauth_bindings.email` with its own `created_at`, **one row per OAuth provider**
  (`db/schema/schema.ts:1101-1112`) — so several verified addresses per account exist today.

Two divergences follow, both reachable:

1. `pgUserByPhone.getVerifiedEmailForUser` (`pgUserByPhone.ts:141-152`) reads only `platform_users.email`. If the
   earliest-linked address is an OAuth one, the login code goes to an address the owner's rule does not designate.
2. `getDefaultAuthOtpChannel` derives the email candidate only from `platform_users.email_verified_at`, while the
   owner's §3.1 default is «почта, привязанная к тому OAuth, которым подтвердили номер» — OAuth bindings are
   precisely the source that rule names.

Close both: one place decides «the primary address of this account» = the earliest verified address across both
sources, the code always goes there, the rest stay recovery-only. Do not add a second email store; do not change
which addresses may log in (§2 is a different question and is not in this slice). Prove it with behavioral tests
covering: OAuth address linked earlier than the profile address, profile address linked earlier, and an account
with no verified address at all.

### F5 addendum — SUPERSEDED IN PART on 2026-08-03 (read the F6 section below first)

⛔ The paragraph below recorded «the owner closed развилка №6: login by the primary email only». Later the same day
the owner **reopened** that fork as an explicit open question (see §2a item 7 of the scheme) while ruling on
everything else. What still stands from it: the OAuth overwrite of the primary email must go, and the login code
goes to the primary. What does NOT stand: any rule limiting login to one contact — that is now the owner's open
gate and must not be built.

### F5 (original text, kept for provenance)

Owner, verbatim: «для входа используется одна почта — основная. Та которая привязана первой. Я думаю что пока
этого хватит, и чтобы возможность привязывать дополнительные адреса давала почту для восстановления, но не для
входа». Recorded in `IDENTITY_AND_MERGE_SCHEME.md` §2 (развилка №6, closed for email) and §3.4.

Measured before recording, so the slice knows what it is fixing:

- Login, password state and reset all resolve the account through `platform_users.email_normalized` only
  (`pgEmailPasswordLookup.ts:75-88`, `pgEmailAuth.ts:178`). A secondary address already cannot log in — the
  decision confirms current behavior and takes nothing away.
- **But the primary does not survive.** `applyVerifiedOAuthEmail` (`pgOAuthUserResolve.ts:13-28`) runs
  `UPDATE platform_users SET email = <provider address>, email_normalized = …` on **every** OAuth sign-in with a
  trusted email. A person who registered as `anna@mail.ru` and later signs in with Google silently loses that
  address as their login identity — it is not even kept as a recovery address, because the column was overwritten.
  This violates the owner's rule directly and is a break in a real person's path.
- Recovery through a secondary address does not exist today (same single lookup).

So F5 grows by two concrete requirements, on top of «the code always goes to the primary»:

1. **The primary is assigned once and never silently reassigned.** When a verified OAuth address arrives and the
   account already has a verified primary, keep the primary and retain the new address as an additional
   (recovery/delivery) address — `user_oauth_bindings` already stores it. Set the primary from OAuth only when the
   account has none. Prove it with a test that signs in twice with two different provider addresses and asserts the
   primary is unchanged.
2. **Secondary addresses recover, never authenticate.** Password recovery accepts a secondary address and recovers
   the same account; login and the login code stay bound to the primary. Prove both directions: recovery by
   secondary succeeds, login by secondary does not.

Out of scope: phones and messengers as login identifiers — развилка №6 stays open for them, the owner spoke about
email only. Do not touch that.

---

## F6 — OAuth contact resolution (THIRD SLICE, owner-ruled 2026-08-03)

Authority: `IDENTITY_AND_MERGE_SCHEME.md` **§2a** — the owner dictated the whole table there, including the exact
Russian message for the conflict case. Read it before touching anything; it supersedes any earlier note about
one-email login.

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §2a — «но вот что точно надо — это убрать перезапись основной
почты при входе через OAuth», плюс шесть пронумерованных случаев владельца.

Implement cases 1–6 exactly as written, at the existing chokepoint `oauthWebLoginResolve.ts` plus its ports — do
not add a second resolver:

1. Same email → log in; the OAuth sign-in **confirms** that address the same way a code does.
2. Neither the provider's email nor its phone is registered → create a new account (today's behavior).
3. Provider gives both contacts and one of them matches → the other is **added to that account and becomes
   confirmed**.
4. Email matches, phone differs → the provider's phone is added as an additional (spare) contact.
5. Phone matches, email differs → the provider's email is added as an additional (spare) contact.
6. The two contacts belong to **different accounts** → refuse the login and show exactly:
   «Конфликт контактных данных, войдите в систему по подтвержденному телефону или email. Для устранения конфликта
   напишите в службу поддержки», with a button to support chat. Decide and state in your report how that button
   works for a person who is not signed in, given that D-12 forbids anonymous support — either route it to the
   existing public support path or name the exception; do not choose silently.

Hard constraint from the same ruling: **remove the unconditional primary-email overwrite**
(`pgOAuthUserResolve.ts:13-28`). The primary is set only when the account has none; every later address is added,
never substituted.

⛔ Do NOT build anything for item 7 (equal-rights login across all registered contacts, or a per-binding
identification/recovery switch). That is an open owner gate. Adding contacts as confirmed (cases 3–5) is required;
deciding whether they may authenticate is not this slice's business — leave today's lookup behavior untouched
there and say so.

Tests must cover each of the six cases as behavior, plus: two consecutive OAuth sign-ins with different provider
addresses leave the primary unchanged.
