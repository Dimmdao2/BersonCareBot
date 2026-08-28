# Worker brief — retire public integrator user identity runtime

## Authority

- Read `AGENTS.md` map first, then §1 migrations/rights, §5, §7, §9–§10, §10a–§10b and §24.
- Owner authority: `docs/OWNER_DECISIONS.md` section **«Роль бота после появления приложения»**, especially:
  bot confirms self-owned phone but does not create an account; arbitrary `/start`, message, callback or contact
  without the token-bound webapp attempt creates no `platform_users` row.
- Branding authority: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5. Both the
  platform bot and a branded clinic bot confirm phone and deliver codes/ordinary notifications; only broadcasts
  require the branded bot.
- Track authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §3.4 and
  `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` final production census.

Источник оракула: `docs/OWNER_DECISIONS.md` — «Уточнение владельца 23.08.2026 — бот подтверждает телефон, но не
создаёт учётную запись.»

## Goal

Complete one coherent Track D cutover: the public/webapp user identity and all live auth/reminder/broadcast-link
paths must use canonical `platform_users.id`, verified phone/contact and `user_channel_bindings`, never retired
`integrator_user_id`. Do not return the removed M2M/projection path under another name.

The measured production census found five reachable residual classes. Fix all five in one pass:

1. Telegram/MAX webapp-entry token and auth resolution still carry numeric integrator ID and
   `findOrCreateByChannelBinding` can create a user from a messenger entry.
2. Reminder creation rejects a canonical user without retired ID and writes retired ID into the rule.
3. Reminder reads/journal/statistics still contain fallback joins through retired ID.
4. Telegram/MAX reminder callbacks resolve ownership through numeric integrator user/rule ID.
5. Doctor broadcast links re-read retired ID and send the user back into the retired auth path.

## Required implementation

- Reuse and extend the existing canonical UUID/channel-binding seams. Before adding any helper/function/resolver,
  prove an existing one cannot be parameterized. One common path; no parallel auth or reminder implementation.
- Webapp-entry tokens carry a canonical user reference only when an existing channel binding resolves it. Generic
  messenger webhook traffic must never create `platform_users`; only the token-bound phone messenger flow owned by
  webapp may establish/merge account/contact and issue the code.
- Preserve the full owner behavior: both platform and branded bots can confirm phone and deliver codes/ordinary
  notifications. Do not make broadcasts available to the platform bot.
- Reminder create/read/update/journal/statistics use canonical UUID. A patient with a canonical UUID and a selected
  bot binding can create and operate reminders without web-push and without retired ID.
- Telegram/MAX reminder callbacks resolve canonical UUID from the exact channel binding, then authorize against the
  canonical occurrence/rule owner. Cross-user and cross-organization callbacks remain denied.
- Broadcast links use canonical UUID/channel binding and cannot enter a create-account fallback.
- Add one forward timestamp migration only if needed. Backfill canonical UUIDs from existing unambiguous mappings
  before removing legacy public identity columns/indexes/functions. The migration must fail closed on an unresolved
  row rather than delete or guess. Do not edit historical migrations and do not apply rights in a migration.
- Physically remove the retired public identity contract wherever the cutover proves it redundant, including
  schema/types/readers/writers. Do not remove the integrator's own internal principal key or a delivery-attempt
  diagnostic field merely because it has the same words; classify each survivor explicitly in the report.
- Update active auth/reminder operational docs that still say the bot can create an account. Historical archive and
  past evidence stay unchanged.

## Acceptance

- Existing canonical account + Telegram binding and separately MAX binding can enter through a signed link; token
  contains no retired numeric identity.
- Generic webhook/start/contact without a live token-bound webapp attempt creates zero accounts.
- Token-bound phone proof still confirms the messenger-owned phone and returns the login code to the existing
  webapp flow.
- Canonical-only user can create/list/update a bot reminder; callback ownership works for the owner and denies a
  different binding/user/org.
- Doctor broadcast link resolves the existing canonical account and never creates one.
- Exact production census over non-test source shows zero active public identity reads/writes/fallbacks. Every
  remaining `integrator_user_id` occurrence is listed and classified as internal integrator principal, immutable
  historical migration/evidence, diagnostic delivery attempt, or temporary merge/backfill mechanism.
- Relevant auth, reminder, integrator callback/link tests, both app typechecks, scoped lint, generated checks and
  migration privilege/order gates pass. No full monorepo CI.
- If a migration is added, run owner-aware `migrate-dev.sh --preflight` only (rollback). Do not execute on DEV/TEST.
- Do not touch TEST/PROD, env, domains, UI styling, taskdb or unrelated Therapysto branches.

## Execution discipline

- This is one port turn: do not finish while a foreground test is still running.
- After each major milestone, append a concise progress line to
  `/home/dev/brain/runs/agent-port/retire-public-integrator-id-runtime-20260828.md`.
- Commit all task files explicitly (never `git add -A`) with `#987` in the message. Finish with a clean tree and
  report commit SHA, exact commands/results, migration rights analysis and the classified survivor list.
