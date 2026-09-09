# Platform delivery audience split — acceptance audit

- Candidate: `87e7cb0ac40658d9a13af467d0b47f64f209d33e`
- Base: `4426f8621a238b1c209f04a06d8b0995e74d3217`
- Scope authority: `IMPLEMENTATION_PLAN.md` §1.5; `TPB-12a`, `TPB-12b`, `TPB-13a`, and `C3`.
- Classification: mixed — repeated dispatch/settings behavior requires behavioral proof; the migration and rights declaration require inspection.

## Blind behavioral kill-set

Written before reading existing tests. Oracle: the owner requirement that patient intent never uses a Therapysto credential and staff intent never uses a TherapyGo credential.

1. A staff operational notification uses a TherapyGo SMTP, Telegram, or MAX credential.
2. A patient notification or authentication intent uses a Therapysto platform credential.
3. A verified clinic credential is used for staff, or a clinic credential from another organization is selected.
4. A patient without a ready clinic override cannot use TherapyGo; a selected ready clinic override falls back to platform after provider failure.
5. A caller bypasses the typed common dispatch selector and manually chooses a platform secret/provider.
6. Global settings permit one shared credential only, expose a restricted secret to browser/log/audit, or permit a clinic admin to mutate a global credential.
7. A queued or relayed message loses audience before provider dispatch and becomes ambiguous.
8. The migration creates another settings store, writes an active secret/default, changes grants directly, or fails to leave app roles able to read restricted settings by the sanctioned path.
9. Existing patient clinic SMTP/bot behavior or disabled-integration behavior regresses.

## Inspection evidence

### Test or view

| Owner item | Classification | Evidence |
| --- | --- | --- |
| `TPB-12a` patient default and verified clinic override | repeated dispatch behavior | One `dispatchPort` appends the audience at the common adapter seam. Patient is the fail-closed default; clinic credentials are resolved before the platform adapter and remain `clinic_if_configured`. The existing targeted `dispatchPort` and relay-route suites pass. |
| `TPB-12b` staff sender split | repeated dispatch behavior | The common `platformDeliveryAudience` selector maps staff to Therapysto and patient to TherapyGo; the final email/Telegram/MAX adapters alone resolve provider configuration. Booking lifecycle and durable specialist-task materialization set `audience: 'staff'`. The patient-message MAX producer does not. |
| `TPB-13a` SMTP split | repeated dispatch behavior | Queued specialist-task email carries `audience: 'staff'`, but the active clinic-invite path reaches `sendEmailSetupLinkViaIntegrator` → `/api/bersoncare/send-email` without an audience. The route resolves SMTP before dispatch with its default patient audience. |
| Global restricted settings | mixed | The six keys are `admin/global/restricted/secret_envelope` in the one `SYSTEM_SETTING_REGISTRY`, stored through the existing settings service. `GET` redacts client values; PATCH audit uses registry-driven secret redaction. The API admits platform global writes only under `platform.operations`; a clinic context gets `403 forbidden_global_setting` for all non-per-org keys. |
| Migration and rights | one-time action | The only changed object is `app.read_integrator_provider_runtime_setting(text)`, rehomed under `app_seam_settings_integrator_owner`; it adds fixed allowlist keys while reading the existing `public.system_settings` columns. It creates no table/store, inserts no default/secret, and contains no grant/revoke. The candidate DEV rollback-only preflight fails before completion with `ERROR: permission denied for schema app` under that owner. |

The exact producer paths inspected were:

- booking staff notification: `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts` (`sendDoctorMessage`) — Telegram and MAX include `audience: 'staff'`;
- patient message to staff: `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts` — Telegram includes `audience: 'staff'`; MAX does not;
- specialist task reminder: the live DI path is `buildAppDeps` → `prepareSpecialistTaskReminderDeliveries` → durable `outgoing_delivery_queue`; Telegram, MAX and email preserve `audience: 'staff'` inside the stored intent. The older `notifySpecialistTaskReminder` has no production call site.

### Reachable findings

1. **FAIL — staff MAX patient-message notifications use TherapyGo.** `notifyDoctorPatientMessageToStaff` sends its MAX relay without `audience: 'staff'`; `resolvePlatformDeliveryAudience` treats an unmarked message as patient. A doctor receiving a patient message through MAX therefore uses the TherapyGo credential. The added acceptance assertion is red on the exact candidate for both message topics.
2. **FAIL — staff clinic-invite email uses TherapyGo SMTP.** The active clinic invite route calls `sendEmailSetupLinkViaIntegrator`, whose signed `/api/bersoncare/send-email` body has no audience. That route resolves SMTP with the default patient audience and dispatches an unmarked email, so a staff invite silently uses the TherapyGo transport instead of Therapysto.
3. **FAIL — migration cannot pass the sanctioned owner-aware DEV preflight.** `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` reaches the candidate statement as `app_seam_settings_integrator_owner` and fails `permission denied for schema app`. No migration was applied; the wrapper's preflight transaction rolls back. Until this is made preflightable by the canonical declaration/reconcile path, the new restricted read capability cannot be accepted.

No other finding is asserted: no live credential, provider delivery, TEST rollout, or migration execution was attempted.

## Validation commands and results

| Command | Result |
| --- | --- |
| `git diff --find-renames --find-copies --no-ext-diff 4426f8621... 87e7cb0...` | Complete candidate diff inspected: 24 files, 556 additions and 166 deletions. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/integrations/runtimeConfig.test.ts src/infra/adapters/dispatchPort.test.ts src/integrations/bersoncare/relayOutboundRoute.route.test.ts"` | After replacing forbidden legacy-key expectations, 57 tests passed. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts src/modules/specialist-tasks/prepareReminderDeliveries.test.ts"` | 3 passed, 2 failed: both staff MAX assertions expose finding 1. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp typecheck"` | Passed after building required workspace packages. |
| Scoped ESLint command below, run through `/home/dev/brain/host-orch/run-tests.sh` | Passed, rc=0. |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | Failed as finding 3; rollback-only preflight, no DB apply. |

An initial locked test command could not resolve `vitest` before `pnpm install --frozen-lockfile`; after the install, required workspace packages were built locally. These setup failures are not candidate findings.

Exact scoped ESLint command:

```bash
pnpm --dir apps/integrator exec eslint src/config/smtpOutbound.ts src/infra/adapters/dispatchPort.ts src/infra/adapters/integrationRuntimeConfig.ts src/infra/adapters/platformDeliveryAudience.ts src/infra/db/publicSystemSettings.ts src/integrations/bersoncare/bookingLifecycleRoute.ts src/integrations/bersoncare/relayOutboundRoute.ts src/integrations/email/deliveryAdapter.ts src/integrations/max/deliveryAdapter.ts src/integrations/telegram/deliveryAdapter.ts src/integrations/runtimeConfig.test.ts && pnpm --dir apps/webapp exec eslint src/app/api/admin/settings/route.ts src/app/app/admin/app-settings/page.tsx src/app/app/settings/EmailSmtpSection.tsx src/app/app/settings/PlatformDeliveryBotsSection.tsx src/app/app/settings/adminSettingsData.ts src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts src/modules/messaging/outboundMessageQueuePort.ts src/modules/messaging/relayOutbound.ts src/modules/specialist-tasks/prepareReminderDeliveries.ts
```

## Fault injections

- **Credential-crossing selector:** temporarily swapped the Telegram staff/patient keys in `platformDeliveryAudience.ts`; the owner-grounded runtime-config acceptance set failed 4 assertions. The change was reverted; the set then passed 15/15.
- **Patient-message MAX staff audience:** the candidate itself is the fault injection: the added public relay-boundary assertion requires `audience: 'staff'` and fails 2/2 parametrized cases on the untouched candidate.
- **Migration rights:** the sanctioned owner-aware preflight is the fault probe and fails at the candidate function statement with `permission denied for schema app`.

## Tests changed by this audit

- Changed `apps/integrator/src/integrations/runtimeConfig.test.ts`: replaces the obsolete single legacy platform credential expectations with TherapyGo-patient and Therapysto-staff credential scenarios. Independent oracle: §1.5 / `TPB-12b`; expensive silent failure: a configured audience silently resolves a different brand; observable consequence: the provider adapter is disabled for the intended audience. The temporary swapped-key fault makes it red.
- Changed `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts`: asserts the MAX relay boundary carries staff audience. Independent oracle: §1.5 / `TPB-12b`; expensive silent failure: a staff recipient receives a patient-brand message; observable consequence: TherapyGo credential selection. The candidate itself makes it red.
- Deleted: none.

## Migration / rights verdict

**FAIL.** The SQL obeys the no-grant/no-secret/no-second-store rules and declares the correct existing seam owner, but its required owner-aware preflight does not execute. The declaration identifies `app_seam_settings_integrator_owner` as a seam owner and the provider-read function as executable by `app_service`; the actual named DEV preflight nevertheless lacks usable `app` schema access at the statement. This must be corrected through the sanctioned privilege declaration/reconcile mechanism, not a migration grant.

## Verdict

**FAIL** — three reachable owner-scope failures above. This verdict does not assess live provider delivery, real credentials, or TEST rollout; each remains a separate runtime gate.
