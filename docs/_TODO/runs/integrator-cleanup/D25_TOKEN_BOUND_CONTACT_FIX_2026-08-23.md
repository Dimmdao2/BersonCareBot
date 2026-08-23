# D25 token-bound messenger contact — implementation evidence (23.08.2026)

Candidate SHA: `06165b670afa7f3c47207d98d83523eb9433b345`.

## Delivered

- `auth_<token>` is signed to webapp and atomically claims only the existing
  `phone_messenger_bind_secrets` attempt for the exact Telegram/MAX external id. The claim has no
  canonical person/contact/binding/preference/merge write.
- A provider-proven contact has no token in generic bot state. It resolves only a live exact claim,
  then calls the existing webapp `completePhoneMessengerBindFromIntegrator` →
  `applyMessengerContactPreOtp` canonical door.
- The active Telegram/MAX JSON no longer calls `user.phone.link` or requests a contact in generic
  recovery. Unknown/unclaimed starts, contacts, menu and booking recovery direct the person back to
  the webapp flow.
- Added the missing `BCB-MIGRATION-SCHEMA-CREATE: app` marker to
  `20260823T093000_channel_identity_root_becomes_lookup_only.sql` in parser order.

## Migration privilege analysis

`20260823T093000_channel_identity_root_becomes_lookup_only.sql` changes the existing
`app.integrator_upsert_channel_identity(text,text,text)` function. Its owner remains
`app_seam_identity_lookup_owner`; no runtime role, body privilege or declaration surface changes.
The added schema-create marker temporarily permits only the existing `CREATE OR REPLACE` statement;
the migration contains no `GRANT`/`REVOKE`.

`20260823T110000_phone_messenger_bind_claims_are_token_bound.sql` adds
`claimed_external_id`, `claimed_at`, and the matching live-claim unique index on
`public.phone_messenger_bind_secrets`. It creates
`app.phone_messenger_bind_claim(text,text,text)` and
`app.phone_messenger_bind_claimed_secret(text,text,text)`. Table/index DDL runs as
`app_object_owner`; functions run as `app_seam_phone_binding_owner`; the only runtime execute role
is `app_pre_session` through declared webapp port capabilities. The claim body needs `SELECT` and
`UPDATE` on the attempt table; the lookup body needs `SELECT`. `declaration.ts` adds both exact
function/capability declarations and those relation surfaces; generated DEV/TEST privilege artifacts
were regenerated. No migration grants or revokes privileges.

## Commands and results

```text
pnpm --dir apps/webapp typecheck                                      PASS
pnpm --dir apps/integrator typecheck                                  PASS
pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/executeActionHomeMiniAppRemoval.unit.test.ts
                                                                         PASS (1 file, 4 tests)
pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts --project=unit
                                                                         PASS (3 files, 20 tests)
pnpm --dir apps/integrator lint                                       PASS
pnpm --dir apps/webapp exec eslint <changed webapp paths>             PASS
node deploy/postgres/privileges/generate-cli.mjs --all --check        PASS (all four artifacts byte-identical)
node scripts/check-migration-privileges.mjs                           PASS (60 migrations)
bash apps/webapp/scripts/check-drizzle-migration-order.sh             PASS
node scripts/check-c4-migration-owned-function-bodies.mjs             PASS
node scripts/check-no-new-raw-sql.mjs                                 PASS (production debt 0)
RUN_D25_GENERIC_INGRESS_DB=1 node --test deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs
                                                                         PASS (2 named-DEV rollback-only arms)
```

The named-DEV proof now materialises both D25 migrations under their parsed statement owners and
rolls back. `bash deploy/host/migrate-dev.sh --preflight` was intentionally not treated as evidence:
from this isolated worktree it stops at its canonical `.env` path guard before touching the database.

## NOT DONE

- No deploy, push, TEST/PROD access, real bot token read, outbound traffic, or full CI.
- The owner checklist is left open for the lead to accept this candidate and land it.
