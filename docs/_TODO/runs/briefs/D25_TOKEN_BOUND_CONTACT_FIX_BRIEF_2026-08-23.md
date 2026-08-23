# D25 fix round — token-bound messenger contact (#984)

Role: implementation worker (`worker-hard`) in the existing worktree
`/home/dev/dev-projects/bcb-wt-d25-token-bound-bot-20260823`, branch
`wt/d25-token-bound-bot-20260823`.

Read before action:

- `AGENTS.md`, especially «Как решать, что делать», §1 migrations, §5, §10a/§10b and §24;
- `docs/OWNER_DECISIONS.md`, owner decision «Роль бота после появления приложения» dated 23.08.2026;
- D25/D15b-2 in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`;
- `docs/_TODO/runs/integrator-cleanup/D25_TOKEN_BOUND_BOT_IDENTITY_AUDIT_2026-08-23.md`;
- the committed acceptance tests in audit commit `c9a1c8064`;
- the current runtime content path described by `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`.

## Owner oracle — do not soften

Источник оракула: `docs/OWNER_DECISIONS.md`, «Роль бота после появления приложения» (23.08.2026) — «никакая команда от бота не должна создавать пользователей сама по себе».

The webapp starts registration/login/profile binding and owns persistent account/contact/merge decisions.
The common Therapysto bot proves phone ownership using messenger mechanisms, binds the phone for that
webapp-started attempt, delivers login codes, and delivers opted-in notifications. An arbitrary `/start`,
message, callback or contact without a live token-bound webapp attempt creates no account, trusts no phone
and decides no merge. Broadcasts and two-way clinic relay remain branded-bot-only.

Do not touch, switch, merge or edit the Therapysto branding initiative or any `therapysto-*` branch/path.

## Starting point and mandatory saved evidence

Start from clean `c9a1c8064`. Preserve the auditor's tests and report. The audit proved the lookup-only
identity root behavior and left one intentionally red owner-aware preflight plus the remaining product gap:

- `20260823T093000_channel_identity_root_becomes_lookup_only.sql` lacks
  `-- BCB-MIGRATION-SCHEMA-CREATE: app`;
- active Telegram/MAX JSON still routes every provider-proven contact to `user.phone.link` without a
  webapp attempt;
- resolver/onboarding paths still ask for a generic contact;
- `/start auth_<token>` is parsed into `authSecret`, but the active runtime has no token-bound scripts that
  connect that start to the later contact.

## Required implementation

Deliver the complete human path, not only the one-line migration marker.

1. Add the missing schema-create marker in the exact parser order and make the committed owner-aware DEV
   preflight green. Do not put `GRANT`/`REVOKE` in a migration.

2. Make the webapp-owned `phone_messenger_bind_secrets` attempt the only persistent conversation state for
   this flow. Extend that existing attempt/table and the existing `PhoneMessengerBindPort`; do not restore
   integrator dialogue state, create a second attempt table, or store the token in generic bot state.

3. `/start auth_<token>` for Telegram or MAX must call a signed webapp claim step that validates the exact
   live attempt, channel, expiry/consumption and binds that attempt to the exact provider external user id.
   The claim creates no `platform_users`, `user_contacts`, identity, binding or preference row. On success
   the bot asks for the provider-owned contact. A newer valid start for the same messenger identity must have
   deterministic behavior; there must never be two ambiguous live claimed attempts.

4. A later provider-proven contact must complete only the live claim for that same channel + external user.
   Resolve the claim in the webapp and reuse `completePhoneMessengerBindFromIntegrator` plus its existing
   `applyMessengerContactPreOtp` canonical door. Do not duplicate phone/token/expiry/replay/profile-bind or
   account-creation logic in the integrator or a parallel webapp completion function. This existing completion
   function is the explicit §5 consolidation candidate.

5. Remove the active generic `user.phone.link` contact scripts and generic contact-request fallback. A
   provider-owned contact with no live claim must make no canonical write and must not show a false success.
   Unbound booking/menu/cabinet recovery should direct the person to start/continue in the webapp, using an
   existing recovery/menu surface where possible, rather than silently recreating bot-led registration.

6. Add active filesystem JSON scripts for both Telegram and MAX:

   - token start → signed webapp claim → request self-contact;
   - claimed self-contact → signed webapp completion → existing success/code delivery;
   - invalid/expired/mismatched/unclaimed cases → recovery with no persistent identity/contact/merge write.

   Preserve the common bot's booking and notification behavior. Do not broaden broadcasts or two-way relay.

7. Keep secrets out of logs, reports and outbound text except the user-entered/deep-link token already
   necessary to claim the attempt. Do not read or print a real bot token and do not send real outbound traffic.

## Migration / privilege contract

Any new columns/indexes/functions are declared first in schema/declaration and delivered by timestamped forward
migration(s). Use statement-owner markers, owner-aware rollback-only candidate preflight on named DEV, and the
generated privilege pipeline. Migration files never contain grants. For every migration, write the §1 privilege
analysis in the report: objects, owners/runtime roles, body privileges, declaration delta. New lookup columns used
for claim resolution need the matching index in the same change.

## Acceptance — all required before commit

Reuse every test committed by `c9a1c8064`; do not rewrite the kill-set to match the fix.

Add the missing behavior acceptance for the new surface:

- valid `/start auth_<token>` claims only the webapp attempt and asks for self-contact;
- wrong channel, external id, expired/consumed/replayed token cannot claim or complete;
- provider-owned contact for the same live claim completes login/profile binding through the existing webapp
  canonical door and produces the existing code/success response;
- contact without a claim, including for an already-known messenger binding, trusts no phone, creates nothing
  and decides no merge;
- unknown generic start/message/callback/contact creates nothing;
- Telegram sender-owned contact and MAX HMAC proof remain mandatory;
- no active Telegram/MAX content path calls generic `user.phone.link`;
- known bindings, booking and notification dispatch do not regress.

Run targeted integrator and webapp suites, typecheck, scoped lint, migration order, generated artifact byte check,
privilege/body/raw-SQL gates, and all candidate owner-aware rollback-only DEV proofs. No disposable database.
No full CI, push, deploy or TEST/PROD access in this worker round.

## Deliverable

Commit all task files explicitly (never `git add -A`) on `wt/d25-token-bound-bot-20260823`; commit message must
contain `#984`. Add a concise implementation report under `docs/_TODO/runs/integrator-cleanup/` with exact commands
and results, migration privilege analysis, candidate SHA and explicit NOT DONE. Leave the tree clean. Do not end
the turn while a foreground test is still running.
