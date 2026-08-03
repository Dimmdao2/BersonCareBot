# D27-A2 — independent email enumeration audit

Candidate: `04ae70531` (`wt/trackd-d27a2-email-enumeration`).

## Oracle

For every syntactically valid public request, the caller must not learn whether the email belongs to an account
from status, body shape, provider outcome, response-time class, or resend/cooldown behavior. Invalid syntax may
remain `400`; abuse controls must remain effective. A real delivered challenge must keep its existing
confirmation/session/attempt semantics.

## Pre-inspection blind kill-set

Recorded before reading the candidate diff, implementation, or candidate tests.

| ID  | Test or view                                      | Named fault to kill                                                                                                                                                                               | Acceptance evidence                                                                                                                                        |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Route/service behavior test                       | Known, unknown, provider-success, provider-throw, or provider-false requests expose different public status/schema, including `email_send_failed` or an equivalent provider error.                | Equal public status and exact response-key/type shape for all valid non-rate-limited variants; forbidden provider error absent.                            |
| K2  | Route behavior test with controlled time/provider | A provider delay beyond the nominal `500 ms` floor makes only a known email finish in a slower response-time class because the known path awaits the provider while unknown returns at the floor. | Known delayed-provider and unknown requests complete in the same bounded public timing class; targeted injection that restores known-only await is caught. |
| K3  | Route/service behavior test                       | The second start/resend request or pre-existing cooldown/rate-limit state distinguishes known from unknown.                                                                                       | Equivalent second-request and existing-state public behavior for known and unknown while abuse bounds still apply to both.                                 |
| K4  | Behavior test plus log inspection                 | Provider throw/false escapes publicly, leaves no operator evidence, or logs email/OTP PII.                                                                                                        | Throw and false are contained; server/operator evidence remains; captured logs contain neither submitted email nor OTP.                                    |
| K5  | Route/service behavior test                       | Fake and real responses differ in `challengeId`/retry schema or UUID shape, or the closure breaks real challenge confirmation/session/attempt behavior.                                           | Same schema and UUID validity for fake/real; existing real delivered-challenge confirmation/session/attempt acceptance remains green.                      |
| K6  | Route/service behavior test                       | Neutralization weakens invalid-email rejection or limiter/cooldown behavior, or bounds only known accounts.                                                                                       | Invalid syntax remains `400`; repeated/existing limiter state bounds both known and unknown inputs without an account oracle.                              |
| K7  | Diff and call-graph inspection                    | The slice regresses the recent provider principal/runtime fix or introduces a durable queue, migration, identity change, or unrelated auth/D30/tariff/CMS change.                                 | Candidate diff stays within email-OTP start/observability/tests/D27 docs and preserves the provider principal/runtime path.                                |
| K8  | Targeted fault injection                          | Candidate tests stay green when the route again returns provider `503`, removes timing neutralization, leaks cooldown state, or emits PII.                                                        | Each independent authority fault is killed by a red acceptance assertion; every production mutation is reverted.                                           |

## Execution evidence

### Findings

1. **MUST FIX — delayed provider remains a timing oracle.** The route records `startedAt`, then awaits
   `startPublicEmailOtpChallenge`; the `500 ms` helper only waits the remaining part of the floor. With a controlled
   `1,500 ms` provider, the known response resolved `1,000 ms` after the unknown response. A caller can classify a
   known address by response time. This violates D27-A2 item 1 and K2.
2. **MUST FIX — resend cooldown remains a direct account oracle.** A delivered known challenge creates email
   cooldown state. On the second request the service returns `rate_limited`, which the public route exposes as
   `429`; an unknown address creates no durable challenge/cooldown and its second request remains neutral `200`.
   The independent per-IP limiter still allows ten requests per minute, so it does not mask the second-request
   distinction. This violates the public oracle and K3.
3. **MUST FIX — a rejected provider/service promise escapes the public route.** The route awaits the service without
   containment. A rejection on the known-only provider path rejects the handler, while unknown returns neutral
   `200`; no safe operator event is emitted. This violates K1/K4.

### Kill-set result

| ID  | Result | Evidence                                                                                                                                                                                              |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | FAIL   | Returned provider failure is neutral and a temporary `503 email_send_failed` mutation was killed, but a rejected provider promise escapes (finding 3).                                                |
| K2  | FAIL   | The nominal floor and its removal mutation are covered, but the controlled delayed-provider acceptance test measures a `1,000 ms` known/unknown delta (finding 1).                                    |
| K3  | FAIL   | Stateful first/second-request acceptance: second known response is `429`, second unknown response is `200` (finding 2).                                                                               |
| K4  | FAIL   | Returned-failure log is fixed-shape/no-PII and a raw-email log mutation was killed; rejected provider path has neither containment nor operator evidence.                                             |
| K5  | PASS   | Real/fake results keep the same keys and UUID shape; a non-UUID fake mutation was killed. Start-only diff leaves confirm/session/attempt code unchanged; targeted service + confirm route tests pass. |
| K6  | PASS   | Invalid syntax remains `400`; the independent IP limiter remains before the service and its weakened-status mutation was killed. It applies before account lookup for every input.                    |
| K7  | PASS   | Candidate changes exactly five allowed files, no DB/migration/queue/integrator/D30/tariff/CMS path. `4054417ea` is an ancestor and its integrator principal files are unchanged.                      |
| K8  | FAIL   | **Killed: 5/5** temporary injected regressions. **Uncaught by candidate product: 3/3** authority scenarios, now represented by red acceptance tests. All production mutations were reverted.          |

### Exact commands and counts

Setup and baseline:

```bash
pnpm install --frozen-lockfile
# exit 0

pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/emailOtpPublic.unit.test.ts
# before auditor acceptance additions: 2 files passed, 6 tests passed, exit 0
```

Acceptance run on the unchanged candidate product:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts
# 1 file failed; 3 failed, 3 passed; exit 1
# uncaught: delayed provider timing, provider throw, second-request cooldown
```

Preserved real-challenge/session path:

```bash
pnpm --filter @bersoncare/db-principal build
# exit 0 (required worktree build artifact)

pnpm --dir apps/webapp exec vitest run src/modules/auth/emailOtpPublic.unit.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts
# 2 files passed, 4 tests passed, exit 0
```

Targeted fault injection (each production mutation was applied temporarily, the command was run, and the mutation
was reverted immediately):

| Injected fault                                                       | Exact command                                                                                                                                                                         | Result                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Restore public `503 email_send_failed` for returned provider failure | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts -t "returns the same neutral public schema"`                                             | killed: 1 failed, 5 skipped, exit 1 (`[200,200,200,503]`)            |
| Remove the `500 ms` response floor                                   | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts -t "does not resolve a valid non-rate-limited request before the public response floor"` | killed: 1 failed, 5 skipped, exit 1 (`settled=true` at 499 ms)       |
| Add raw submitted email to provider-failure log                      | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts -t "returns the same neutral public schema"`                                             | killed: 1 failed, 5 skipped, exit 1 (captured log contained `email`) |
| Replace unknown fake UUID with `fake-challenge`                      | `pnpm --dir apps/webapp exec vitest run src/modules/auth/emailOtpPublic.unit.test.ts -t "keeps known and unknown valid email results"`                                                | killed: 1 failed, 2 skipped, exit 1                                  |
| Weaken the per-IP limiter response from `429` to `200`               | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts -t "keeps invalid-email and IP rate-limit semantics unchanged"`                          | killed: 1 failed, 5 skipped, exit 1                                  |

Structural inspection:

```bash
git diff --name-only 04ae70531^ 04ae70531
# exactly: start route, route test, emailOtpPublic service, service test, D27 WORK_ORDER

git diff --exit-code 04ae70531^ 04ae70531 -- apps/webapp/src/app/api/auth/email-otp/confirm apps/webapp/src/modules/auth/emailAuth.ts apps/webapp/src/infra/repos/pgEmailOtpPublic.ts apps/webapp/db
# exit 0: confirm/session/attempt implementation and DB/migrations unchanged

git merge-base --is-ancestor 4054417ea 04ae70531
# exit 0

git diff --exit-code 4054417ea 04ae70531 -- apps/integrator/src/infra/db/authChannelPolicy.ts apps/integrator/src/infra/db/authChannelPolicy.test.ts
# exit 0: recent principal/runtime fix unchanged
```

Final test-artifact checks:

```bash
pnpm --dir apps/webapp typecheck
# exit 0

pnpm --dir apps/webapp exec eslint src/app/api/auth/email-otp/start/route.route.test.ts
# exit 0

pnpm exec prettier --write apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts docs/_TODO/runs/integrator-cleanup/D27A2_EMAIL_ENUMERATION_AUDIT_2026-08-03.md
# exit 0

git diff --check
# exit 0

git diff -- apps/webapp/src/app/api/auth/email-otp/start/route.ts apps/webapp/src/modules/auth/emailOtpPublic.ts
# empty: all production fault injection reverted
```

## Verdict

**FAIL — 3 reachable enumeration paths remain.** The worker must make the three committed acceptance tests green;
the auditor did not change product code.
