# D25 focused re-audit — token-bound claim → provider contact (#984)

## Тест или взгляд

- **Новое повторяемое поведение → тест + одна инъекция на независимый класс:** signed claim,
  exact claim/contact match, replacement/concurrency, provider proof and retry/code delivery.
- **Разовое качество изменения → взгляд + catalog/generated inspection:** migration markers,
  owners, index, exact relation/body/capability privileges, generated artifacts and removal of active generic
  contact writers/fallbacks.
- **Граница scope → взгляд:** no Therapysto initiative/branding changes and no broadcast/relay broadening.

Role: independent `auditor-live` on `/home/dev/dev-projects/bcb-wt-d25-token-bound-bot-20260823`, branch
`wt/d25-token-bound-bot-20260823`. Candidate implementation is `06165b670`; evidence commit is `92a31d944`.
Return exactly `PASS, FOR LAND` or `FAIL, NOT FOR LAND`, commit the audit artifact and queue row, and leave a
clean tree.

Read before action: the `AGENTS.md` header map, «Как решать, что делать», §1 migrations/privileges,
§1b, §5, §10a/§10b and §24.4–24.7; `docs/OWNER_DECISIONS.md`; D25/D15b-2 in
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`; the first audit and its committed acceptance tests
at `c9a1c8064`; the fix brief; candidate diff `06165b670^..92a31d944`; and the implementation report.

## Owner oracle and exact boundary

Источник оракула: `docs/OWNER_DECISIONS.md`, «Роль бота после появления приложения»
(23.08.2026) — «никакая команда от бота не должна создавать пользователей сама по себе»;
«бот подтверждает телефон средствами мессенджера».

- The webapp starts login/registration/profile binding and owns persistent account/contact/merge decisions.
- `/start auth_<token>` may claim only that exact live webapp attempt for the exact channel and provider external
  id. Claim itself creates no person/contact/identity/binding/preference/merge.
- A later provider-owned contact may complete only the same live claim. Telegram requires sender-owned contact;
  MAX requires the existing HMAC/provider proof. Phone must match the webapp attempt.
- Arbitrary start/message/callback/contact, including contact from an already-known binding but without a live
  claim, creates and trusts nothing and decides no merge.
- Common bot still does phone binding, codes, booking and opted-in notifications. Only broadcasts/two-way clinic
  relay are branded-only. Do not touch or inspect by mutation any Therapysto initiative branch/path.

## Why this re-audit exists

The first audit already established the old kill-set and committed acceptance tests. Do not rebuild or re-run a
blind audit of the lookup-only identity root. This pass is justified only because the fix introduced a material new
surface: signed claim endpoint, two seam functions, claim columns/index, token-less claimed completion, and active
Telegram/MAX claim/contact scripts. Reuse all `c9a1c8064` tests and evidence.

## Required focused audit

Classify each item under §24.4. A finding needs a reachable scenario, impact and exact violated authority/rule.

1. Prove claim validates exact token, channel, expiry/consumption/status and external id while writing only claim
   metadata on the existing attempt. Invalid signature, token/channel/external mismatch and expired/used attempt
   must not claim or create canonical rows.
2. Prove deterministic replacement for repeated/newer valid starts for the same messenger identity, including
   concurrent or near-concurrent claims: no ambiguous live claims, uncaught uniqueness error or wrong-attempt
   completion.
3. Prove active Telegram and MAX `/start auth_<token>` reach the signed claim call and, only after success, request
   provider-owned contact. A failed contact prompt must not be reported as a completed human step; retry/recovery
   must remain possible.
4. Prove claimed self-contact completes through the existing
   `completePhoneMessengerBindFromIntegrator` → `applyMessengerContactPreOtp` door. Wrong external id, wrong
   channel, wrong phone, unclaimed contact, expired/consumed/replayed claim and provider-spoofed contact must make
   no canonical write. Assess whether a retry after OTP creation/delivery interruption can still deliver the code;
   if not, name the reachable human impact.
5. Prove generic `user.phone.link` and generic request-contact fallback are absent from every active Telegram/MAX
   content/resolver path, while known bindings, booking and notification dispatch remain intact.
6. Inspect both migrations, schema declaration, index, statement-owner markers, seam body privileges, port
   capabilities and generated DEV/TEST artifacts. Re-run the owner-aware named-DEV rollback-only proof so the old
   missing `SCHEMA-CREATE` blocker and the new claim migration both pass under declared owners. No migration grants.
7. Confirm diff scope contains no Therapysto initiative or branding work and does not broaden broadcasts/relay.

## Evidence and deliverable

- Reuse the committed tests/kill-set. Add only genuinely missing acceptance for the new claim surface. If a new
  behavioral test is added, fault-inject its independent failure class once and restore every product file.
- Use named DEV only for rollback-only live proof. No disposable DB. State each measured number beside its exact
  command in the report; leave no rows, privileges, settings or fixtures.
- Run targeted claim/contact/provider tests, both package typechecks, scoped lint, migration order, generator
  byte-check, privilege/body/raw-SQL gates and `git diff --check`. No full CI.
- Auditor may commit only acceptance tests, one report under `docs/_TODO/runs/integrator-cleanup/`, and one exact
  verdict row in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. No product fix. Stage explicit paths only;
  never `git add -A`. Commit message contains `#984` and leave the tree clean.
- No deploy, push, TEST/PROD, real bot token read/output, outbound delivery or taskdb edit.
