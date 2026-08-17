# Systemic final correction integration — 2026-08-17

## Scope and result

- Base candidate: `a1d4037dbc8c7409d1048548c9a32d9bd9372ed3`.
- Independent audit A: original `9ae89faa8dfa17f2f35d6541c5f5dbee6cbd4610`, mapped
  as `4d7b6c1b0`; verdict `FAIL`, 7 killed / 0 unhandled fault classes.
- Independent audit B: original `d9c77d568e06b4a87b30b3c368030a7ad16d9730`, mapped
  as `5e7ee1f75`; verdict `FAIL`, 8 killed / 1 surviving fault class.
- Corrections integrated without conflicts:
  - greeting and clinic SMS fallback: original `573fe01927da652bc60375986a3b3f26b49d02f6`,
    mapped as `5f91faaa7`;
  - trusted manual-invoice refusal provenance: original
    `b45cb85c962227af34ddb134f3458a569d6d266b`, mapped as `f0b03e215`;
  - playback DB boundary and positive chart-size gate: original
    `6fd750b048db5a9fd667ca04fbe9a69c93f22625`, mapped as `e76212ff7`.
- All four product/repository findings from the two audits are corrected and their saved acceptance
  oracles are green on the combined tree.
- No DB, DEV, TEST, PROD, env, provider, deploy or push action was performed in this integration
  stage.

## Combined acceptance

Fresh-clone dependencies were installed with `pnpm install --frozen-lockfile`; the lockfile did not
change. Workspace package prerequisites were built, then the union of the audit acceptance and
correction tests was run through the repository test mutex:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-systemic-final-correction-20260817 && pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts src/app/api/doctor/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts src/modules/system-settings/platformGlobalFallback.unit.test.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts src/infra/repos/pgPlaybackUserVideoFirstResolve.unit.test.ts src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts src/shared/ui/charts/PositiveSizeResponsiveContainer.unit.test.tsx src/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection.ui.test.tsx src/app/app/patient/treatment/postProgramItemComplete.unit.test.ts src/infra/repos/pgPatientBookings.patientCapability.unit.test.ts src/app/api/admin/commercial/route.route.test.ts src/app/api/doctor/booking-engine/_doctorAppointmentMutationScope.route.test.ts src/app/api/doctor/booking-engine/appointments/manual/route.route.test.ts src/app/api/admin/booking-engine/form-fields/route.route.test.ts"
```

Result: exit `0`; **17 files / 66 tests passed**.

## Full integration CI

The combined DI/settings/billing correction creates a concrete cross-surface integration risk, so
the full repository CI was run once on the final combined tree:

```bash
ALLOW_FULL_CI=1 /home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-correction-20260817 && pnpm run ci 2>&1 | tee /tmp/bcb-systemic-final-correction-ci-20260817.log"
```

Result: exit `0`, mutex duration **651 seconds**.

- Root and webapp lint passed, including `check-db-chokepoint`, raw-SQL production debt `0`, infra
  import boundary, transaction-quota boundary, B0 baseline, migration layout/journal sync and media
  upload door self-tests.
- All workspace typechecks passed.
- Integrator: **79 files passed / 4 skipped; 399 tests passed / 2 expected-fail / 15 skipped**.
- DB principal: **28/28 passed**.
- Webapp: **321 files passed / 2 skipped; 1417 tests passed / 6 skipped**.
- Media worker: **5 files / 16 tests passed**.
- Integrator build and production Next build passed; static generation completed **407/407**.
- SaaS DB regression, smoke-contract/self-test and dependency registry audit passed.

The successful Next build emitted one non-fatal NFT warning for a broad file trace rooted at
`next.config.ts -> mediaPreviewWorker.ts`; the build, TypeScript, static generation and CI all
remained green. It is recorded as an observation and is not treated as a finding because neither
auditor produced a reachable broken behavior from it.

## Gate

The static/audit correction stage is `PASS`. The next authorized stage is safe integration into the
named DEV worktree, B0-forward DEV migration only, then the full live DEV traversal. TEST remains
strictly after a fully green DEV. Provider-side credential rotation/revocation evidence remains an
external blocker for push/deploy; no ignore was added and no push/deploy was attempted.
