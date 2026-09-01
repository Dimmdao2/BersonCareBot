# Independent audit — integration secret authenticated-encryption decision packet (#1071)

Date: 2026-09-02. Candidate: `6309d2a7b`, document
`docs/_TODO/runs/INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md`.
Authority: `docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` §12.7 and the active security decisions it cites.
Method: every claim re-measured against this checkout independently of the packet's prose. No product edit,
no DB/host/env access, no tests (no executable product change exists to test — the candidate is a document).

**Verdict: FAIL** — one must-fix (a fail-closed guarantee that the current code contradicts), plus three
accuracy/completeness defects in the census and cutover plan. The measurement core of the packet is otherwise
accurate: 22 of 26 verifiable claims reproduced exactly.

---

## MUST FIX

### A1. §5's "never a fallback to the platform's credential" is false for clinic delivery — the cutover fails open

The packet's fail-closed rule (§5, repeated as drill 3 in §4.4) states that a row whose kid is absent makes the
dependent channel *not configured*: "no send, no delivery attempt, and never a fallback to a different clinic's
or the platform's credential." The integrator does the opposite today, by design:

- `apps/integrator/src/infra/db/clinicDeliveryCredentials.ts:52-91` — the resolver's own contract line is
  "a missing principal, disabled tariff mechanic or **malformed value** returns null; callers decide whether
  platform fallback is allowed", and the body ends in `catch { return null }`. A decrypt/AAD/tag failure is
  exactly a thrown error and is swallowed into `null`.
- `apps/integrator/src/infra/adapters/dispatchPort.ts:103-112` — `clinic_if_configured` degrades to
  `platform_required` when the credential is null; the default request scope is `clinic_preferred`.
- `apps/integrator/src/infra/adapters/dispatchPort.ts:351-366` — only an explicit `clinic_required` throws
  `CLINIC_CHANNEL_NOT_CONFIGURED`; in every other case `adapter.send(intentForChannel)` runs, i.e. the message
  goes out **under the platform bot / platform SMTP / platform SMSC identity**.

Reachable scenario with the packet's own procedure: §4.3 step 3 retires `kid1` after a count query, or a DEV/TEST
database is refreshed (see A2), or one row is tampered/truncated. Result is not "no send" but essential clinic
mail/SMS/Telegram silently sent from the platform sender to that clinic's patients, with no operator signal —
the clinic's branding and sender identity change without anyone being told. The packet also cites
`modules/system-settings/runtimeSettingUnavailable.ts` as "the module that already exists for exactly this"; that
module exists in **`apps/webapp` only**, and the integrator (the actual sender for these channels) has no
equivalent and cannot import it under §5 clean-architecture rules.

Fix direction (owner's call, not mine to schedule): either add an explicit cutover step that teaches the
integrator resolver to distinguish "unavailable" from "not configured" and make the dispatcher refuse the
platform fallback for that case, or delete the fail-closed guarantee from §5 and state the fallback honestly as
an accepted consequence. Both are cheap; silently keeping the current wording is what is not acceptable.

---

## SHOULD FIX

### A2. TEST (and DEV) are rebuilt from a live PROD dump; the packet's per-environment keys make every restored secret undecryptable, and this is nowhere named

`deploy/host/deploy-test-saas.sh:2448-2470` pulls a **fresh `pg_dump` from live prod** and recreates
`bersoncarebot_test` from it; `AGENTS.md` §6 "Пересоздание / обновление dev-базы из prod-дампа" documents the
same flow for DEV. The packet's §4.1 custody table gives DEV, TEST and PROD **different** keyrings. After
cutover, every restored row therefore carries PROD ciphertext under a key TEST/DEV does not hold: all 25 encrypted
settings become unreadable, and per §5 every integration reports "not configured" until the values are re-entered
by hand — including `google_refresh_token` (requires re-running the OAuth consent flow) and `web_push_vapid`
(regenerating it invalidates that environment's push subscriptions). §2 mentions DEV/TEST copies only as a
security *gain*, §6 step 7 sends the change "DEV → TEST" without mentioning the state it will land in, and D4's
availability trade covers only a lost keyring.

The `smtp_outbound` snapshot of §1.3 is unaffected (it is taken from TEST before reset and restored into TEST,
so it stays under the TEST key) — which is exactly why the general case was easy to miss.

### A3. Step 4's trigger fallback fingerprints ciphertext instead of refusing, and silently unroutes the dedicated bot webhook

§3.4/§6.4 change `app.sync_clinic_dedicated_bot_binding()` to prefer `NEW.value_json #>> '{fp}'` and to *fall
back to hashing `{value}`* while legacy plaintext rows exist. The fingerprint is the literal URL path segment of
the dedicated webhook (`apps/integrator/src/integrations/telegram/webhook.ts:445-451`,
`max/webhook.ts:311-317`, resolved via `app.resolve_clinic_dedicated_bot_organization`). Any row that is
ciphertext but carries no `fp` — a raw-SQL write (this table already has such writers, see A4), a restored copy,
a partially-run backfill — makes the trigger hash the ciphertext and write a fingerprint that matches no
registered webhook. Inbound clinic bot traffic then resolves to no organization, with no error anywhere. One
line fixes it: the fallback must refuse (or leave the binding untouched) when the value already looks like a
`bcbset.v1.` envelope, instead of hashing it.

### A4. Census gaps — writers, value_json consumers and one script the packet does not list

§1.3 names two writer classes outside the chokepoint, §1.4 names two reading processes, §1.5 says "four SQL
surfaces read inside `value`". Also present in the tree:

- `deploy/postgres/test-settings-override.sql:73-82` writes `smtp_outbound` (`{"value":null}`) and
  `deploy/postgres/prod-to-target-cutover-finish.sql:77-88` inserts `vk_id_client_secret` /
  `vk_id_application_id` as `{"value":""}` — raw writers on secret-classified keys. Neither writes real
  credential material, so neither breaks the design, but both are outside the "one chokepoint plus two" census
  and both are places where a future plaintext write would silently pass the dual-read.
- `app.patient_reminder_materialization_fingerprint` and
  `app.specialist_task_reminder_materialization_fingerprint` (`deploy/postgres/generated/prod-to-target/schema-pre.sql`)
  fold `system_settings.value_json` of `web_push_vapid` / `smtp_outbound` into an md5 change-detector; a mismatch
  makes `app.revalidate_patient_reminder_delivery_materialization` return false and the in-flight reminder is not
  sent. A rewrap (§4.3 step 2) rewrites those rows and invalidates every in-flight email/web-push reminder
  fingerprint. Bounded and pre-existing (`updated_at` is already part of the hash, so an ordinary re-save does
  the same), but the rewrap runbook should say so.
- `apps/webapp/scripts/qa-push-direct.mjs:21-31` reads `value_json->'value'->>'privateKey'` by raw SQL on DEV;
  it is a third consumer of a secret value and stops working at step 5.

### A5. §1.1 is wrong about what the `secret_envelope` label does, and contradicts §1.8

§1.1 says the label "drives UI redaction and client serialization". `valueContract` is read **nowhere** outside
`registry.ts` (grep over `apps/webapp/src`); redaction is driven by the hand-maintained sets in
`modules/system-settings/auditRedaction.ts` and by explicit key arrays in `app/api/admin/settings/route.ts`,
and client serialization by the separate `clientSerialization` field (consumed in
`infra/repos/pgAppRuntimeSettings.ts:55-57`). The packet's own §1.8 says the lists are hand-maintained, so the
document contradicts itself. This matters only as a premise for §6 step 6 ("derive both redaction sets from the
registry"), which stays a correct fix — but an implementer reading §1.1 would think part of it already exists.

---

## Verified accurate (independently reproduced)

- 31 keys carry `valueContract: 'secret_envelope'` (32 occurrences in `registry.ts`, one is the type union);
  24 platform-scoped / 7 `per_org`; the 7 org-scoped names are exactly as listed.
- The 6 public identifiers and the 19/6 scalar/composite split are correct; 25 secret-bearing keys.
- Stored shape and `systemSettingValueEnvelopeSchema` (`apps/integrator/src/infra/db/publicSystemSettings.ts:31-36`)
  — and it is `.passthrough()`, so the proposed `fp` sibling parses (a `deliveryReadiness` sibling already exists
  in clinic delivery rows, and there is no CHECK constraint on `value_json`).
- Table/indexes, including the `org_custom_domain_hostname` expression unique index (non-secret key).
- Single application write chokepoint: `valueForWrite()` at `modules/system-settings/service.ts:196`, used by all
  five write entry points; the Google-Calendar callback writes `google_refresh_token` through it
  (`app/api/admin/google-calendar/callback/route.ts:87-94`). The six migration INSERT sites seed no secret.
- `deploy/host/deploy-test-saas.sh:279-315` snapshot/restore round-trips `value_json` opaquely, and
  `validate-smtp-outbound-snapshot.mjs` only requires `password` to be a non-empty string — the gate keeps
  passing with an envelope, exactly as claimed (and proves less than it seems to, also as claimed).
- All four in-SQL couplings of §1.5, verbatim: the bot-binding trigger's
  `encode(app_ext.digest(NEW.value_json #>> '{value}','sha256'),'hex')`; `app.get_web_push_vapid_public_key()`;
  the OAuth availability derivation (`20260824T154700_…sql:55-88`, `jsonb_typeof(...)='string' AND btrim(...)<>''`)
  which would indeed report every provider disabled if `value` became an object; and the opaque integrator SMTP
  read. Related derivations not listed but compatible with the design: `is_max_bot_configured`,
  `is_sms_provider_configured`, `is_smtp_outbound_configured`, `read_curated_system_health_pre_0196`.
- Grants (`privileges.bcb_webapp_dev.sql:18425-18447`): `app_platform_settings`/`app_staff` full,
  `app_worker` SELECT, `saas_system_health_owner` SELECT, exactly 14 `app_seam_*_owner` column-scoped SELECTs.
  RLS `rev10_system_settings_select_191` narrows rows exactly as described, incl. `app_worker`'s four named keys.
- Redaction census: `SECRET_VALUE_KEYS` = 19, `PASSWORD_BEARING_KEYS` = 3, applied to both `old_` and
  `new_value_json` (`pgSystemSettings.ts:401-402,607`); the uncovered nine are exactly the three secret-bearing
  keys named plus the six public identifiers. The §1.8 gap is real.
- `staff-security/crypto.ts`: AES-256-GCM, 12-byte IV, 16-byte tag, base64url parts,
  `bsc-totp.v1.<kid>.<iv>.<tag>.<ct>`, AAD `prefix:kid` (row-unbound), env keyring with retained read keys,
  lazy validation — and the 2026-07-27 walkthrough 500 it caused (`…global-admin.md:232-240`). It is the only
  symmetric-encryption implementation in `apps/`, `packages/`, `tools/`, `deploy/`; no `pgp_sym_encrypt` anywhere.
- Integrator has no keyring today (`apps/integrator/src/config/env.ts`) and no table SELECT
  (`deploy/postgres/integrator-server-runtime-config.sql:124`). `media-worker`'s allowlist
  (`app.read_media_worker_runtime_setting`) contains no secret key — it needs no key, as claimed.
- **No PostgreSQL-side decryption is required** by the design: the only SQL that transforms secret *content* is
  the sha256 fingerprint (covered by `fp`) and presence/non-empty derivations (survive the string-in-place rule).
  `app.password_login_read_altcha_secret_impl` returns the value to the app; the HMAC is computed app-side.
- **No unexpected web-push invalidation**: `webPushVapidRuntime.ts` never regenerates a key pair — a missing or
  unreadable value yields `null` and the channel is skipped.
- **Inbound webhook auth stays fail-closed**: an empty/unreadable webhook secret makes
  `isWebhookSecretValid` return false and the route rejects (`telegram/webhook.ts:388-395`, `max/webhook.ts:172`).
- Authority quotes: punchlist §12.7 (lines 770-772) verbatim; `IS-I0-05`, `IS-I0-07`/decision 14, `IS-I2-10`/
  decision 12, `IS-I4-02`, `IS-I4-07`, `IS-I4-08`, `IS-I4-09` all say what the packet attributes to them.

## Not done in this pass

- No product, migration, env, DB or host change; nothing but this artifact was written.
- No tests and no full CI: the candidate adds no executable behavior, so neither would carry signal
  (`AGENTS.md` §10a).
- A1–A5 are reported, not fixed. Whether A1 is closed by code or by rewording §5 is an owner decision;
  A2's operational cost may also be a decision (single shared key across environments) rather than a defect.
