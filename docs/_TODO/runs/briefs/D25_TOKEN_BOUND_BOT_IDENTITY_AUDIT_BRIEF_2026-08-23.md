# Independent audit — D25 token-bound bot identity

## Тест или взгляд

- **Повторяемое поведение → тест + fault injection + bounded live proof:** generic ingress не создаёт аккаунт;
  known binding продолжает работать; Telegram sender-owned contact, MAX HMAC, token/phone match, mismatch,
  expiry/replay/profile-bind сохраняют контракт.
- **Разовое качество изменения → взгляд + catalog/generated inspection:** SQL-root действительно lookup-only,
  B0-forward migration/owner/grants/order точны, широких relation rights и второго writer-path нет.
- **Граница scope → взгляд:** Therapysto initiative и роли ботов вне точной owner-коррекции не изменены.

Role: independent `auditor-live`, not the implementation author. Produce a binary `PASS, FOR LAND` or
`FAIL, NOT FOR LAND`, commit the report and audit-queue row, then leave a clean tree.

## Authority

Read `AGENTS.md` header map first, then §1/1b, §5, §10a/10b and §24.4–24.7. Read the full candidate brief and
diff before execution, but derive the behavior kill-set from authority before reading candidate tests.

Источник оракула: `docs/OWNER_DECISIONS.md` §«Роль бота после появления приложения» — «никакая команда от
бота не должна создавать пользователей сама по себе»; «бот подтверждает телефон средствами мессенджера».

Owner boundary:

- generic Telegram/MAX `/start`, text, callback or contact without a live webapp attempt does not create a
  canonical account/binding, trust a phone or decide a merge;
- webapp starts `auth_<token>`; Telegram proves contact ownership with
  `contact.user_id === message.from.id`, MAX proves the vCard with provider HMAC and configured bot token;
- webapp matches that proven normalized phone to the token-bound attempt and owns any persistent account/contact
  write and merge decision; only then does the bot deliver the code;
- common Therapysto bot still supports phone binding, login codes, booking and opted-in notifications. Push is the
  default, not the only channel. Only broadcasts and two-way relay require a branded clinic bot.

## Audit questions

Classify each item under §24.4 and name the exact reachable impact for every finding.

1. Does every user-originated generic Telegram and MAX ingress avoid canonical person/contact/channel creation,
   including actor pre-resolution and signed outbound request-contact helpers?
2. Can the removed behavior be reached through a renamed mutation, DB root, wrapper, fallback, long-polling route,
   dedicated webhook or second store?
3. Do known existing messenger bindings still resolve and use the normal bot pipeline without a new account?
4. Does token-bound login/profile-bind still preserve both proofs: provider-owned contact and exact phone match to
   the webapp attempt? Verify Telegram spoofed `contact.user_id`, MAX missing/invalid HMAC or missing token, phone
   mismatch, expired/used token, replay and profile-bind semantics.
5. Is account creation reachable only inside webapp-owned completion after proof, never from integrator generic
   ingress? Does integrator remain unable to decide merge or mark arbitrary phone trust?
6. If the candidate drops/narrows a DB root/capability, are migration order, owner, grants, generated artifacts and
   all callers exact, with no broad relation right and no second common pass?
7. Did the implementation touch Therapysto initiative files/branches or broaden bot roles? Any such change is
   outside scope and blocks landing.

## Required independent evidence

- Build a kill-set before reading tests. Reuse existing acceptance where adequate; add only missing behavioral
  tests once.
- Fault-inject the old independent class: restore a generic unknown messenger-id create path (or equivalent minimal
  mutation) and prove the acceptance turns red. Restore all product files afterward.
- Run focused Telegram and MAX contact-provider proof tests, incoming pipeline/actor-resolution tests, phone
  messenger bind tests, and the exact migration/privilege/generator gates required by the diff.
- On named DEV only, perform a bounded rollback-only/read-after proof with unique fake messenger ids: generic
  Telegram and MAX inputs leave `platform_users`, `user_identity`, `user_channel_bindings` and preferences
  unchanged; known binding control still resolves. State every number beside the exact command that produced it.
  Do not create a disposable DB. Do not leave rows, settings, secrets or artifacts behind.
- If a full token-bound HTTP flow cannot be proven pre-landing without persistent fixtures or real outbound traffic,
  prove the webapp completion behavior through the real module/DB seam rollback-only and name the exact post-deploy
  TEST gate. Do not weaken the generic-negative live proof.
- Run targeted package typechecks/scoped lint and `git diff --check`. Do not run full CI.

No TEST/PROD mutation, deploy, push, real bot token read/output, real outbound delivery, taskdb edit or Therapysto
initiative change. Stage explicit audit paths only, never `git add -A`. Report under
`docs/_TODO/runs/integrator-cleanup/` and append one exact verdict row to
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. Commit message includes `#984`, evidence and not-done scope.
