# Track D final live audit — identity/contact path (D15b/6 + D25)

**Scope:** named TEST only; no PROD, provider call, deploy, config change, synthetic account, or persistent DB write.

**Authority read:** `AGENTS.md` §§1, 1a, 1b, 5, 9, 10a, 10b, 24; `docs/OWNER_DECISIONS.md` (23.08, «Роль бота после появления приложения»); `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` (D15b/6, D25); `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`.

## Results

| Gate | Result | Evidence |
| --- | --- | --- |
| TEST deployment identity and DB health | **PASS** | Checkout `3745ae24c9de62afc85f6aaf602bfecb3ada5f69`; webapp/API/scheduler active; `GET /api/health` returned `{"ok":true,"db":"up"}`. Both runtime units started from `/opt/projects/bersoncarebot-test` at `2026-08-24 14:03:24 MSK`. |
| D25 generic ingress, rollback-only DB proof | **FAIL** | Existing proof ran against `bersoncarebot_test` under `bcb_test_migrator`. Arm C owner-aware candidate preflight passed. Arm A failed before Arm B because replaying the old creating body under the current narrowed TEST privileges receives `permission denied for table user_channel_bindings`; therefore it did not prove the old body creates rows, and Arm B did not prove unknown Telegram/MAX rows unchanged or known-binding resolution. All proof transactions use `BEGIN … ROLLBACK`; post-run residue count was `0`. |
| Effective deployed generic root / legacy-contact structure | **PASS** | Read-only catalog inspection: `platform_users` has `0` of the five removed legacy contact columns; primary-phone duplicate-holder count `0`; deployed `app.integrator_upsert_channel_identity` has no `platform_users` insert and does not touch `user_identity` or channel preferences. This is inspection only, not a replacement for failed D25 Arm B. |
| Token-bound code-delivery and provider-proof implementation | **PASS** | Exact TEST checkout targeted suites: integrator `3 files / 14 tests`, webapp `2 files / 15 tests`, all passed. They cover Telegram/MAX self-owned provider proof, token-bound refusal paths, `profile_bind` no-OTP semantics, and bot code interpolation/delivery. |
| Existing-owner TEST login journey after current deployment | **BLOCKED** | From the `14:03:24 MSK` TEST service start through this audit, journal search found `0` webapp and `0` integrator `phone_messenger_bind_*` events. No complete `webapp start → self-owned contact → webapp complete → bot code → confirm/session` evidence exists. No expiring attempt was started because it could not be completed within this audit. |
| Existing-owner authenticated `profile_bind` without OTP and actual-phone parity | **BLOCKED** | No completed post-deploy owner contact exists to select without exposing its value. Thus the required phone-specific proof—one primary `user_contacts` row, one matching channel binding, canonical delivery resolution, and no write-back—is not fabricable. Structural legacy-column removal is proved above, but it is not the person-specific gate. |

## Commands and sanitized measurements

```bash
sudo -n -u deploy git -C /opt/projects/bersoncarebot-test rev-parse HEAD
curl -fsS --max-time 10 -H 'Host: test.bersoncare.ru' http://127.0.0.1:6300/api/health
sudo -n systemctl is-active bersoncarebot-webapp-test.service bersoncarebot-api-test.service bersoncarebot-scheduler-test.service
# → exact SHA above; {"ok":true,"db":"up"}; active / active / active

cd /opt/projects/bersoncarebot-test
RUN_D25_GENERIC_INGRESS_DB=1 \
  D25_GENERIC_INGRESS_PROOF_DB=bersoncarebot_test \
  D25_GENERIC_INGRESS_PROOF_MIGRATOR=bcb_test_migrator \
  D25_PROOF_PRINT=1 \
  node --test deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs
# → 1 passed (Arm C), 1 failed (Arm A privilege denial); Arm B not reached

sudo -n -u deploy pnpm --dir apps/integrator exec vitest --run \
  src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
  src/integrations/telegram/telegramContactProviderProof.unit.test.ts \
  src/integrations/max/maxContactProviderProof.unit.test.ts
# → 3 files / 14 tests passed

sudo -n -u deploy pnpm --dir apps/webapp exec vitest --run \
  src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts \
  src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts
# → 2 files / 15 tests passed
```

The read-only DB check returned: legacy columns `0`; duplicate primary-phone holders `0`; generic-root platform-user insert `false`; generic-root `user_identity` access `false`; generic-root preference access `false`; D25 probe binding residue `0`.

## Precise owner action

On TEST, using the existing owner account and one chosen Telegram or MAX contact, complete within the same 15-minute attempt: start webapp login, open the issued `auth_` link, send the self-owned contact, receive and enter the bot-delivered code, confirm the session; then, while authenticated, run `profile_bind` for that same contact and observe completion without OTP. Do not send the phone, messenger id, token, or code to this audit record. This produces the only missing evidence needed for the phone-specific D15b/6 gate; it does not resolve the separate D25 DB-proof failure.
