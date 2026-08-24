# Track D final live audit — identity/contact path (D15b/6 + D25)

## Authority

Read `AGENTS.md` sections 1, 1a, 1b, 5, 9, 10a, 10b, and 24, then the full relevant owner decision and
the canonical phone-messenger runbook.

Источник оракула: `/home/dev/dev-projects/BersonCareBot/docs/OWNER_DECISIONS.md` — «Живой gate D25 проверяет полный».

Required owner behavior: registration/login starts in webapp; the bot proves ownership of a self-owned messenger
contact and delivers the code, but a generic bot event never creates an account, binds a phone, or decides merge.
General Therapysto bot supports phone binding and selected notifications; only broadcasts are branded-only.

Exact deployed TEST source is `3745ae24c9de62afc85f6aaf602bfecb3ada5f69`, public old address remains
`https://test.bersoncare.ru`. Relevant checklist authority:

- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — D15b/6 and D25;
- `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`;
- `deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs`.

## Required audit

1. Prove TEST is on the exact SHA and health is DB-up.
2. Run the existing D25 generic-ingress DB proof against named TEST, fully rollback-only, using the documented
   TEST database/migrator overrides. It must prove the old body would create rows, while the effective candidate
   leaves all four identity/contact families unchanged for unknown Telegram and MAX ids and still resolves a known
   binding.
3. Determine whether a complete existing-owner TEST journey has occurred after this deployment:
   `webapp start → token-bound Telegram/MAX self-owned contact proof → webapp complete → bot-delivered code →
   webapp confirm/session`, plus authenticated `profile_bind` without OTP. Email OTP or a DB-only shortcut does
   not count.
4. For the actual phone used, prove exactly one canonical primary phone in `user_contacts`, one matching channel
   binding, no write back to removed legacy contact columns, and delivery resolution through the canonical path.
   Never print the phone, external messenger id, OTP, token, or secret.
5. If the positive journey needs a physical owner action, do not fabricate a provider proof and do not weaken the
   gate. Exhaust existing post-deploy evidence first, then return one precise non-secret owner action/blocker. Do
   not start a 15-minute attempt that will expire after your turn unless you can complete it within the same turn.

## Boundaries

- TEST/named DB only; PROD forbidden; no disposable database.
- Existing owner/test account only; never create a synthetic user.
- No secret/env value reads or output. Do not call real providers except the explicitly allowlisted existing-owner
  TEST path, and never broadcast.
- DB proof must be transaction + rollback. Any temporary application record must be cleaned through its normal
  port and verified absent.
- No product fixes, merge, push, deploy, config changes, or full CI.
- Write and commit a concise audit artifact under `docs/_TODO/runs/integrator-cleanup/` with per-gate
  `PASS|FAIL|BLOCKED`, exact commands and sanitized measured results.

