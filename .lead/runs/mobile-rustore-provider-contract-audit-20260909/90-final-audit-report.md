# Final audit report — RuStore Universal Push provider contract #915

## Verdict

**PASS.** Candidate `7e184ec73d1a1beb34540d78e5ba0b8b8daa18a4` (`fix(push): use RuStore Universal API wire contract #915`) was audited against base `bd897e9f75dc11089e4be2c5d139ef0705e0a71d`.

`git diff --exit-code 7e184ec73 -- apps/integrator/src/integrations/web-push/rustoreUniversalClient.ts` produced no output after fault injection, proving the candidate production file was restored exactly. No product fix was made.

## Contract oracle

The current official [RuStore Universal Push API](https://www.rustore.ru/help/sdk/general-push-notifications/send-push-notifications/api) specifies `POST https://vkpns-universal.rustore.ru/v1/send`, `providers`, `tokens`, and `message`; RuStore provider credentials are `project_id` and `auth_token`, while tokens are grouped by provider. It documents provider errors as `errors` strings and distinguishes `invalid auth token` from `invalid tokens`. The current [official examples](https://www.rustore.ru/help/sdk/general-push-notifications/send-push-notifications/examples) show the same nested topology and `Content-Type: application/json`. Both were read directly on 2026-09-09.

This matches the plan oracle: `MASTER_PLAN.md` M6-03/M6-05/M6-06/M6-08/M6-09/M6-11 and its direct-SDK decision in M6-04. The blind kill-set was saved before existing tests were opened in `00-blind-killset.md`.

## Behavioral evidence

Added public boundary suite `rustoreUniversalClient.contract.test.ts`; corrected only retained fan-out/final-surface fakes to read `message.data` and use official provider error bodies.

Kill tally: **5/5 independent fault classes caught; 0 uncaught.**

| Fault injected temporarily into production client | Failing assertion |
| --- | --- |
| Direct bearer header plus flat direct-RuStore body | `expect(init.headers).not.toHaveProperty('Authorization')` |
| Swapped project ID and selected target token | exact nested Universal JSON `toEqual` |
| `invalid auth token` classified as `invalid_token` | typed result expected `code: 'provider_error'` |
| Official `rustore: invalid tokens ...` ignored | expected `code: 'invalid_token', invalidToken: true`; composite deactivation was also 0 instead of 2 |
| Timeout cleanup removed | `expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)` |

The final green suite proves default endpoint/header/body topology, typed data propagation, success, validation/auth/internal/provider/network outcomes, exact invalid-token classification and composite target-only idempotent deactivation. It exposes neither test token nor test credential in the returned provider error.

## Validation

All commands ran from this candidate worktree and completed successfully:

```bash
pnpm --dir apps/integrator exec vitest run \
  src/integrations/web-push/rustoreUniversalClient.contract.test.ts \
  src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts \
  src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts
# 3 files passed, 23 tests passed

pnpm --dir apps/integrator typecheck
pnpm --dir apps/integrator build
pnpm exec eslint \
  apps/integrator/src/integrations/web-push/rustoreUniversalClient.contract.test.ts \
  apps/integrator/src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts \
  apps/integrator/src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts
git diff --check
```

No full CI was run: this is a bounded integrator provider-boundary test correction with direct targeted evidence, not an uncovered repo-level integration risk.

## External delivery boundary

No real RuStore credentials, device tokens, provider requests, DEV/TEST data, deployment, or PROD access were used. A real device/provider delivery check remains intentionally unavailable to this audit without owner-authorized credentials and a device; it is not required for this mocked public wire-contract gate.
