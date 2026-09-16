# Тест или взгляд

The repeatable HTTP wire contract, response classification and target deactivation outcome are behavioral and
belong in public provider-boundary tests. The fact that the official RuStore documentation currently names one
endpoint/schema is inspected and cited in the audit artifact; do not write a test that scrapes documentation or
source text.

# Auditor-live brief — #915 RuStore Universal Push provider wire contract

Independently audit the exact committed correction to `rustoreUniversalClient.ts`. Product code is read-only. You
may add/commit only stable behavioral acceptance-test corrections/additions and
`.lead/runs/mobile-rustore-provider-contract-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}`. Do not
fix product code, touch webapp/schema/migrations/Android/PWA/Jitsi/media, use real credentials, send real push,
write DEV/TEST data, deploy or access PROD.

## Mandatory reading and authority

Run the AGENTS.md heading map and read the global decision method, §1/§1b, §2–§5, §9–§12 and §24 fully,
with §10a/§10b before tests. Read `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6-03/M6-05/M6-06/
M6-08/M6-09/M6-11 and exact base→candidate diff. Read the official current RuStore Universal Push API page and
examples directly:

- `https://www.rustore.ru/help/sdk/general-push-notifications/send-push-notifications/api`
- `https://www.rustore.ru/help/sdk/general-push-notifications/send-push-notifications/examples`

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Kotlin plugin интегрирует RuStore
Universal Push SDK напрямую (без временной direct-RuStore реализации)». Server delivery therefore uses
the matching Universal Push API contract, not the separate direct-RuStore API shape.

Before reading existing tests, persist the kill-set below. Existing fetch mocks are evidence, not authority: if
they encode the superseded direct shape, correct them to observe the accepted Universal provider boundary rather
than reverting product behavior to make stale tests green.

## Blind behavioral kill-set

1. One provider request is `POST https://vkpns-universal.rustore.ru/v1/send` by default (or the already validated
   configured endpoint) with `Content-Type: application/json` and no bearer/direct-API Authorization header.
2. The exact JSON topology is `providers.rustore.{project_id,auth_token}`, `tokens.rustore:[token]`, and
   `message.data`; legacy top-level `projectId`, flat `tokens`, flat `data`, and direct-API bearer auth are absent.
3. All typed route/surface/kind data reaches `message.data` unchanged; the request contains only the one selected
   RuStore token/provider and never logs or returns credentials/token.
4. HTTP success returns `{ok:true}`. Validation/auth/internal/provider failures return typed provider error without
   target deactivation.
5. The official provider error vocabulary `errors: ['rustore: invalid tokens ...']` for this one-token request
   returns exactly `invalid_token`/`invalidToken:true`, so the existing composite adapter deactivates only that
   target idempotently. `invalid auth token` and other provider strings must not deactivate a target.
6. Network failure/timeout is a non-secret provider error; timeout cleanup does not leak a later completion into
   another send.

## Tests, fault injection and delivery

Test through `sendRuStoreUniversalPush` and the existing composite provider seam. Update the two retained
final-surface/fan-out fetch fakes only as needed to read `message.data` and official error bodies; do not weaken
their route/security assertions. Add one compact provider-contract suite if no current public suite proves the wire
schema. Assert observable request/body/result/deactivation, not private helper calls or source strings.

Temporarily inject and restore: direct bearer/flat body; swapped project/token; invalid-auth misclassified as invalid
token; official invalid-token error ignored; timeout cleanup removed. Record the exact failing assertion for each
class. Run the targeted provider/fan-out/final-surface suites, integrator build/typecheck, scoped ESLint and
`git diff --check`; do not run full CI. Commit only justified tests and the two audit artifacts with explicit paths,
never `git add -A`; do not push. Return binary PASS/MUST FIX, kill tally, exact commands/SHA and factual external
RuStore credential/device blockers. Restore every production mutation and do not finish while a foreground command
is running.
