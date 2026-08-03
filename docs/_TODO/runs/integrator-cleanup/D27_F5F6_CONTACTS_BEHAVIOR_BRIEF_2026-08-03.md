# D27 F5+F6 — contact behavior: primary email, OAuth resolution, equal-rights login

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать», §5, §10/§10a/§10b, §24.
Language: internal work is English; UI copy stays Russian.

Authority: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` **§2, §2a, §3.4** — the owner dictated
all of it on 2026-08-03. Detailed findings and file-level measurements: `D27_CHANNEL_ORDER_RECONCILE_BRIEF_2026-08-03.md`
sections **F5** (with its addendum) and **F6**. F1–F4 of that brief are already landed (`dea19e48c`) — do not redo them.

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §2a — «но вот что точно надо — это убрать перезапись основной
почты при входе через OAuth», и §2a пункт 7 — «равноправный вход по любому подтверждённому контакту — согласен».

## Scope — three behaviors, all owner-ruled

1. **The primary email is never silently reassigned.** `applyVerifiedOAuthEmail` (`pgOAuthUserResolve.ts:13-28`)
   currently runs `UPDATE platform_users SET email = <provider address>` on every OAuth sign-in. Remove that: the
   primary is set only when the account has none; a later provider address is retained as an additional contact
   (`user_oauth_bindings` already stores it). Test: two consecutive sign-ins with two different provider addresses
   leave the primary unchanged.
2. **OAuth contact resolution, the owner's six cases** — implement exactly as §2a lists them, at the existing
   chokepoint `oauthWebLoginResolve.ts` and its ports; do not add a second resolver. Case 6 (contacts pointing at
   two different accounts) refuses the login and shows verbatim: «Конфликт контактных данных, войдите в систему по
   подтвержденному телефону или email. Для устранения конфликта напишите в службу поддержки», with a support-chat
   button. Decide and state in the report how that button works for a person who is not signed in, given D-12
   forbids anonymous support — route it to the existing public support path or name the exception; do not choose
   silently.
3. **Equal-rights login by any confirmed contact.** Login and password-state lookups today resolve only the primary
   column (`pgEmailPasswordLookup.ts:75-88`, `pgEmailAuth.ts:178`). They must accept **any confirmed contact** of
   the account. «Основная почта» keeps exactly one meaning: the default destination for codes and notifications
   (§3.4) — it is not a login restriction. A contact that is not confirmed still never logs anyone in (§1, §2).

## The boundary that matters most

⛔ **Do NOT introduce a `user_contacts` table or any new contact store.** The owner is deciding right now whether to
restructure identity storage (three tables, possibly two databases) — that is **D15a/D15b**, and building a new
store here would be thrown away or, worse, become a second parallel model. Work with what exists:
`platform_users.email_normalized` / `phone_normalized`, `user_oauth_bindings`, `user_phone_history`,
`user_channel_bindings`. Where the equal-rights lookup needs to read several sources, put that behind **one**
function/port so D15b can later swap its implementation in a single place — say in the report where that seam is.

Also out of scope: the per-binding «identification / recovery only» switch (the owner rejected it), the contact
list UI with removal (separate slice), and anything about phones/messengers as identifiers beyond what §2a states.

## Done means

- Behavioral tests for each of the owner's six cases, for the unchanged-primary invariant, and for equal-rights
  login (confirmed secondary contact logs in; unconfirmed contact does not).
- `pnpm --dir apps/webapp typecheck`, scoped ESLint, `git diff --check` clean; the touched test files pass.
- The D27 note in `WORK_ORDER.md` and §2a in the scheme state what is true after this slice and what stays open.
- One commit on your branch, no push, no merge into `feat`.
