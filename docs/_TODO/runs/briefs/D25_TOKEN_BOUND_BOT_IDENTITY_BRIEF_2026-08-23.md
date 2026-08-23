# D25 — generic bot ingress must not create accounts

Role: implementation worker. One bounded pass, commit before exit.

## Authority

Read `AGENTS.md` header map first, then §1 migrations/DB, §5, §10a/10b and §24. Authority is the latest owner
decision recorded in `docs/OWNER_DECISIONS.md` under «Роль бота после появления приложения» and the D15b/2 +
D25 checkboxes in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`:

- no generic Telegram/MAX `/start`, message, callback or contact creates `platform_users`, trusts a phone or
  decides a merge;
- registration/login begins in webapp, produces a token-bound `auth_<token>` attempt, the bot confirms a matching
  contact and delivers the code, and webapp-owned completion owns any account creation/binding;
- the old “two arbitrary webhooks” gate is cancelled;
- branded-bot work and the Therapysto rename/branding initiative are not part of this pass.

## Measured defect

`createIncomingEventPipeline` calls `ActorResolutionPort.ensureActor` for every user-originated message/callback.
That emits `user.upsert`. `app.integrator_upsert_channel_identity` then inserts a blank `platform_users`,
`user_identity`, `user_channel_bindings` and `user_channel_preferences` row when the messenger id is unknown.
The fact that the SQL function is webapp-owned does not make an arbitrary webhook a webapp registration.
`dispatchRequestContactToUser` also conditionally emits the same mutation before sending Telegram request-contact.

The correct token-bound path already exists:
`POST /api/auth/phone/messenger-bind/start` → `auth_<token>` →
`webapp.phoneMessengerBind.complete` → `completePhoneMessengerBindFromIntegrator` →
`applyMessengerContactPreOtp` → OTP/code confirm. Reuse it; do not create a second flow.

## Required result

1. Unknown generic Telegram and MAX user-originated ingress cannot create any canonical person/contact/channel row.
   It may remain unresolved and receive only behavior allowed to an unresolved actor.
2. Existing bound messenger users continue to resolve and use the bot. Updating an already-existing binding's
   non-identity display handle is allowed only if existing behavior genuinely requires it; no create fallback.
3. Signed/token-bound phone-messenger login and profile-bind remain working. Only that webapp-owned completion may
   create/bind the canonical account/contact after token, channel and matching phone validation.
4. Remove the misleading/obsolete generic creator capability. Prefer deleting or narrowing the existing
   `user.upsert`/`app.integrator_upsert_channel_identity` path; do not introduce a new wrapper, second identity
   service, HTTP hop, store or relation grant. Search all callers before choosing delete vs lookup-only.
5. If a DB function/capability becomes dead or changes contract, use one timestamped B0-forward migration and
   regenerate DEV/TEST privilege/schema artifacts through existing generators. No historical replay and no
   disposable DB.
6. Update only directly affected active auth/integrator docs/comments/tests. Do not touch any file under
   `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` or any `therapysto-*`, `night-*`, `reaudit-*` branch.

## Acceptance to build

- Behavioral test: an unknown generic Telegram message/callback and an unknown generic MAX ingress do not issue a
  canonical create/write and do not fail the whole pipeline merely because no actor exists.
- Behavioral test: the same fault cannot return by routing generic ingress through a renamed/new creator.
- Behavioral test: a known existing binding still resolves.
- Existing token-bound phone messenger tests remain green, including mismatch/expired/replay/profile-bind and
  account creation only from the webapp completion.
- Migration/privilege/generator checks appropriate to the actual diff are green.
- Targeted integrator and webapp tests, package typechecks, scoped lint and `git diff --check` are green.

Do not run full CI, deploy, push, TEST/PROD writes or live messenger traffic. The independent auditor will perform
the named-DEV rollback-only proof on the committed candidate. Do not edit taskdb. Stage explicit paths only; never
`git add -A`. Commit message must include `#984`, why, evidence, plan item, and what was not done. Leave a clean tree
and write a concise report under `docs/_TODO/runs/integrator-cleanup/`.
