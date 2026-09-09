# Final platform delivery audience audit (#787) — correction acceptance

- Corrected candidate: `e459751332c882440c8bcfc080e76480cc9e7b12`
- Prior failing audit: `76e0cd016`
- Status: **PASS — FOR LAND** for the two corrected audience-boundary findings.

## Authority and scope

Owner decision 09.09 in `IMPLEMENTATION_PLAN.md` §1.5 and `TPB-12a`/`TPB-12b`/`TPB-13a`: TherapyGo is the patient identity and Therapysto is the staff identity. Legacy Telegram/MAX settings are a patient-facing TherapyGo cutover fallback; staff must use only its own token/key, webhook secret and Telegram mode.

This acceptance reuses the prior audit oracle and checks only its two findings. It does not claim credentials, provider calls, TEST delivery or completion of the still-open live gates in `TPB-12a`, `TPB-12b` and `TPB-13a`.

## Test or view

| Finding class | Proof | Result |
| --- | --- | --- |
| Signed operator Telegram/MAX alert reaches dispatch as staff | Existing public signed Fastify route oracle | PASS: Telegram, MAX and email all reach the dispatch side effect with `audience: 'staff'`. |
| Runtime read of one audience does not fetch the other audience credential | One-time final-diff/source view | PASS: `readTelegramRuntimeConfig` and `readMaxRuntimeConfig` now fetch only `platformCredentialKey(audience, ...)`, their own webhook setting and permitted patient legacy settings. The peer-credential lookup and `oppositeAudience` helper are removed. |

The second item is deliberately a view, not a key-list test: an assertion about private runtime queries would duplicate implementation rather than prove the public delivery contract.

## Retained and corrected test evidence

- `operatorAlertRelayRoute.audience.route.test.ts` is retained unchanged. Its independent oracle is `TPB-12b`/`TPB-13a`; the expensive silent failure is a signed staff alert being dispatched through patient/TherapyGo. The observable terminal side effect is the typed audience at the sole dispatch boundary. The prior candidate's missing Telegram/MAX audience made its two assertions red; the corrected candidate is green.
- `runtimeConfig.test.ts` changes only the existing Therapysto Telegram/MAX fixtures and their existing disabled-configuration setup. Staff now supplies `therapysto_*` secret/mode values, never legacy `telegram_*`/`max_*` values. Its independent oracle is the owner audience split. The expensive silent failure is a staff bot appearing configured from TherapyGo settings, causing staff delivery/authentication to use the wrong identity or fail after rollout. The public observable is the runtime result (`enabled`, and Telegram's configured `webhook` mode) and, when the staff-owned secret is removed, no adapter dispatch occurs.

No test file or independent test class was added. No production code was changed by this acceptance.

## Validation

| Command | Result |
| --- | --- |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/integrations/runtimeConfig.test.ts src/integrations/bersoncare/operatorAlertRelayRoute.audience.route.test.ts"` | PASS — 2 files, 18 tests. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator typecheck && pnpm --dir apps/integrator exec eslint src/infra/adapters/integrationRuntimeConfig.ts src/integrations/bersoncare/operatorAlertRelayRoute.ts src/integrations/runtimeConfig.test.ts src/integrations/bersoncare/operatorAlertRelayRoute.audience.route.test.ts && git diff --check"` | PASS. |

No full CI, Next runtime, migration execution, DEV/TEST mutation or provider request was run.

## Verdict

**PASS — FOR LAND.** Both previously reachable findings are closed on `e45975133`; no remaining finding exists within this correction scope. The separately required credential and live-provider TEST gates remain open by owner plan.
