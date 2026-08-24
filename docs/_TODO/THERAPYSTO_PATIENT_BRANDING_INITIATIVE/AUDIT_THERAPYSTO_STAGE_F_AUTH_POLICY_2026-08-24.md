# Independent audit — Therapysto Stage F auth policy

**Date:** 2026-08-24  
**Exact product candidate:** `1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52`  
**Branch/worktree:** `wt/therapysto-night-20260823` / `/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`  
**Authority:** `IMPLEMENTATION_PLAN.md` plus the owner behavior in the Stage F audit brief  
**Final verdict:** FAIL

Initial freshness check: `HEAD=3bbb0685234da010792f7aadf267f7b3f7115a1b`; command
`git diff --name-status 1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52..HEAD -- apps packages deploy`
printed no rows. The descendant is brief-only. Freshness is checked again before commit.

## Test or inspection — fixed before reading existing test source

| ID | Classification | Why |
| --- | --- | --- |
| `F2` | `TEST` | OAuth start/callback denial and restoration are repeatable HTTP behavior; independence must be observed by toggling one surface without changing the others. |
| `F2b` | `TEST` + `INSPECTION` | Disabled/re-enabled passkey with the same existing credential is repeatable route behavior; absence of resurrected PIN is a one-time final-state inventory. |
| `F2c` | `INSPECTION` + `TEST` | Later owner authority must first settle which factor is intended; the reachable staff login paths are then repeatable HTTP behavior. |
| `F3` | `TEST` | Standard/branded email and messenger-phone proofs, returned web code, and absence of account creation are repeatable behavior with observable outputs/side effects. |
| `F5` | `TEST` + `INSPECTION` | Yandex/Google surface selection is repeatable behavior; one global registration and no per-clinic copy are final configuration topology. |
| `TPB-10` | `TEST` | Staff/platform-admin disabled defaults and patient Yandex availability must hold at start/config/callback boundaries. |
| `TPB-17a` | `TEST` + `INSPECTION` | Same behavioral proof as `F2b`; PIN inventory remains a final-state check. |
| `TPB-17` | `TEST` | Direct OAuth routes must fail closed while disabled and work after the corresponding surface cell is enabled. |
| `TPB-18` | `TEST` | Both patient surfaces must execute the same email and messenger-phone ownership proof without account creation. |
| `TPB-19` | `TEST` + `INSPECTION` | Independent policy selection and direct-route denial are repeatable; three persisted canonical cells and migration state are one-time DB/config topology. |

Cross-cutting brief requirements are split independently: ordinary-vs-branded bot delivery and branded-only
mailings are `TEST`; canonical settings store, migration writes/verification, privileges, indexes, and the
unchanged domain/origin state are `INSPECTION`.

## Blind kill-set — fixed before reading existing test source

The oracle is the owner behavior in the brief and the later dated owner text in the plan, not the candidate implementation.

1. Staff OAuth is disabled, yet a direct start or callback reaches provider work instead of `oauth_disabled`.
2. Platform-admin OAuth is disabled, yet a direct start or callback reaches provider work.
3. Enabling staff OAuth fails to restore start/callback, or also changes platform-admin/patient policy.
4. Enabling platform-admin OAuth fails to restore start/callback, or also changes staff/patient policy.
5. Disabled staff passkey still begins/verifies a login; after re-enable, a credential created before disable no longer works.
6. A PIN entry/route/mechanic is reachable again.
7. Standard or branded patient email proof is denied by the owner defaults, or the two surfaces diverge.
8. Standard or branded messenger-owned contact proof fails to return the web code, accepts a non-contact payload, or creates a new platform/integrator identity/account row.
9. The ordinary Therapysto bot cannot perform phone proof and ordinary opted-in reminders/clinic-message delivery.
10. A branded clinic bot lacks any ordinary capability, incoming patient messages, or clinic mailing; alternatively a non-branded clinic can use clinic mailing.
11. Delivery work introduces a second dispatcher instead of using the existing dispatch path.
12. Patient passkey remains effectively enabled by defaults or persisted settings, exposing an extra direct patient entry despite the required email/phone policy.
13. Two policies share a persisted cell, so changing staff/platform-admin/patient mutates another surface.
14. A disabled mechanism is merely hidden in UI while its direct route still succeeds.
15. Staff runtime exposes standalone email OTP and password→TOTP as two parallel login paths despite the one-factor-choice requirement.
16. Patient Yandex is unavailable on either patient surface, Google is enabled, or branded selection requires/uses a per-clinic Yandex registration.
17. Runtime reads `public.app_runtime_settings` while admin writes canonical `public.system_settings` (or vice versa), so the two copies drift and the effective policy silently differs from the admin value.
18. The migration's `BCB-MIGRATION-VERIFY` can pass while the canonical `public.system_settings` result is absent/wrong.

## Production diff, evidence, injections, and commands

The exact candidate changes one migration, three auth tests, surfaceAuthSettings.ts,
requestSurface.ts, and the owner plan. The command

    git diff-tree --no-commit-id --name-status -r 1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52

printed those seven paths. It changes no domain, DNS, TLS, nginx, TEST origin, runtime env, or deploy file.
The pre-audit and pre-report command

    git diff --name-status 1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52..HEAD -- apps packages deploy

printed no rows. All temporary injections below were restored, and the same command was empty again after
restoration. The audited product stayed exactly at the requested product SHA.

### Decisive production inspection

1. **Persisted values have the wrong JSON shape.** The candidate migration writes JSON primitives
   true/false to fourteen rows in both tables
   (20260824T064008_apply_surface_auth_owner_defaults.sql:6-29,33-57). Runtime binds
   createPgAppRuntimeSettingsPort (bindSystemSettingsConfigAdapter.ts:7,14-18), reads
   app.read_public_runtime_setting from public.app_runtime_settings
   (pgAppRuntimeSettings.ts:58-75), and accepts a boolean only as an object envelope whose value property is
   boolean (runtimeConfig.ts:85-89,248-259). A primitive therefore becomes RuntimeSettingUnavailableError,
   not enabled or disabled. Reachable consequence after this migration: staff/admin OAuth and passkey,
   patient email/phone, Yandex, and Google policy reads fail with an application error. A true primitive does
   not re-enable a route and a false primitive does not produce the intended typed disabled response.
   Candidate route tests mock isOAuthProviderEnabled/getPublicRuntimeBool and therefore do not exercise this
   composition.

2. **The migration creates the forbidden second configuration copy.** Its first UPDATE writes
   public.system_settings and its second UPDATE writes public.app_runtime_settings. Runtime actually selects
   the latter, while AGENTS.md §4 requires public.system_settings to be the only source, with no
   mirror/copy. If the canonical row is corrected while the runtime copy is stale, the direct route follows
   the stale copy; if only the runtime row is corrected, admin/canonical inspection reports a different
   policy. The BCB-MIGRATION-VERIFY expression checks only app_runtime_settings and checks the same invalid
   primitive shape, so it succeeds when system_settings is absent/wrong and when runtime cannot parse the
   alleged result.

3. **Patient passkey remains enabled.** DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient.enabledMethods includes
   passkey (requestSurface.ts:50-53), so defaultSurfaceAuthControlEnabled returns true
   (surfaceAuthSettings.ts:50-65). The preceding F4 migration copied legacy auth_passkey_enabled to all three
   surfaces; registry.ts:219-231 records that live/default legacy value as true. The candidate changes only
   auth_surface_staff_passkey_enabled, never auth_surface_patient_passkey_enabled. Consequently both patient
   surfaces can reach /api/auth/passkey/login/options and /verify, establishing a patient session in
   passkey/login/verify/route.test.ts:88-102. The patient gets a third direct entry path beyond the required
   email/phone policy.

4. **The bot contact command can create the account it is supposed only to prove.** On a not-ready login
   contact, completePhoneMessengerBindFromIntegrator calls applyMessengerContactPreOtp and propagates
   accountCreated into the OTP challenge (phoneMessengerBind.ts:267-317,331-348).
   createPgPhoneMessengerBindPort calls app.pre_session_messenger_channel_resolve
   (pgPhoneMessengerBind.ts:161-208); that function inserts public.platform_users when no holder exists
   (20260821T090000_pre_session_messenger_channel_resolve.sql:202-203). The existing acceptance test even
   covers accountCreated=true as first-time registration. The web code is returned and delivered, but the
   same command has already created the platform identity, directly violating the brief.

5. **Staff currently has two independent login paths.** POST /api/auth/email-otp/confirm loads the user and
   calls setSessionFromUser directly for doctor/admin roles (email-otp/confirm/route.ts:91-123). Independently,
   email-password/login verifies password and enters staff security, and
   email-password/login/factor accepts TOTP or recovery code
   (email-password/login/route.ts:102-220; login/factor/route.ts:18-99). Searches used:

       node /home/dev/brain/tools/code-search.mjs "doctor second factor email password email code TOTP owner decision" --repo bcb -k 20
       rg -n -i "Q2|втор(ой|ого) фактор|email[^\n]{0,80}(код|code)|TOTP[^\n]{0,80}(врач|doctor|staff)|doctor[^\n]{0,80}TOTP" docs/_TODO docs/OWNER_DECISIONS* docs/OWNER_RULINGS* .cursor/plans
       rg -n -C 12 "1\.2g|Q2|23\.08\.2026|email \+ password \+ email|email \+ пароль \+.*код" docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md

   The dated owner decision at plan §1.2g/Q2 (23.08.2026) already selects the target staff composition:
   email + password + email code; implementation was deferred until the domain move. The later
   OWNER QUESTION line at F2c is agent prose, not later owner authority. The 24.08 audit brief now explicitly
   requires one choice and is newer authority. Therefore F2c is FAIL, not an OWNER QUESTION. The platform-admin
   extension remains separately undecided, but it cannot change the staff failure.

6. **Mailing is not limited to branded clinics.** executeBroadcastAction checks only the mailings mechanic
   (actions.ts:82-90); assertClinicBroadcastChannels then checks a clinic delivery-channel mechanic and
   org setting (lines 108-155). It never checks branding. A clinic with mailings plus an enabled own channel
   but branding disabled can execute the mailing. This is a reachable entitlement combination because
   branding and mailings are independent mechanics. Impact: a non-branded clinic receives the capability
   reserved by the owner for branded clinics.

### Working parts and boundaries

- OAuth start and callback use the same server gate; when the mocked cell is false both reject, and when true
  both proceed. Actual key selection is surface-specific in authChannelPolicy.ts:20-39,104-139, and the policy
  unit test proves staff/platform-admin/patient key independence. The broken persisted value prevents those
  otherwise-correct mechanics from satisfying F2/TPB-17 at runtime.
- Staff passkey options and verify routes retain the mechanics and do not delete credentials. With a valid
  enabled gate, the options route resumes and the existing verification route creates factor_verified staff
  assurance. With the gate disabled, the direct options route returns 403 before challenge creation. The
  broken persisted value prevents the deployed default/re-enable contract. PIN has no route or UI:
  code-search, exact search of apps/webapp/src/app/api/auth, modules/auth, shared/ui and app/app, and the auth
  canon back-reference found no /api/auth/pin tree. pinHash.ts is only the legacy-named Argon2 password hasher
  used by email-password/specialist signup, not a PIN mechanic.
- Patient email and messenger contact routes are shared across standard/branded surfaces; contact possession
  returns the web OTP. The account-creation side effect above invalidates the owner contract.
- Ordinary clinic messages and reminder materialization use clinic_if_configured and the central dispatcher
  falls back to the platform bot when no clinic credential exists. Dedicated Telegram/MAX webhooks bind
  incoming traffic to the clinic credential; clinic-required delivery does not fall back after clinic-provider
  failure. Exact search found one createDefaultDispatchPort definition:

      rg -n "function createDefaultDispatchPort|const createDefaultDispatchPort|export function createDefaultDispatchPort|export const createDefaultDispatchPort" apps/integrator/src --glob '!**/*.test.*'

  It printed only apps/integrator/src/infra/adapters/dispatchPort.ts:318. No second dispatcher was added.
- Patient Yandex uses the existing global provider config and surface cell; no per-clinic registration was
  added. Compiled provider defaults keep patient Yandex true and Google/staff/admin OAuth false
  (surfaceAuthSettings.ts:54-58). Again, invalid persisted primitives make the deployed state unavailable.

### Foreground checks

Canonical rollback-only migration preflight on named DEV:

    bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot

Result: PASS; both candidate statements printed UPDATE 14, verification passed, the transaction printed
ROLLBACK, and the runner reported pending=4 total=74. It ran while
apps/packages/deploy matched the exact product SHA; no permanent migration and no disposable database were
used.

Targeted webapp command:

    /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts src/app/api/auth/passkey/login/verify/route.test.ts src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts src/modules/messaging/doctorSupportLegacyChannelScope.test.ts"

Result: 12/12 files and 61/61 tests passed.

Targeted integrator command:

    /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts src/infra/adapters/dispatchPort.test.ts src/integrations/telegram/dedicatedWebhook.route.test.ts src/integrations/max/dedicatedWebhook.route.test.ts src/integrations/bersoncare/sendOtpRoute.route.test.ts src/integrations/bersoncare/requestContactRoute.route.test.ts src/integrations/bersoncare/relayOutboundLegacyDefaultPath.audit.test.ts"

Result: 7/7 files and 33/33 tests passed.

An earlier command accidentally used the package test script with a literal separator and therefore expanded
to the full webapp suite:

    /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp test -- src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts src/app/api/auth/passkey/login/verify/route.test.ts src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts src/modules/messaging/doctorSupportLegacyChannelScope.test.ts"

It reported 8 failed, 449 passed, 6 skipped test files and 17 failed, 2251 passed, 15 skipped tests. The red
files cover unrelated existing expectations (booking mail profile, proxy defaults, tariff readiness, missing
surface headers, and UI copy), are outside the candidate diff, and are not used as evidence for this verdict.

### Blind fault injections

All three injections were made in production code after the kill-set, run in the foreground, and reverted:

1. authChannelPolicy.ts: force every surface toggle to true. Command

       pnpm --dir apps/webapp exec vitest run src/modules/auth/publicAuthPolicy.unit.test.ts

   went red: 3 failed and 8 passed of 11. It caught disabled values and cross-surface isolation.
2. passkey/login/options/route.ts: replace the disabled guard with false. Command

       pnpm --dir apps/webapp exec vitest run src/modules/auth/independentAuthMethodToggle.route.test.ts

   went red: 1 failed and 1 passed of 2; the disabled route returned 200 instead of 403.
3. dispatchPort.ts: make clinic_if_configured require a clinic credential even when none exists. Command

       /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/adapters/dispatchPort.test.ts"

   went red: 1 failed and 14 passed of 15; ordinary patient traffic rejected with
   CLINIC_CHANNEL_NOT_CONFIGURED instead of using the platform sender.

Injections planted: 3; killed: 3; missed: 0. Final git diff -- apps packages deploy was empty.

## Migration rights analysis

- **Objects/statements:** two data-only UPDATE ... FROM VALUES statements. They update value_json and
  updated_at in public.system_settings and public.app_runtime_settings for fourteen existing global/admin
  keys. No table/function/type/role/index is created, altered, or dropped.
- **Executing role/access:** the canonical runner executes the pending migration through its declared local
  migration-owner/admin channel. PostgreSQL needs UPDATE on value_json/updated_at and SELECT on key, scope,
  organization_id (plus audience for app_runtime_settings) to evaluate the predicates. The identical-product
  rollback-only preflight executed both UPDATE 14 statements successfully, so the named DEV executor has the
  required access.
- **GRANT/REVOKE:** exact command

      rg -n "\b(GRANT|REVOKE)\b" apps/webapp/db/drizzle-migrations/20260824T064008_apply_surface_auth_owner_defaults.sql

  printed nothing. This is correct under AGENTS.md §1: this migration must not change privileges. There is no
  new object and therefore no new role/access declaration to add.
- **Indexes:** neither statement changes indexed columns. Both global-row predicates are covered by the
  existing partial unique indexes on key/scope WHERE organization_id IS NULL
  (system_settings schema.ts:3650-3664; appRuntimeSettings.ts:34-39). audience is an additional filter over
  the one global key/scope row. No new hot query column or index is introduced, and no index rebuild is caused.
- **§§2-4:** the backfill does not respect them. It writes a noncanonical runtime mirror and writes both stores
  in a JSON format the runtime rejects. Successful SQL execution in preflight therefore does not mean correct
  application state.
- **Verification:** BCB-MIGRATION-VERIFY checks only the runtime mirror and the invalid primitive values. It
  neither checks the canonical system_settings rows nor the required object envelope, so it can certify the
  exact broken state identified above.

## Findings

### MUST FIX F-1 — migration values are unreadable by runtime

**Scenario:** apply the candidate migration, then call any affected direct auth route.  
**Impact:** required staff/admin toggles and patient email/phone/Yandex policy are unavailable; re-enable by
the migration value does not work and disabled routes return server failure rather than the intended policy
denial.  
**Violated authority:** F2/F2b/F3/F5, TPB-10/17/17a/18/19, and the brief's direct-route/default requirements.  
**Evidence:** migration lines 6-57 versus runtimeConfig.ts:85-89,248-259 and the actual
app_runtime_settings read path.

### MUST FIX F-2 — two configuration stores can drift

**Scenario:** one of the two UPDATEs/writers succeeds or is later changed independently. Runtime follows
app_runtime_settings while canonical/admin state is system_settings; verify examines only the mirror.  
**Impact:** an operator sees one policy while direct login routes enforce another, and migration verification
can still pass.  
**Violated authority:** AGENTS.md §4 and audit requirement 9; TPB-19.  
**Evidence:** migration lines 23-29 and 50-57, composition/read path above, verify line 2.

### MUST FIX F-3 — patient passkey is a reachable extra login

**Scenario:** a patient with a passkey opens either patient surface and calls passkey options/verify.  
**Impact:** the patient can enter without the required email or messenger-phone proof.  
**Violated authority:** owner patient entry policy, requirement 5, F3/TPB-18.  
**Evidence:** requestSurface.ts:50-53, surfaceAuthSettings.ts:50-65, registry.ts:219-231, omission from the
candidate migration, and passkey verify behavior.

### MUST FIX F-4 — bot proof creates a platform user

**Scenario:** a new messenger contact completes the bot phone-proof command.  
**Impact:** the bot creates public.platform_users before web registration instead of only returning proof.  
**Violated authority:** explicit no-account-creation bot command requirement, F3/TPB-18.  
**Evidence:** phoneMessengerBind.ts:267-317, pgPhoneMessengerBind.ts:161-208, and
20260821T090000_pre_session_messenger_channel_resolve.sql:202-203.

### MUST FIX F-5 — staff email OTP and password/TOTP are parallel logins

**Scenario:** the same staff identity can establish a session by standalone email OTP, or use password and
then TOTP/recovery.  
**Impact:** there is no single default second-factor choice; the standalone path bypasses the selected target
composition.  
**Violated authority:** F2c, the audit brief, and owner Q2 at plan §1.2g.  
**Evidence:** email-otp/confirm/route.ts:91-123 and email-password login/factor routes cited above.

### MUST FIX F-6 — non-branded clinic can send mailings

**Scenario:** a clinic has mailings and an enabled clinic delivery channel, but branding is disabled.  
**Impact:** it can execute clinic mailing despite the branded-only boundary.  
**Violated authority:** ordinary-vs-branded bot behavior in the audit brief.  
**Evidence:** actions.ts:82-155 contains mailings/channel checks and no branding check.

## Per-ID verdicts

- **F2 → FAIL** — mechanics and independent keys remain, but deployed false/true values are unreadable.
- **F2b → FAIL** — passkey mechanics/credentials and PIN absence are preserved, but the persisted disabled
  default is unreadable and cannot satisfy disable/re-enable runtime behavior.
- **F2c → FAIL** — owner Q2 selects email code for the target staff composition; standalone email OTP and
  password→TOTP remain parallel.
- **F3 → FAIL** — patient policy values are unreadable, patient passkey stays enabled, and bot proof creates
  the user.
- **F5 → FAIL** — global Yandex mechanics remain and Google compiled default is off, but both persisted
  policy values are unreadable after migration.
- **TPB-10 → FAIL** — the required off/on default matrix cannot be consumed by runtime.
- **TPB-17a → FAIL** — no PIN route and credentials survive, but staff passkey default/re-enable policy is
  broken by persisted shape.
- **TPB-17 → FAIL** — direct route gates are wired, but the persisted OAuth defaults make start/callback
  return runtime failure rather than usable independent off/on behavior.
- **TPB-18 → FAIL** — shared patient proof paths exist, but bot completion creates identity and passkey
  remains an extra patient login.
- **TPB-19 → FAIL** — keys are surface-specific, but the migration violates the sole canonical store,
  persists invalid values, and verifies only the mirror.

FAIL
