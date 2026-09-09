# Final platform delivery audience audit (#787)

- Candidate: `8aac60e20652e60101223e865d1bebc7c715331c`
- Base: `51b4adb87`
- Status: FAIL — do not land

## Blind kill-set

Written from the owner oracle before reading existing tests. The oracle is `TPB-12b`/`TPB-13a`: patient intent must not use Therapysto credentials and staff intent must not use TherapyGo credentials.

1. A staff email, Telegram, or MAX delivery selects TherapyGo.
2. A patient notification or auth flow selects Therapysto.
3. A staff inbound Telegram/MAX request reads or authenticates with the patient identity, parses as patient, or responds via the patient identity.
4. A patient inbound Telegram/MAX request reads or authenticates with the staff identity, parses as staff, or responds via the staff identity.
5. Independent inbound bot startup, webhook, long-polling, menu, or setup for one audience disables or collides with the other.
6. A relay/queue loses the typed audience, allowing a silent patient fallback for a staff path.
7. Platform secrets leak through env, public settings, logs, or a clinic admin can mutate global identities; a clinic override crosses organization scope or is selected for staff.
8. The migration/privilege path creates a store or grant/revoke, fails owner-aware DEV rollback preflight, or leaves its restricted setting unreadable through the sanctioned function.
9. The provider-neutral shared mechanism is bypassed by duplicated Telegram/MAX business engines or provider-specific domain routing.

## Test-or-view classification

| Item | Classification | Evidence |
| --- | --- | --- |
| Outbound patient/staff delivery and signed email boundary | Repeatable behavior | Route/dispatch tests; staff email and patient-message MAX oracles are green. |
| Telegram/MAX inbound identity, webhook and long-polling | Repeatable behavior | Provider-free Fastify route tests check independent staff secrets and staff gateway facts. The existing polling test proves the shared polling pipeline retains retry semantics. |
| Settings, registry, migration, generated privileges and rollback preflight | One-time wiring/privilege | Diff and generated-artifact inspection, generator/type gates and the sanctioned rollback-only DEV preflight. |

## Inspection evidence

- `platformDeliveryAudience.ts` is the sole typed platform-brand selector. `dispatchPort` applies its result once before thin Telegram/MAX/email adapters, while a ready clinic credential remains a patient-only, exact-organization override.
- `readTelegramRuntimeConfig`/`readMaxRuntimeConfig`, the global settings registry/API and `public.system_settings` form one typed DB-backed path. New provider settings are global, restricted and secret-redacted; the platform settings API admits their writes only through the existing global-admin settings flow. No provider secret was supplied, printed or sent.
- Telegram and MAX register separate patient/staff webhook URLs, check the audience-specific webhook secret, pass `platformAudience` into the same event gateway and make staff input `accepted_noop`; it neither receives patient Mini App links nor runs the patient command pipeline. Telegram long-polling is keyed by audience and starts a separate loop for each enabled identity. Menu/setup calls use the corresponding audience runtime config.
- Migration `20260909T190000_platform_delivery_audience_credentials.sql` changes only the existing `app.read_integrator_provider_runtime_setting(text)` function under its declared seam owner. It creates no setting store, default/secret or GRANT/REVOKE. The matching declaration grants execution through the existing service capability and generated artifacts are current.

## Reachable findings

1. **FAIL — signed operator Telegram/MAX alerts silently use TherapyGo.** `operatorAlertRelayRoute.buildIntent` marks email as `audience: 'staff'`, but its signed public `telegram` and `max` branches omit the audience. The common selector therefore defaults those staff operational alerts to patient/TherapyGo. This violates `TPB-12b` (staff intent must not use TherapyGo) and the owner audience split. The new public route oracle is red 2/3: Telegram and MAX fail, email passes. Impact: an operator receiving a critical staff alert sees it delivered by the patient platform identity.

2. **FAIL — an inbound audience runtime read decrypts the other identity's credential.** `readTelegramRuntimeConfig` and `readMaxRuntimeConfig` unconditionally fetch `platformCredentialKey(oppositeAudience(audience), ...)` to decide whether a legacy shared secret is permissible. Thus a staff webhook request reads the TherapyGo Telegram/MAX credential (and vice versa), even though it eventually dispatches with its own credential. This directly violates the required inbound boundary: a request for one audience must never read the other audience's token/API key. This is a view finding; a key-list/registry-shape test would be prohibited by §10a/§10b. The fix must preserve the owner-approved single-identity legacy migration behavior without fetching a peer secret through the runtime credential capability.

The source sweep also found other pre-existing unmarked admin/operator Telegram/MAX producers. They are the same failure class as finding 1, not separate test-count findings; the public signed route above is a directly reachable reproduction within the changed operator path.

## Fault injections

| Fault | Caught observable | Result |
| --- | --- | --- |
| Replace Telegram webhook `platformAudience: audience` with `platformAudience: 'patient'` | Staff route test observes `patient` instead of `staff`. | Caught; test red. Reverted. |
| Replace MAX webhook `platformAudience: audience` with `platformAudience: 'patient'` | Staff route test observes `patient` instead of `staff`. | Caught; test red. Reverted. |
| Replace `sendOperatorFallbackEmail` audience `staff` with `patient` | Signed email boundary assertion receives `patient`. | Caught; test red. Reverted. |
| Current candidate operator alert Telegram/MAX branches omit their audience | Public signed route test expects `staff`; Telegram and MAX assertions fail, email passes. | Caught; 2 red / 1 green. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; dependencies installed. |
| `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/shared-contracts run build && pnpm --dir packages/error-tracking run build && pnpm --dir packages/platform-merge run build` | Passed. |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | Passed; both DEV/TEST privilege and allowlist artifacts match declaration byte-for-byte. |
| `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` | Passed. |
| `pnpm --dir apps/integrator typecheck` | Passed. |
| `pnpm --dir apps/webapp typecheck` | Passed. |
| Scoped integrator/webapp ESLint over candidate production files and audit tests | Passed. |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | Passed; owner-aware rollback-only preflight validated 2 pending migrations and rolled back. No migration applied. |
| Existing targeted integrator suites (`runtimeConfig`, `dispatchPort`, `sendEmailRoute`, booking empty-audience, Telegram/MAX webhook) | Passed: 67 tests. |
| `pnpm --dir apps/integrator exec vitest run src/integrations/telegram/longPolling.test.ts` | Passed: 1 test. |
| Existing targeted webapp suites (patient-message staff notification, specialist reminders, email adapter, operator fallback) | Passed: 6 tests. |
| `pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare/operatorAlertRelayRoute.audience.route.test.ts` | Expected red finding: 2 failed / 1 passed. |
| `git diff --check` | Passed for audit worktree changes. |
| `git diff --check 51b4adb87..8aac60e20` | Reports one pre-existing candidate documentation whitespace error: `.lead/briefs/clinic-branded-bots-worker-20260909.md:86: new blank line at EOF`; not a product finding. |

## Audit test rationale

- `operatorAlertRelayRoute.audience.route.test.ts` is a public signed-boundary test. Its independent oracle is `TPB-12b`/`TPB-13a`; the silent expensive failure is a staff operator alert being dispatched from TherapyGo; the observable result is the typed audience reaching the only dispatch port. The candidate itself is the fault injection.
- The two added staff inbound route cases use the public webhook boundary. Their independent oracle is the owner rule that staff inbound traffic must authenticate and parse under Therapysto, never create a patient surface; the observable result is the staff gateway context and rejected TherapyGo secret. Their one temporary context-crossing mutation was caught and reverted.
- The adjusted fallback-email assertion is the existing signed inter-app boundary test, not a test of an internal helper. Its independent oracle is `TPB-13a`; the staff-to-patient mutation was caught and reverted.

## Verdict

**FAIL — not land-ready.** Findings 1 and 2 are reachable violations of the owner audience boundary. Live credentials, provider delivery, TEST rollout and `TPB-12a`/`TPB-12b`/`TPB-13a` remain intentionally unclaimed.
