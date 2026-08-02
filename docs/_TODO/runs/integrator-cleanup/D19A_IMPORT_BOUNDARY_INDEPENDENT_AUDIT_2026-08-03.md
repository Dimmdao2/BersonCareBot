# D19a — independent import-boundary audit

Authority: `AGENTS.md` §5, §10a–§10b, §24; `WORK_ORDER.md` D19a; audit brief
`runs/briefs/TRACK_D_D19A_IMPORT_BOUNDARY_AUDIT_BRIEF.md`.

## Verdict

**PASS.** This is an independent pass over product/evidence commit `15febe16b`, not an
acceptance of its evidence. The audit artifact and two acceptance scenarios are the only
changes from this pass. No DEV/TEST/PROD environment, migration, CMS, tariff/billing or D30
file was changed.

## Blind kill-set (written before reading tests)

| Named fault | Result |
| --- | --- |
| direct static import | killed by ordinary webapp lint and AST gate |
| aliased static import | killed by ordinary webapp lint and AST gate |
| type-only import | killed by ordinary webapp lint and AST gate |
| literal dynamic import | killed by ordinary webapp lint and AST gate |
| constant/computed dynamic import | killed by AST gate |
| re-export | killed by ordinary webapp lint and AST gate |
| relative-path import | killed by AST gate |
| auth session lookup/revocation, verified-email lookup, logout revocation, signed-entry and dev-bypass refresh bypass the port | not reachable: the six changed calls use `requireSessionUserPort()`; missing binding throws, with no infra fallback |
| reminder projection is not delivered to its injected port | killed by acceptance test |
| support delivery projection is not delivered to its injected port | killed by acceptance test |
| DB settings read failure becomes an answer or is cached | killed by existing config-adapter test |
| request/startup composition omits either new concrete binding | killed by acceptance test |

Unkilled independent classes: **0**.

## Structural review

`node scripts/check-webapp-infra-import-boundary.mjs` reports zero production findings over
`apps/webapp/src/modules/**` and `apps/webapp/src/app/api/**/route.ts`. The AST gate has no
debt allowlist and resolves alias, re-export, relative, literal and statically-computable dynamic
specifiers. A temporary module containing all seven named bypasses made `pnpm --dir apps/webapp
run lint` fail; direct ESLint diagnosed direct/alias/type/re-export/literal forms and the AST gate
reported all seven, including relative and computed dynamic forms. The temporary file was deleted.

The three former allowlist records are gone. `SessionUserPort`, `ReminderProjectionPort` and
`ConfigAdapterPort` contain only module-facing shapes; repository queries and business decisions
remain in their existing concrete adapters/services. `pgUserByPhonePort`, system-settings readers
and runtime-settings construction are imported only by app-layer composition files. The module
port slots throw while unbound; they do not instantiate Postgres or fall back to a direct infra
import.

`instrumentation.register()` binds both ports in its Node-runtime startup branch before request
handling. `_buildAppDeps()` calls both binders as its first composition step, covering request
composition and the ordinary test runtime. The dedicated acceptance test begins from an unbound
session port, proves the failure observable, then proves both composition roots install the exact
concrete adapters.

## Behavioural faults

The original auth paths retain their prior control flow: D19a replaces only the six repository
lookups with the module port. Session identity lookup remains fail-closed on unreadable/revoked
identity, OTP code paths are unchanged, and dev-bypass refresh still re-reads the canonical user.
Removing `bindSessionUserPort(pgUserByPhonePort)` made the composition acceptance test fail with
`SessionUserPort is not bound`.

Removing the system-settings binding made the same test fail with `ConfigAdapterPort is not
bound`. Replacing the config adapter's failed-read rejection with an empty value made
`configAdapter.unit.test.ts` fail four assertions, including the no-cache-after-failure contract.

The following acceptance scenarios were absent: the route test mocked the complete event handler,
so it could not observe either projection port. They were added to the existing
`events.diaryEntitlement.test.ts` file:

- a valid `reminder.rule.upserted` event reaches `upsertRuleFromProjection` with its canonical
  payload;
- a valid `support.delivery.attempt.logged` event reaches `appendDeliveryEventFromProjection` with
  its canonical payload.

For each scenario, temporarily disabling its actual `handleIntegratorEvent()` branch made its
assertion fail (`accepted: false`, `durable ingest is not implemented`). Both mutations were
removed.

## Executed checks

- `node scripts/check-webapp-infra-import-boundary.mjs` — PASS, exact production census `0`.
- `node scripts/check-webapp-infra-import-boundary.mjs --self-test` — PASS, `7` bypass forms
  rejected; canonical port consumer accepted.
- `pnpm --dir apps/webapp run lint` — PASS after temporary injection removal.
- `pnpm --dir apps/webapp exec vitest --run src/app-layer/di/importBoundaryBindings.unit.test.ts src/modules/integrator/events.diaryEntitlement.test.ts src/modules/system-settings/configAdapter.unit.test.ts src/app/api/integrator/events/route.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts` — PASS: `7` files / `34` tests.
- `pnpm --dir apps/webapp run typecheck` — PASS.
- `git diff --check` — PASS.
