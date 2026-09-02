# Integration secret authenticated-encryption — decision packet

Date: 2026-09-02. Branch `wt/integration-secret-encryption-decision-20260902`. Read-only research pass:
no product code, migration, env, DB, host or active plan was changed.

**Revision note.** This is a correction pass over the first draft, made against
`docs/_TODO/runs/AUDIT_INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` (verdict: FAIL — A1 must-fix,
A2–A5 should-fix). That audit artifact is historical and is not rewritten; every A1–A5 finding is folded into
this document in place — §5/§6 step 5 (A1), §4.1a/§6 step 6 (A2), §3.4/§6 step 4 (A3), §1.3/§1.4/§1.5 (A4),
§1.1 (A5) — so this text, not the audit, is the current source of truth for the design.

**Authority.** `docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` §12.7 — «Защитить credentials клиники настоящим
authenticated encryption, а не текущим `valueContract='secret_envelope'`, который классифицирует и редактирует
JSON, но не шифрует его. До реализации утвердить key custody/rotation/recovery и threat model из `CRYPTO-01`
C0/C1/C4.» Supporting: `docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md` `IS-I0-05`, `IS-I2-10`, `IS-I4-02`,
`IS-I4-03`, `IS-I4-07`, `IS-I4-09`; archived source
`docs/archive/2026-08-infrastructure-security-consolidation/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` C0/C1/C4.

**Scope.** Integration/credential settings stored in `public.system_settings` only. Not patient media, not disk
or S3 encryption, not certified Russian cryptography, not host infrastructure — those are named as dependencies
in §8 and stay with their owning plans.

---

## 1. Measured current state

Every statement below was read out of this checkout, not from prior prose.

### 1.1 What `secret_envelope` actually is

`valueContract: 'secret_envelope'` is a **classification label in one registry**, nothing else.
`apps/webapp/src/modules/system-settings/registry.ts` carries it on **31 keys**. `valueContract` is read
**nowhere** outside `registry.ts` (verified by grep over `apps/webapp/src`); it drives neither redaction nor
client serialization today. Redaction runs off the hand-maintained sets in
`modules/system-settings/auditRedaction.ts` (§1.8) and the explicit key arrays in
`app/api/admin/settings/route.ts`; client serialization is the separate `clientSerialization` field on the same
registry entry (`registry.ts:40`, consumed in `infra/repos/pgAppRuntimeSettings.ts:55-57`). §6 step 7 below
fixes this: derive redaction from the registry and leave serialization as its own explicit field — a correction
to the current mislabel-as-mechanism, not new machinery. The stored shape is `{"value": <plaintext>}` — literally the wrapper parsed by
`systemSettingValueEnvelopeSchema` in `apps/integrator/src/infra/db/publicSystemSettings.ts:29-35`. There is no
ciphertext, no key id, no authentication tag. The module's own comment already says so:
`apps/webapp/src/modules/system-settings/auditRedaction.ts:12-13` — «values are stored there as given (see the
SMTP password today). Encrypting settings at rest is a separate, owner-gated decision.»

**24 keys are platform-scoped, 7 are organization-scoped.** Organization-scoped (clinic-owned credentials, the
subject of §12.7): `clinic_smtp_outbound`, `clinic_smsc_api_key`, `clinic_telegram_bot_token`,
`clinic_max_bot_api_key`, `clinic_vk_community_access_token`, `booking_payment_providers`, `google_refresh_token`.

**Not all 31 hold a secret.** Six are public OAuth identifiers mislabeled `secret_envelope`:
`google_client_id`, `yandex_oauth_client_id`, `vk_id_application_id`, `apple_oauth_client_id`,
`apple_oauth_team_id`, `apple_oauth_key_id`. The remaining **25** hold real credential material in two shapes:
**19 scalar secrets**, where the value *is* the credential, and **6 composite settings**, where the secret is a
field inside an object — `smtp_outbound` / `clinic_smtp_outbound` / `operator_health_imap` (`value.password`),
`web_push_vapid` (`value.privateKey`), `booking_payment_providers` / `saas_billing_payment_provider`
(per-provider secret keys). The real encryption target is therefore **25 keys, 19 scalar + 6 composite**.

### 1.2 DB representation

`public.system_settings(key text, scope text, organization_id uuid, value_json jsonb, updated_at, updated_by)`
— `apps/webapp/db/schema/schema.ts:3629`. Two partial unique indexes (global rows keyed by `key,scope` where
`organization_id IS NULL`; org rows keyed by `key,scope,organization_id`). One expression unique index over
`lower(btrim(value_json ->> 'value'))`, restricted to `key = 'org_custom_domain_hostname'` — a non-secret key,
so it does not constrain this design.

Ledger: `public.system_settings_audit(key, scope, old_value_json, new_value_json, changed_by, changed_at,
source, organization_id)`, `FORCE ROW LEVEL SECURITY`.

### 1.3 Writers

One application chokepoint: `createSystemSettingsService()` in
`apps/webapp/src/modules/system-settings/service.ts` — `updateSetting`, `updateSettingIfUnchanged`,
`persistSettingsBatch`, `persistAdminModesBatch`, `clearSetting`. Every write passes through
`valueForWrite()` (`service.ts:196`), which already does per-key secret handling (retain-existing-password for
`operator_health_imap`, `smtp_outbound`, `clinic_smtp_outbound`, `web_push_vapid`,
`booking_payment_providers`). **`valueForWrite()` is the natural and only place encryption belongs** — this is
an existing chokepoint to parameterize, not a new one to build.

Writers outside the chokepoint, all of which must be accounted for at cutover:
- six `INSERT INTO public.system_settings` sites in `apps/webapp/db/drizzle-migrations/*.sql` (seeds; none seed a
  secret value);
- `deploy/host/deploy-test-saas.sh:279-315` snapshots `smtp_outbound.value_json` to a `0600` temp file and
  re-inserts it verbatim across a full TEST reset. `value_json` round-trips opaquely, so ciphertext survives.
  The snapshot is gated by `deploy/host/validate-smtp-outbound-snapshot.mjs`, which checks `host`, `port`,
  `secure`, `user`, `from` and that `password` is a non-empty string. Under the composite-shape rule of §3.4
  every one of those stays plaintext and `password` becomes a non-empty envelope string, so the gate keeps
  passing unchanged — with the caveat that it then proves only that a password field is present, not that it is
  usable. **This is also the pattern §4.1a generalizes to close A2** — it already proves that a same-environment
  snapshot/restore round-trips an opaque `value_json` across a full reset without ever touching the key;
- `deploy/postgres/test-settings-override.sql:73-82` writes `smtp_outbound` as `{"value":null}` and
  `deploy/postgres/prod-to-target-cutover-finish.sql:77-88` inserts `vk_id_client_secret` /
  `vk_id_application_id` as `{"value":""}`. Both are raw, outside the chokepoint census above; neither writes
  real credential material today, so neither breaks the design, but both are exactly where a future plaintext
  write would silently bypass encryption and pass the dual-read step unnoticed — worth a one-line comment at
  each site pointing at `valueForWrite()` when this cutover ships.

### 1.4 Readers

Two processes read secret values: **webapp** and **integrator**. `apps/media-worker` reads none.

- webapp: `apps/webapp/src/infra/repos/pgSystemSettings.ts` plus SECURITY DEFINER accessors
  (`app.read_webapp_preauth_provider_setting`, `app.read_media_worker_runtime_setting`, …). Consumers include
  `modules/payments/service.ts`, `modules/system-settings/webPushVapidRuntime.ts`, `integrationRuntime.ts`,
  `app/api/admin/settings/route.ts`, `app/api/platform/settings/route.ts`.
- integrator: `apps/integrator/src/infra/db/publicSystemSettings.ts` and `clinicDeliveryCredentials.ts`, always
  through DB-owned fixed-allowlist capabilities — the integrator login has **no** table SELECT
  (`deploy/postgres/integrator-server-runtime-config.sql:124`).
- a third, out-of-band consumer: `apps/webapp/scripts/qa-push-direct.mjs:21-31` reads
  `value_json->'value'->>'privateKey'` off `web_push_vapid` by raw SQL on DEV, bypassing every port above. It
  stops working the moment step 6 (§6) turns writes on — a DEV-only QA script, not a production reader, but it
  needs the same fix (read through the shared `packages/secret-envelope` primitive, or be retired) in the same
  change or it silently starts failing.

Caching: `apps/webapp/src/modules/system-settings/configAdapter.ts` — in-process `Map`, 60 s TTL, invalidated
per key on write (`invalidateConfigKey`). It caches process-local values only; decrypt-on-read then cache
plaintext in that map does not widen exposure beyond the process, which §2 already concedes.

### 1.5 In-SQL consumers of the plaintext value — the real coupling

This is where a naive "encrypt the whole envelope" breaks the product. Five SQL surfaces read *inside* `value`
or fold the row into a hash:

1. **`app.sync_clinic_dedicated_bot_binding()`** — an `AFTER INSERT OR UPDATE OR DELETE` trigger on
   `system_settings` (`deploy/postgres/generated/prod-to-target/schema-pre.sql:23045`). For
   `clinic_telegram_bot_token` / `clinic_max_bot_api_key` it computes
   `encode(app_ext.digest(NEW.value_json #>> '{value}', 'sha256'),'hex')` into
   `clinic_dedicated_bot_bindings.credential_fingerprint`. That fingerprint is the path segment of the
   dedicated webhook URL registered with Telegram/MAX and is how an inbound event resolves its organization
   (`app.resolve_clinic_dedicated_bot_organization`, `apps/integrator/src/infra/db/clinicDedicatedBotBindings.ts`).
   Encrypting `value` in place would fingerprint the ciphertext — which is non-deterministic per write, so the
   binding would break on every save and every already-registered webhook would become unrouteable.
2. **`app.get_web_push_vapid_public_key()`** (`deploy/postgres/patient-web-push-vapid-public-key-accessor.sql:79`)
   reads `value_json #>> '{value,publicKey}'` for `app_patient`. The public half must stay readable in SQL.
3. **`read_public_runtime_setting`** derives `oauth_google_enabled` / `oauth_apple_enabled` / `oauth_vk_enabled`
   from `jsonb_typeof(value_json -> 'value') = 'string' AND btrim(value_json ->> 'value') <> ''` over the client
   id/secret keys (`apps/webapp/db/drizzle-migrations/20260824T154700_derive_public_oauth_availability_at_read.sql:60-84`).
   Replacing the string `value` with an object would silently report every OAuth provider as disabled.
4. `app.read_integrator_smtp_outbound_setting()` returns the whole envelope — opaque, unaffected.
5. **`app.patient_reminder_materialization_fingerprint()` and
   `app.specialist_task_reminder_materialization_fingerprint()`** (`deploy/postgres/generated/prod-to-target/schema-pre.sql:10180,22630`)
   fold `web_push_vapid` / `smtp_outbound`'s `value_json` into an md5 change-detector that gates
   `app.revalidate_patient_reminder_delivery_materialization()`: a mismatch means the in-flight reminder is not
   (re-)sent. The rewrap job (§6 step 7 / §4.3 step 2) rewrites those rows and therefore changes this hash for
   every row it touches — bounded and pre-existing (`updated_at` is already part of the hash, so an ordinary
   admin re-save has the same effect today), but the rewrap runbook must say so, since it invalidates every
   in-flight email/web-push reminder fingerprint at once rather than one row at a time.

### 1.6 Deploy and runtime identities

Grants on `public.system_settings` (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:18425-18447`):
`app_platform_settings` (SELECT/INSERT/UPDATE/DELETE), `app_staff` (same), `app_worker` (SELECT),
`saas_system_health_owner` (SELECT), and 14 `app_seam_*_owner` definer owners (SELECT of
`key,organization_id,scope,value_json`). RLS policy `rev10_system_settings_select_191` narrows rows:
`app_staff` sees only `organization_id = app.current_org_id()` plus global `scope='doctor'` rows;
`app_platform_settings` sees only global rows; `app_worker` sees four named global keys.

**So the tenant wall already holds**: a doctor's principal cannot read another clinic's credentials, and cannot
read global platform secrets at all. What it does *not* stop is a principal reading credentials of its **own**
org in plaintext, a superuser/owner/migrator `psql` session, and anything holding a copy of the data.

Backups: `deploy/postgres/postgres-backup.sh` streams `pg_dump` through `age` to `<label>_<db>_<ts>.dump.age`
with a public recipients file on the host and the private key held separately; the script never holds that
private key. **Published backup artifacts are therefore already not plaintext-readable.** What is plaintext
today is the live cluster, any operator session, and the DEV/TEST databases and any copy taken from them.

### 1.7 Existing crypto primitives in this repository

`apps/webapp/src/modules/staff-security/crypto.ts` already implements exactly the primitive §12.7 asks for, in
production use for staff TOTP secrets and recovery/login challenge hashes:

- AES-256-GCM via `node:crypto` (`createCipheriv`/`createDecipheriv`, `authTagLength: 16`, random 12-byte IV);
- a versioned compact envelope string `bsc-totp.v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts);
- AAD set to `${ENVELOPE_PREFIX}:${keyId}`;
- a keyring from `STAFF_SECURITY_KEYRING_JSON` = `{activeKeyId, keys: {<kid>: <base64 32-byte>}}`, with the
  active key used for writes and retained keys used for reads — the rotation-without-mass-invalidation shape
  `IS-I4-08` says to reuse rather than reinvent;
- injected as a typed port (`StaffSecurityCryptoPort`) through `buildAppDeps.ts:670`.

Two facts that matter for reuse: its AAD binds only prefix + key id, **not** the row it belongs to; and it lives
in `apps/webapp`, which the integrator cannot import. There is **no other** symmetric-encryption implementation
anywhere in `apps/`, `packages/`, `tools/` or `deploy/` — every other `node:crypto` use is HMAC/hash/UUID.

### 1.8 Audit redaction gap (measured, orthogonal to encryption)

`redactSettingValueForAudit` (`auditRedaction.ts`) is a hand-maintained denylist of 19 scalar-secret keys plus 3
password-bearing keys = 22, applied on every ledger write (`pgSystemSettings.ts:401,402,607`). Comparing it to
the registry: **3 keys carrying live secret material are in `secret_envelope` but in neither redaction set** —
`web_push_vapid` (contains `privateKey`), `booking_payment_providers` and `saas_billing_payment_provider`
(contain provider secret keys). Their full plaintext value reaches `system_settings_audit.new_value_json`, which
is durable and read back by the audit UI. The other six uncovered keys are the public identifiers from §1.1 and
are not a finding.

This is a defect in the current product independent of encryption, caused by the list being hand-maintained
instead of derived from the registry. It belongs in the same change (§6, step 7).

**CLOSED 2026-09-02 (`#1071`), independent of the encryption cutover below.** `SYSTEM_SETTING_REGISTRY` now
carries a typed `secretAudit` policy per key (`registry.ts`) instead of the two hand-maintained sets;
`redactSettingValueForAudit` (`auditRedaction.ts`) derives from it and is the single function both
`pgSystemSettings.ts`'s ledger writes and `admin/settings/route.ts`'s audit log line call (the route's
duplicate `auditValueForLog`/`redactWebPushVapidForAudit` were deleted). `web_push_vapid.privateKey`,
`booking_payment_providers` and `saas_billing_payment_provider` provider secrets are now redacted in both;
an unrecognized/malformed secret shape fails closed to `[REDACTED]` rather than passing through. A registry
census test (`auditRedaction.unit.test.ts`) pins the exact classification of all 31 `secret_envelope` keys
(19 `whole_value`, 4 `object_field`, 2 `domain_redactor`, 6 `none` — the public identifiers of §1.1, left
`secret_envelope`-labeled and unclassified as secret rather than relabeled, per the owner-gated scope split
below). This closes the redaction gap only; the envelope is still plaintext at rest until §6 ships.

---

## 2. Adversaries covered and not covered

**Covered by this design**

| Adversary | Outcome after the change |
| --- | --- |
| DB dump / restored copy without the keyring | Selected fields are AES-256-GCM ciphertext; unreadable. The primary gain. |
| Any DB principal with `SELECT` on `system_settings` — `app_staff` (own-org rows), `app_platform_settings`, `app_worker`, 14 seam owners, `saas_system_health_owner` | Reads ciphertext, not credentials. Removes the "who can read the settings table owns the bot" property recorded in `IS-I4-09`. |
| Superuser / table owner / migrator `psql` session, read-only SQL injection, an over-broad future grant | Same — the value is not in the row. |
| DEV/TEST database copies and developer access to them | Ciphertext under a different (DEV/TEST) key; a leaked dev copy no longer carries usable credentials. **This is also why a plain PROD dump restore into DEV/TEST cannot decrypt on arrival — see §4.1a for the required environment-local snapshot/restore step, not a new gap this design creates but a direct and necessary consequence of it.** |
| Settings audit ledger reader | Already partly redacted; §6 step 7 closes the 3 remaining keys. |

**Not covered — stated plainly, because a control that claims these is a decoration**

1. **The application process itself.** webapp and integrator hold the key and the plaintext by construction.
   Code execution in either, a memory dump, or reading `/proc/<pid>/environ` of that user defeats this entirely.
2. **Root on the host.** Root reads the env/credential file and process memory. `LoadCredential` (`IS-I4-07`)
   narrows *which* service sees *which* secret; it does not exclude root.
3. **A compromised deploy pipeline**, which can ship code that exfiltrates plaintext.
4. **A legitimate global admin using the Settings UI.** That is authorization, not cryptography.
5. **Provider-side compromise** (Telegram, SMSC, the acquirer).
6. **Lost disk / snapshot theft** — that is LUKS2 root, `IS-I0-03` / decision 9, a different layer.
7. **The backup operator.** Already covered by `age` in `postgres-backup.sh`, not by this work. This change
   adds essentially nothing there and must not be sold as if it did.

Net honest statement: **this converts "anyone who can read one table or one copy of the database owns every
integration" into "only the two running application processes and the key holder do".** That is a real and
proportionate reduction of blast radius. It is not protection against a compromised app or a compromised host.

---

## 3. Recommended envelope and key shape

### 3.1 One primitive, two callers

Extract the AES-256-GCM keyring core of `apps/webapp/src/modules/staff-security/crypto.ts` into a shared package
(`packages/secret-envelope`, alongside the existing `@bersoncare/db-principal`), parameterized by envelope
prefix and AAD builder. `staff-security` becomes its first caller with its **current prefix and AAD unchanged**,
so existing TOTP/recovery rows keep decrypting; settings become the second caller. The integrator imports the
package directly. One implementation, two callers — not a second cipher. No new cipher code is written.

### 3.2 Envelope

Compact string, same grammar as the proven one:

```
bcbset.v1.<kid>.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
```

`v1` = format version, `<kid>` = key id (matches `/^[a-zA-Z0-9_-]{1,48}$/`), 12-byte random IV per write,
16-byte GCM tag. Both version and key id are readable without any key — which is what makes the rewrap proof in
§4 a plain SQL count.

### 3.3 AAD — domain binding

```
bcbset.v1|<key>|<scope>|<organization_id or "-">|<field-path>
```

`field-path` is `value` for scalar secrets, or `value.password` / `value.privateKey` /
`value.providers.<id>.secretKey` for composite ones. Consequence: an envelope lifted from clinic A's
`clinic_smsc_api_key` and pasted into clinic B's row, or into a different key or a different field of the same
row, **fails to decrypt**. This is the binding the existing staff-security AAD lacks (it binds only prefix+kid),
and it is what `CRYPTO-01` C1 means by "domain-bound additional authenticated data".

### 3.4 Placement — in-place, string-typed, never changing the row shape

- **Scalar-secret keys** (19; the value *is* the credential): `value` becomes the envelope string. Because it
  stays a JSON string, the OAuth availability derivation of §1.5.3 keeps working unchanged and continues to mean
  "configured".
- **Composite keys** (6: `smtp_outbound`, `clinic_smtp_outbound`, `operator_health_imap`, `web_push_vapid`,
  `booking_payment_providers`, `saas_billing_payment_provider`): the object stays, non-secret fields
  (`host`, `port`, `user`, `publicKey`, provider ids) stay plaintext, and **only the secret field** is replaced
  by an envelope string. `app.get_web_push_vapid_public_key()` keeps working with no SQL change, and the admin
  UI keeps rendering host/port/user.
- **Public identifiers** (the six from §1.1) are **not** encrypted. Their `secret_envelope` label should be
  corrected in the registry in the same change — that is a mislabel, not a secret.
- One sibling field is added for the bot-binding coupling: `value_json.fp` = `sha256(plaintext)` hex for
  `clinic_telegram_bot_token` / `clinic_max_bot_api_key`, computed application-side at write time. The trigger
  of §1.5.1 (`app.sync_clinic_dedicated_bot_binding()`) is changed to: (a) prefer `NEW.value_json #>> '{fp}'`
  when present; (b) when absent, look at `NEW.value_json #>> '{value}'` — if that string matches the envelope
  prefix `bcbset.v1.`, **refuse and leave the existing binding untouched** rather than fingerprinting it (a
  ciphertext with no `fp` is a raw write, a partially-run backfill, or a restored copy — never a value the
  trigger should hash); (c) only when `{value}` does **not** look like an envelope — true legacy plaintext — fall
  back to `encode(app_ext.digest(NEW.value_json #>> '{value}', 'sha256'), 'hex')` as today. This closes the gap
  the packet's first draft left open: hashing ciphertext produces a fingerprint that matches no registered
  webhook and silently unroutes inbound clinic bot traffic with no error anywhere. **The fingerprint definition
  itself does not change**, so no webhook re-registration with Telegram or MAX is needed. Publishing `fp` in the
  row leaks nothing: it is already the public path segment of the webhook URL, and SHA-256 of a bot token is
  preimage-resistant.

### 3.5 KEK / DEK

Keyring `SETTINGS_KEYRING_JSON` = `{activeKeyId, keys: {<kid>: <base64 32-byte key>}}` — the same typed format
as `STAFF_SECURITY_KEYRING_JSON`, deliberately a separate keyring so that settings custody and staff-factor
custody rotate independently.

**Recommendation: one level — encrypt directly under the KEK, no per-row DEK.** Reason: `IS-I0-05`'s KEK/DEK
hierarchy exists so that rotating a key does not force re-encrypting multi-gigabyte objects. Here the whole
corpus is ~31 rows of a few hundred bytes; rewrapping all of them is milliseconds. A DEK layer would add a
wrapped-key field, a second failure mode and a second thing to lose, and would change no adversary outcome in §2.
This is a **named deviation** from the wording of `IS-I0-05`, recorded as decision **D2** in §7 — `IS-I0-05`
stays in force unchanged for patient media (`I2`), where the hierarchy earns its cost.

---

## 4. Key custody, rotation, recovery

### 4.1 Custody per environment

| Environment | Where the keyring lives | Who can decrypt |
| --- | --- | --- |
| DEV (`151.x`, `bcb_webapp_dev`) | `SETTINGS_KEYRING_JSON` in root `/.env` + `apps/webapp/.env.dev`, a throwaway dev key, never committed. Values protected are dev-only by `AGENTS.md` §1b.1. | local webapp + integrator dev processes |
| TEST (`151.x`, `/opt/env/bersoncarebot/*.test`) | own key, distinct from DEV and PROD; TEST credentials only | TEST webapp + integrator units |
| PROD (`135.106.162.170`) | one file `/opt/env/bersoncarebot/settings-keyring.prod`, `root:root 0400`, delivered to each unit by systemd `LoadCredential=settings-keyring:…` — not a shared `EnvironmentFile`, per `IS-I4-07` | PROD webapp + integrator units, and the holder of the recovery copy |

**Which process can decrypt: webapp and integrator, and nothing else.** Not PostgreSQL, not `media-worker`, not
`psql`, not any backup or deploy script. The integrator has no keyring today
(`apps/integrator/src/config/env.ts` declares none) — adding one is part of this work, not an afterthought.

### 4.1a Cutover through a PROD dump: environment-local snapshot/restore (closes A2)

Per-environment keys mean a row's ciphertext decrypts only under the key of the environment that wrote it.
Two existing flows overwrite a whole environment's `system_settings` from a **live PROD dump**:
`deploy/host/deploy-test-saas.sh` (TEST) and the DEV refresh recipe in
`docs/ARCHITECTURE/DB_DUMPS/README.md` (`AGENTS.md` §6). Once step 6 (§6) turns writes on, every one of those
resets would land PROD ciphertext for the 25 secret-bearing keys into TEST/DEV, which cannot decrypt it there —
without a fix, every clinic-owned credential, `google_refresh_token` and `web_push_vapid` in the target
environment goes from "TEST/DEV's own working value" to "unreadable" on every refresh, not just on key loss.

**Fix: generalize the pattern the repository already runs safely for one key.**
`deploy/host/deploy-test-saas.sh:279-315` already snapshots `smtp_outbound.value_json` to a `0600` file
immediately before the destructive restore and re-inserts it verbatim afterward — the ciphertext round-trips
opaquely and never touches the key (§1.3). This cutover extends that same snapshot/restore step, in the same
script, to **all rows scoped to the target environment across the 25 secret-bearing keys**
(`clinic_smtp_outbound`, `clinic_smsc_api_key`, `clinic_telegram_bot_token`, `clinic_max_bot_api_key`,
`clinic_vk_community_access_token`, `booking_payment_providers`, `google_refresh_token`, `web_push_vapid`, and
the remaining scalar/composite keys), applied identically to the TEST reset in `deploy-test-saas.sh` and to the
DEV refresh-from-prod recipe:

1. Immediately before the destructive restore, `SELECT key, scope, organization_id, value_json FROM
   public.system_settings WHERE key = ANY(<the 25 keys>)` on the **target** environment (its own current,
   already-decryptable-there values) into a `postgres:postgres 0600` snapshot file — never printed, never
   logged, same discipline as the existing SMTP snapshot.
2. Restore the PROD dump as today. This necessarily brings in PROD's ciphertext for those rows too.
3. Immediately after restore, re-insert the snapshotted rows over the freshly-restored ones, keyed by
   `(key, scope, organization_id)` — the target environment's **own** ciphertext, under the target's **own**
   key, wins. PROD's ciphertext for these 25 keys is never activated in TEST/DEV; it is overwritten before any
   process reads it.
4. A key or organization present in the PROD dump but absent from the target's own snapshot (e.g. a clinic that
   only exists in PROD) is intentionally **not** carried forward — no cross-environment credential is ever
   activated, matching the brief's "не активировать чужие production credentials в TEST/DEV".

This needs no manual re-entry of any secret: the target environment already holds a working, decryptable copy
of its own settings before the reset, and this step is exactly what preserves it across the reset, the same way
the current script already preserves `smtp_outbound`. `google_refresh_token` and `web_push_vapid` are named
explicitly because they are the two values named in §4.4 as not cheaply re-issuable/re-authorizable — losing
them to a routine refresh would be a self-inflicted outage this step exists to prevent.

### 4.2 Independent recovery copy (`IS-I4-02`, decision 4)

The active key material is written down once, offline, and held by the owner **outside** the production host:
owner's offline password manager plus one sealed second copy. It is stored in the same custody class as the
`age` backup private key but in a **separate container**, so that one custody leak does not simultaneously yield
the backups and the key that decrypts what is inside them. Nothing that stores ciphertext ever stores the key.

### 4.3 Rotation and overlap

1. Add `kid2` to `keys`, keep `kid1`; flip `activeKeyId` to `kid2`; restart webapp and integrator. New writes use
   `kid2`; rows still under `kid1` keep decrypting because retained read keys are the whole point of the format.
2. **Rewrap/backfill** through an internal job route, reusing the existing
   `Authorization: Bearer <INTERNAL_JOB_SECRET>` pattern of `apps/webapp/src/app/api/internal/*`: re-save every
   secret field under the active kid, one transaction per row, idempotent, resumable, reporting counts. ~31 rows,
   seconds.
3. **Retire `kid1` only after proof**, and the proof needs no key at all — the kid is in the cleartext part of
   the envelope:
   `SELECT count(*) FROM public.system_settings WHERE value_json::text LIKE '%bcbset.v1.kid1.%';` must be `0`.
4. **Rollback** during the overlap window: flip `activeKeyId` back and rewrap again. Both keys are present, so
   nothing is unreadable at any point.

### 4.4 Lost key and recovery drills

If the keyring and every recovery copy are lost, the affected values are unrecoverable. The honest consequence
is small for most of the corpus and non-trivial for exactly one value:

- 24 of the 25 values are **re-issuable from the provider**: revoke and re-issue the bot token in BotFather,
  regenerate the SMSC key, re-authorize Google Calendar, re-enter SMTP. Recovery = the owner re-enters them in
  the Settings UI. This is the reason a one-level KEK and a simple custody model are proportionate here.
- `web_push_vapid.privateKey` is **not** re-issuable in that sense: regenerating it invalidates every existing
  push subscription, and patients must re-subscribe. This is the one value with a real loss cost and the one
  that most justifies the sealed recovery copy.

Drills to run on DEV before TEST, on DEV data only (no new database — `AGENTS.md` §1b.3a):

1. **Rotate:** add `kid2`, flip active, restart, confirm rows written under `kid1` still read and new writes
   carry `kid2`.
2. **Rewrap:** run the job, confirm the `kid1` count query returns 0, remove `kid1`, confirm reads still work.
3. **Fail-closed, two distinct states:** remove `SETTINGS_KEYRING_JSON` and confirm the process refuses to
   start. Then restore it and remove only the *specific* kid one clinic's row uses (a decrypt failure —
   "unavailable"), and confirm: the channel refuses to send, the failure is observable (the job fails and
   surfaces through the same job-failure path `CLINIC_CHANNEL_NOT_CONFIGURED` already relies on — see §5/§6
   step 5), and there is **no** fallback to the platform or to another clinic's credential. Separately, confirm
   a clinic that has genuinely never configured that channel (no row at all — "not configured") still degrades
   to the platform sender exactly as it does today, per `dispatchPort.ts`'s existing `clinic_if_configured` /
   `clinic_preferred` scopes — this drill must show the two states are handled differently, not that both are
   now equally strict.
4. **Environment key mismatch:** on a DEV copy, restore a row's `value_json` as if it came from a different
   environment's snapshot (a ciphertext under a kid DEV's keyring does not hold) and confirm the same
   "unavailable" path as drill 3, never a fallback — this is the drill that proves §4.1a's snapshot/restore step
   is load-bearing, not optional.
5. **Dump proof:** §6, step 8.

---

## 5. Availability consequence and fail-closed behavior

The key is **process-local env/credential material, not a network key service.** No KMS, no HSM, no new network
dependency, no new outage class, no added request latency (AES-GCM over a few hundred bytes, behind an existing
60 s cache).

Fail-closed rules:

- **Missing or malformed keyring at boot ⇒ the process must refuse to start.** Note the existing precedent to
  *not* repeat: `createLazyStaffSecurityCryptoFromEnv` validates lazily, so a missing keyring surfaced as a
  route-level 500 during the 2026-07-27 global-admin walkthrough
  (`docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_global-admin.md:236`). Settings crypto validates eagerly at
  startup instead.
- **A row whose kid is absent from the keyring ⇒ decryption throws ⇒ the reader must report a distinct
  "unavailable" state, never "not configured".** These two states are not the same and existing code must not be
  allowed to collapse them:
  - **webapp** already has the right shape: `modules/system-settings/runtimeSettingUnavailable.ts`'s
    `RuntimeSettingUnavailableError` is exactly "we have no answer, we do not substitute a default." Settings
    crypto reuses it unchanged for webapp readers.
  - **integrator is measured to do the opposite today, and this is not acceptable to ship as-is.**
    `apps/integrator/src/infra/db/clinicDeliveryCredentials.ts:52-91` — `createClinicDeliveryCredentialResolver`
    — ends its whole body in one `catch { return null }`, so a decrypt/AAD/tag failure is indistinguishable from
    "this clinic never configured the channel." `dispatchPort.ts:103-112`'s `clinic_if_configured` then degrades
    a null credential to `platform_required`, and `dispatchPort.ts:351-366` sends under the platform identity
    whenever `senderScope` is not `clinic_required`. Concretely, this means: `kid` retirement (§4.3 step 3), a
    tampered/truncated row, or a restored copy missing its own key (§4.1a) does not stop delivery — it silently
    reroutes it through the platform's SMTP/SMS/bot identity, with no operator signal. `webapp`'s
    `runtimeSettingUnavailable.ts` module cannot be reused here: it lives in `apps/webapp`, which the integrator
    cannot import under §5 clean-architecture rules.
  - **Required fix, named so it ships with step 5 of §6, not deferred:** `clinicDeliveryCredentials.ts`'s
    resolver keeps returning `null` for the cases that must keep today's fallback semantics — no principal, no
    row, disabled tariff mechanic, `deliveryReadiness` not `enabled` (requirement: an ordinary absent clinic
    credential is unaffected by this change). It must stop swallowing a decrypt exception from
    `packages/secret-envelope` into that same `null`; instead it rethrows a new typed
    `ClinicCredentialUnavailableError(channel, key)`. `dispatchPort.ts`'s `clinicSenderScope()` catches that
    error and refuses the channel outright — unconditionally, not only when `requestedScope === 'clinic_required'`
    — so the send fails the job instead of falling through to `adapter.send(intentForChannel)` under the
    platform identity. The failure must be observable the same way `CLINIC_CHANNEL_NOT_CONFIGURED` already is
    (it fails the job, which is visible in the existing job-failure/error path); turning that into a *proactive*
    operator alert is the pre-existing gap named in the operator-alerting backlog and is not solved by this
    packet. Verification: extend `clinicDeliveryCredentialGate.audit.test.ts`,
    `clinicDeliveryCredentials.unit.test.ts` and `dispatchPort.test.ts` with a decrypt-failure fixture (missing
    kid / mutated tag) asserting refusal-not-fallback, plus §4.4 drills 3–4.
- **Tamper or truncation** fails the GCM tag check, which is the same path as a missing key: unavailable, not a
  partial or silently wrong value, and — after the fix above — refused rather than routed through the platform.

The trade the owner is accepting: **today, losing the env file loses `SESSION_COOKIE_SECRET` and sessions;
after this change, losing the keyring additionally takes every integration down until the values are re-entered,
and permanently costs the existing web-push subscriptions.** That is a genuine increase in availability risk and
is decision **D4** in §7. It is a separate thing from the integrator fix above: D4 is the owner's call on how
much availability risk to accept when the key really is gone everywhere; the integrator fix is not offered as a
choice — an "unavailable" credential silently sent under the platform's identity is a defect this packet must
not ship, independent of what the owner decides about D4.

---

## 6. Minimal migration and cutover order

Each step is independently deployable; the ordering is chosen so that rollback is free until step 6.

1. **Extract the primitive.** `packages/secret-envelope` from the staff-security core; `staff-security` becomes
   its caller with prefix and AAD unchanged. Behavior-neutral; covered by the existing staff-security tests plus
   known-answer/tamper/wrong-key/wrong-AAD cases required by `CRYPTO-01` C1.
2. **Add the key everywhere before any ciphertext exists.** `SETTINGS_KEYRING_JSON` in both apps' env schemas
   (`apps/webapp/src/config/env.ts`, `apps/integrator/src/config/env.ts`), eagerly validated at startup, wired as
   a typed port through `buildAppDeps` / the integrator DI. Nothing reads or writes ciphertext yet. Deploy.
3. **Readers become dual-read.** Plaintext passes through unchanged; a `bcbset.v1.` prefix decrypts. Deploy.
   Still zero ciphertext in the database; rollback is a plain revert.
4. **Rebind the bot fingerprint.** Forward migration changing `app.sync_clinic_dedicated_bot_binding()` per
   §3.4's three-way rule: prefer `value_json.fp`; if absent and `{value}` looks like a `bcbset.v1.` envelope,
   refuse and leave the binding untouched; only hash `{value}` when it is not an envelope (true legacy
   plaintext). No data change, no webhook re-registration. Per `AGENTS.md` §1 this migration grants and revokes
   nothing.
5. **Integrator distinguishes "unavailable" from "not configured" (closes A1).** Ship before step 6, because
   step 6 is the first point a clinic's own row can actually be ciphertext in production traffic:
   `clinicDeliveryCredentials.ts`'s resolver stops swallowing a decrypt/AAD/tag failure into the same `null` it
   returns for "no credential configured", and `dispatchPort.ts`'s `clinicSenderScope()` refuses the channel
   outright on that failure instead of falling through to the platform sender — the exact change named in §5.
   Covered by `clinicDeliveryCredentialGate.audit.test.ts`, `clinicDeliveryCredentials.unit.test.ts`,
   `dispatchPort.test.ts` plus §4.4 drills 3–4. Behavior-neutral for every clinic that has no row at all — the
   existing platform-fallback semantics for a genuinely unconfigured channel do not change.
6. **Turn writes on.** `valueForWrite()` encrypts the secret field of the 25 keys.
   **Preconditions, both must land first:**
   - the rewrap job of step 7 must already support rewrap-to-plaintext, because after this step a revert to
     step-4 code cannot read rows written by step-6 code;
   - §4.1a's environment-local snapshot/restore generalization must already be live in
     `deploy/host/deploy-test-saas.sh` and the DEV refresh recipe (closes A2) — otherwise the very next TEST
     reset or DEV refresh from a live PROD dump imports PROD ciphertext under a key TEST/DEV does not hold.
   The TEST-reset SMTP snapshot gate needs no change to its own logic (§1.3), but re-run it once on TEST to
   confirm that in practice, alongside the generalized snapshot from §4.1a.
7. **Backfill.** Run the rewrap job over existing rows (counts, idempotent, resumable) — note its effect on the
   materialization fingerprint (§1.5 item 5). **The audit-redaction half of this step shipped early and
   independently (`#1071`, 2026-09-02, closed — see §1.8): `web_push_vapid`, `booking_payment_providers` and
   `saas_billing_payment_provider` are now redacted in `system_settings_audit`, and the redaction policy is
   derived from `SYSTEM_SETTING_REGISTRY` instead of a hand-maintained list** — a hand list is what produced
   this gap twice already (2026-07-27 and 2026-07-28, per the module's own comments). What remains for this
   step at cutover is only the rewrap job itself (encrypting the already-redaction-safe rows).
8. **Proof that a dump without the KEK reveals nothing** — obtained without creating any database, as
   `AGENTS.md` §1b.3a requires:
   a. `SELECT key, scope, organization_id, value_json FROM public.system_settings WHERE key = ANY(<the 25 keys>)` on
      DEV shows every secret field as `bcbset.v1.…`, and the row count matches the number of configured keys;
   b. `pg_dump` the DEV database to a stream and grep it for a known DEV credential value (held only in the
      operator's hands, never printed into the report) — expected zero hits, and a non-zero hit on a
      deliberately-left plaintext control row proves the grep itself works;
   c. a negative test: decrypting a captured DEV envelope with a wrong key, a wrong kid, a mutated tag, and a
      correct key but a foreign AAD (another org's row) each fails closed;
   d. the kid-count query of §4.3 returns 0 for every retired kid.
   Then DEV → TEST per §1b.3a. No production action without a separate owner GO and host confirmation.

**What this does not do:** it does not close `IS-I4-09` by itself — that finding also requires provider-side
rotation of the token that was stored in plaintext, which is an operator action. It changes no RLS policy, no
grant and no role.

---

## 7. Decisions that genuinely remain

Everything else in this packet is an engineering choice already made against the repository and world practice —
including the fail-closed integrator fix (A1/§5/§6 step 5), the trigger's refuse-on-ciphertext-without-`fp`
behavior (A3/§3.4/§6 step 4), and the environment-local snapshot/restore that keeps TEST/DEV working after a
PROD-dump reset (A2/§4.1a/§6 step 6). None of those is offered as a choice between safe and unsafe behavior —
they ship as part of the implementation, not as an owner gate. What remains below is five decisions that are
either genuinely about the owner's own custody arrangements or a proportionality call this document cannot make
for him; each already carries a recommendation, none of them trades security for convenience.

**D1 — Scope of the encrypted set.**
Encrypt the 25 secret-bearing keys (19 scalar + 6 composite); leave the six public OAuth identifiers in
plaintext and correct their `secret_envelope` label in the registry.
→ *Recommendation: yes.* Encrypting a public client id buys nothing and breaks the SQL availability derivation.

**D2 — One-level KEK for settings, no per-row DEK.**
A named deviation from the wording of `IS-I0-05`, which stays in force unchanged for patient media.
→ *Recommendation: yes.* ~31 small rows; rewrap costs milliseconds; a DEK adds a second thing to lose and
changes no outcome in §2.

**D3 — Who holds the independent recovery copy.**
Today the answer is effectively "nobody" — there is no second custodian for infrastructure key material.
Proposal: owner's offline copy plus one sealed second copy, same custody class as the `age` backup private key
but a separate container.
→ *Recommendation: adopt as stated.* If the owner wants a second human custodian, that is his call and the only
part of this that cannot be decided technically.

**D4 — Accept the availability trade.**
Losing the keyring takes every integration down until the values are re-entered, and permanently costs existing
web-push subscriptions.
→ *Recommendation: accept.* 24 of the 25 values are re-issuable from the provider; the drills in §4.4 and the
recovery copy in D3 are what keep the residual case small.

**D5 — Independent technical review before implementation (`IS-I0-07`).**
The owner's 2026-08-17 ruling (decision 14) removed the external *regulatory* gate but kept an independent
technical review of the crypto/key design.
→ *Recommendation: one short external review of this packet before step 1*, because the same primitive is what
patient media will reuse in `I2`. Reviewing it once here is cheaper than reviewing it twice later.

---

## 8. Dependencies named, not taken over

- `IS-I0-03` / decision 9 — LUKS2 root. The broad at-rest layer; this design does not replace it.
- `IS-I4-07` — per-service secret files and systemd `LoadCredential`. This design assumes it for PROD custody.
- `IS-I4-08` — `kid` for `SESSION_COOKIE_SECRET` / `DB_PRINCIPAL_SIGNING_SECRET`. Same keyring pattern, different
  keys; not merged into this scope.
- `IS-I2-01`…`IS-I2-06` — patient media envelope. Will reuse the package from §3.1; owns its own KEK/DEK.
- `IS-I3-02`/`IS-I3-03` — `age` backup encryption and its private-key custody, already in place.
- `IS-I2-10` / decision 12 — mass field encryption is rejected; this packet is deliberately the narrow settings
  case and does not reopen it.

## 9. Not done in this pass

- No product code, migration, env, DB, host, DEV/TEST/PROD or active-plan change (research-only brief).
- No tests and no full CI — nothing executable was produced, so neither would carry signal (`AGENTS.md` §9-§10).
- No secret value was read or printed. Counts and key names only.
- The three-key audit-redaction gap in §1.8 is **reported, not fixed** — it is a real current defect, and per
  `AGENTS.md` §24.6 a finding outside this brief's scope is named, not silently turned into work.
