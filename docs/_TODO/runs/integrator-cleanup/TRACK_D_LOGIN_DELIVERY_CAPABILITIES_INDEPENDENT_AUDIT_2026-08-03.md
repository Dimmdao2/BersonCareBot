# Track D login-code delivery capabilities — independent audit (2026-08-03)

Candidate: `1611bdeab` (`fix(integrator): close login delivery capabilities`), branch
`wt/trackd-login-delivery`. Authority: `TRACK_D_LOGIN_DELIVERY_CAPABILITIES_AUDIT_BRIEF.md`,
`TRACK_D_LOGIN_DELIVERY_CAPABILITIES_BRIEF.md`, `WORK_ORDER.md` Track D. Mixed test/look pass per
`AGENTS.md` §24.4: policy/route/worker behavior and exact PostgreSQL principals were tested;
capability scope, ACL overlays, callgraph and second-delivery-path were inspected.

## Verdict: PASS

All 9 kill-set items hold. Product not touched, nothing pushed. One process note (journal
registration) below is expected/deferred-to-land per the workstream's own scope, not a defect.

## Kill-set results

**1. Callgraph — no more direct `system_settings` read / ambient incident DML.**
`grep` for `auth_email_enabled|auth_sms_enabled|auth_telegram_enabled|auth_max_enabled|
platform_integration_availability|outgoing_delivery_reclaim_config` across
`apps/integrator/src` and `apps/webapp/src` shows the only integrator hits are the three
capability wrapper files themselves (`authChannelPolicy.ts`, `platformIntegrationAvailability.ts`,
`outgoingDeliveryReclaimSettings.ts`); webapp hits are the admin Settings write path (out of Track
D scope, different DB login/role model, §2/§4 canon). `operatorHealthDrizzle.ts` no longer builds
an `INSERT ... ON CONFLICT` via Drizzle — it calls `app.open_or_touch_operator_incident(...)`
through `runIntegratorSql`. PASS.

**2. Auth channel fail-closed before SMTP/dispatch.**
`isAuthChannelEnabled` (`authChannelPolicy.ts`) returns `false` — never throws — on missing row,
non-`true` value, and on any read error (catch-all). `sendEmailRoute.ts:138` checks it before
`resolveSmtpOutboundConfig`/dispatch. Unit tests (`authChannelPolicy.test.ts`,
`sendEmailRoute.route.test.ts`) cover explicit true/false/missing/malformed/denied → route test
confirms `dispatchOutgoing` is never called when disabled (403, zero adapter calls). PASS.

**3. Platform availability fail-closed, checked at the real call site.**
`isPlatformIntegrationAvailable` throws `PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE` on
missing/malformed (no compiled-in default fallback); persisted `false` returns `false`. Wired at
`di.ts:256` into `createDefaultDispatchPort({ isPlatformIntegrationEnabled })`, checked in
`dispatchPort.ts:372-378` **before** `adapter.send()` — i.e. before provider I/O — for every
channel, not just email (pre-existing chokepoint, unchanged by this diff). Both the persisted-false
and the throw-on-unreadable paths propagate as a `dispatchOutgoing` rejection that
`sendEmailRoute.ts`'s catch turns into 500 `email_failed` without reaching the adapter. PASS.

**4. Reclaim worker sees real values; capability has no other-key/secret reach.**
`app.read_outgoing_delivery_reclaim_config()` is **argless** and hardcodes the single key
`outgoing_delivery_reclaim_config` in its `WHERE` — there is no parameter surface to request any
other key (SMTP or otherwise), stronger than an allowlist. Live DB proof (disposable PostgreSQL,
role `app_operational_delivery_worker`) read back a persisted `{processingTimeoutMinutes: 42,
doneRetentionDays: 7, maxReclaimCount: 3}` correctly. Unit tests cover missing/denied → documented
default (`DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG`). PASS.

**5. Provider incident: capability opens/touches exactly the dedup row, no ambient DML.**
Live DB proof: `app.open_or_touch_operator_incident(...)` called twice with the same `dedup_key`
produced one row with `occurrence_count` 1 → 2 (dedup via the partial unique index), and both the
API-runtime-login role and the delivery-worker role were confirmed to have **zero** direct
`SELECT`/`INSERT`/`UPDATE`/`DELETE` on `public.operator_incidents` — the function is the only path.
`sendEmailRoute.ts`'s `recordProviderFailureSafely` wraps the call and only logs a warning on
failure, matching the "don't fail the outer request over incident bookkeeping" intent. PASS.
*(See "Harness correction" below — an initial harness omission produced a false RETURNING/SELECT
permission failure here; retracted after finding the missing pre-existing `GRANT SELECT ...
public.operator_incidents TO app_owner` at `deploy/postgres/c4-operational-runtime.sql:485`.)*

**6. Disposable PostgreSQL exact schema/roles — EXECUTE matrix, no table/column ACL, idempotent
reapply with scrub.**
Built a minimally-sufficient exact harness (PostgreSQL 16, throwaway `initdb`/`pg_ctl`, same
technique as `apps/integrator/src/infra/scripts/d30DisposablePostgres.ts`): schema `app`, tables
`public.system_settings`/`public.operator_incidents` per current Drizzle schema, and the full role
set (`app_owner`, `app_staff`, `app_patient`, `app_worker`,
`app_operational_{diagnostic,delivery_worker,scheduler,media_worker}`, plus a login role standing
in for `:"integrator_runtime_config_role"`). Applied `9999_integrator_login_delivery_capabilities_
local.sql` verbatim, then the exact new/adjacent GRANT/REVOKE hunks from both overlays **in the
real deploy order** (`integrator-server-runtime-config.sql` before `c4-operational-runtime.sql`,
per `deploy/host/deploy-test-saas.sh:2302` vs `:2350`, documented at line 994 as intentional —
c4 runs last and re-establishes `app_operational_delivery_worker`'s grant). Both overlays' own
embedded `SELECT 1/(...)` self-test assertions (re-homed verbatim, unrelated AND-clauses for
pre-existing functions dropped) passed. Live EXECUTE matrix (see consolidated assertion below) —
all 9 conditions true. Reapply idempotency: injected three unexpected grantees (`app_worker`,
`PUBLIC`, `app_staff`), confirmed the self-test catches it (division by zero), reapplied both
overlays in canonical order, confirmed all three were scrubbed and the legitimate
`app_operational_delivery_worker` grant survived. PASS.

Final consolidated assertion, all 9 conditions `true`: API-runtime login has EXECUTE on
auth-channel/platform-availability/incident-open, does *not* have EXECUTE on reclaim-config, and
has no direct `system_settings` SELECT; delivery-worker has EXECUTE on reclaim-config and
incident-open, does *not* have EXECUTE on auth-channel, and has no direct
`operator_incidents` SELECT/INSERT/UPDATE/DELETE.

**7. OTP stays on the single chokepoint — no second delivery path.**
`sendMail` is called from exactly one production site, `email/deliveryAdapter.ts:110`, which is
the adapter registered into `dispatchPort`'s adapter list in `di.ts`. `sendEmailRoute.ts` only
references `sendMail` in a comment explaining why it *doesn't* call it directly. No new
router/queue/handler was added. PASS.

**8. Fault injection, each restored byte-identically.**
- Revoked `EXECUTE` on `read_integrator_auth_channel_setting` from the runtime-login stand-in →
  real `permission denied for function`; re-granted → back to `{"value": true}`.
- Flipped `auth_email_enabled` persisted value `true→false` → capability faithfully returned the
  new persisted value (no stale/compiled default); flipped back to `true`.
- Granted direct `SELECT` on `public.system_settings` to the runtime-login stand-in → it could
  read the table directly (proves the ACL, not some other mechanism, is what blocks this today);
  revoked → `permission denied for table` again.
- Injected three unexpected function grantees (see kill-set 6) → scrubbed by reapply, `f|f|f`
  residue check.
All four temporary breaks were reverted to their original state; final `SELECT`/ACL state matches
the initial seed exactly. PASS.

**9. Targeted tests, typecheck, lint, raw-SQL/import/queue gates, migration freeze/diff-check.**
- `pnpm --dir apps/integrator test` (phase-level, includes the four new/touched spec files) → 313
  passed, 4 expected-fail, 9 skipped, **0 failed** (56 files).
- `pnpm --dir apps/integrator typecheck` → clean.
- `pnpm --dir apps/integrator lint` (`eslint src && check-queue-port-boundary.mjs`) → clean, `OK`.
- `node scripts/check-no-new-raw-sql.mjs` (root) → `OK`, production debt `0`.
- `node scripts/check-db-chokepoint.mjs` (root) → `OK`.
- `pnpm --dir apps/webapp` (migration lives under `apps/webapp/db/`): `check-no-new-raw-sql.mjs`
  → `OK`; `check-webapp-infra-import-boundary.mjs` (+ `--self-test`) → `OK`.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` → **PASS** (no previously-applied
  migration was edited).
- `git diff --check feat/doctor-ui-rebuild...1611bdeab -- apps/integrator apps/webapp/db
  deploy/postgres` → clean, no whitespace errors.
- Full CI not run (correctly — not a deploy/merge/repo-level checkpoint here).

One gate is **red by design, not by defect**: `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`
fails because `9999_integrator_login_delivery_capabilities_local.sql` has no `_journal.json` entry.
Both the Track D brief ("Использовать временный high migration number, не добавлять его в
journal") and `AGENTS.md` §1 ("Работая в клоне, номер в имени файла помечать временным... 
окончательный присваивает тот, кто сводит в `feat`") document this as the intended state until
land renumbers the file. Not a MUST FIX; flagging so root registers it in `_journal.json` at land
time, alongside the final sequential number.

## Harness correction (process note, not a product finding)

The first harness pass reconstructed only the diff's *added* REVOKE/GRANT lines around
`public.operator_incidents` and omitted a pre-existing, unchanged `GRANT SELECT ON TABLE
public.outgoing_delivery_queue, public.broadcast_audit, public.operator_incidents TO app_owner;`
at `deploy/postgres/c4-operational-runtime.sql:485` — part of the same file's existing
REVOKE(reset)-then-GRANT(rebuild) pattern, a few lines above Track D's own new grants. Without it,
`app.open_or_touch_operator_incident`'s `RETURNING` clause (which needs `SELECT` on the touched
columns per PostgreSQL's own privilege model) hit `permission denied for table
operator_incidents` — a false positive from an incomplete harness, not from the product. Rebuilt
with the missing line included; kill-set 5 result above is from the corrected harness. Recorded
here so a future audit of this file's grants doesn't have to rediscover this.

Similarly, an initial reapply-idempotency check exercised the two overlays in the wrong order
(`c4-operational-runtime.sql` then `integrator-server-runtime-config.sql`) and observed
`app_operational_delivery_worker` losing its `open_or_touch_operator_incident` grant — also a
harness-ordering artifact, not a bug: real deploy always applies `integrator-server-runtime-
config.sql` first and `c4-operational-runtime.sql` last (`deploy/host/deploy-test-saas.sh:2302`
vs `:2350`, documented intentional at line 994). Retested in the correct order — kill-set 6 above
reflects that result.

## Scope discipline

Nothing in `apps/webapp/src` product code, identity semantics, OTP generation/recipient selection,
D30, tariff/CMS/billing, or DEV/TEST/PROD was touched or targeted for a live check (out of this
workstream's scope per `WORK_ORDER.md`). Working tree is clean (`git status` → nothing to commit)
before and after this audit; only a disposable, throwaway PostgreSQL 16 instance under `/tmp` was
used and torn down (`pg_ctl stop` + `rm -rf`). No push performed.

## Root land finalization

После land D30/0328 root переименовал временный файл без изменения SQL-тела в
`0329_integrator_login_delivery_capabilities_local.sql` и добавил journal entry
`idx=327`, `when=1793539230033`. На синхронизированном дереве повторно прошли journal sync,
legacy migration freeze, webapp/integrator typecheck, targeted login-delivery tests, raw-SQL census
(`production debt: 0`), DB/queue chokepoints и `git diff --check`. Упоминания `9999` выше сохранены как
исторически точное описание состояния, которое аудировал независимый агент.
