# Client boot watchdog slow-DEV correction: independent final audit (2026-08-17)

## Scope

- Candidate: `8330cc7253d3d6828c279ad8b6492280eacee29f`.
- Parent/base: `041092b27a5998b958a279d19da64fb618decaf1`.
- Fresh clone and branch:
  `/home/dev/dev-projects/bcb-wt-client-boot-watchdog-slow-dev-audit-20260817`,
  `wt/client-boot-watchdog-slow-dev-audit-20260817`.
- Authority: `AGENTS.md` §9–§11 and §24, full
  `docs/_TODO/UNSUPPORTED_CLIENT_FALLBACK_PLAN.md`, and the bounded final-audit brief.
- Audit only: no product fix, live DEV, database, TEST, PROD, deploy, or migration action.

## Verdict

**PASS.** No reachable owner-scope defect remains in the exact candidate. In development the generated classic
watchdog has no elapsed-time failure timer, so a 180-second or unbounded healthy Next compilation neither hides the
active entry nor reveals/reports the unsupported-client fallback. A later module acknowledgement and React mount
leave/restore the healthy DOM state. Production still arms the existing 10-second timer and preserves the
no-module, captured `SyntaxError`, module-executed-without-mount, and healthy-mount behaviors.

The environment choice is server-owned: `AppEntryRsc` passes
`failureTimeoutEnabled={env.NODE_ENV === 'production'}`. It is not derived from a query, cookie, browser value, or a
new environment variable. `env.NODE_ENV` remains the existing validated `development | test | production` server
contract, and the canonical standalone runner uses `production`; the canonical `next dev` runner uses
`development`.

The six-file candidate does not change the report route, payload, rate limiter, logging, feature flag, supported
client matrix, messenger timeouts, system-health, registration-failure, error-audit, or operator-health code. The
`tg` / `max` / `browser` surface selection is unchanged. The classic script gains only an ES5-safe nullable config
value and conditional `setTimeout`; no module syntax, dependency, browser-provided switch, raw identifier, or
telemetry field was added.

## Blind kill-set and evidence

| Reachable break | Required observation | Evidence |
| --- | --- | --- |
| DEV timer is accidentally re-enabled | At 180 seconds fallback stays hidden, active entry stays visible, no report is sent | DOM test; targeted mutation went red |
| Production timer is accidentally disabled | At 10 seconds no-module entry reveals fallback, hides active entry, sends the bounded report | DOM test; targeted mutation went red |
| Production captured syntax failure is lost | Report contains `capturedError=syntax_error` and `failureKind=module_never_executed` | DOM test |
| A loaded module that never mounts React is misclassified | Report contains `moduleExecuted=true`, `reactMounted=false`, `failureKind=module_executed_not_mounted` | Added acceptance case; targeted mutation went red |
| Healthy production mount does not cancel failure | After 60 seconds fallback remains hidden, active entry visible, no report | DOM test |
| SSR fallback starts visible before JavaScript | Exact fallback element has the `hidden` attribute in rendered markup | Strengthened acceptance assertion; targeted mutation went red |
| DEV/prod selection becomes client-controlled or a new env toggle | Public input could choose timeout behavior | Diff inspection: selection is only existing server `env.NODE_ENV` |
| Correction couples client compatibility to system failure/health or broadens telemetry | Error-audit/health count changes, new payload or persistence path | Exact six-file diff; none of those runtime paths changed |

Uncaught by the focused set: `0` named kill-set items.

## Independent acceptance additions

The audit extends the existing behavior test with:

1. the production `module_executed_not_mounted` branch required by the canonical plan;
2. an exact DOM assertion on the fallback element's SSR `hidden` attribute. The previous substring assertion could
   have matched `hidden` inside the inline script even if the fallback element itself became visible.

These are test-only changes; production code is unchanged by the auditor.

## Commands and results

```bash
pnpm --dir apps/webapp exec vitest run src/modules/auth/clientBootWatchdog.ui.test.tsx
```

Exit `0`: `1` file, `6` tests passed. The test executes the generated classic script with fake timers and DOM/XHR
boundaries; it does not inspect source strings.

```bash
pnpm --dir apps/webapp exec eslint \
  src/app/app/AppEntryRsc.tsx \
  src/app/app/PatientUnsupportedClientFallback.tsx \
  src/modules/auth/clientBootWatchdog.ts \
  src/modules/auth/clientBootWatchdog.ui.test.tsx
```

Exit `0`.

A direct webapp typecheck in the fresh clone first failed because the referenced workspace packages had not yet
been built (`@bersoncare/operator-db-schema`, `@bersoncare/db-principal`, `@bersoncare/platform-merge`,
`@bersoncare/error-tracking`). After building exactly those existing dependencies, the candidate typecheck passed:

```bash
pnpm --dir packages/operator-db-schema run build && \
pnpm --dir packages/db-principal run build && \
pnpm --dir packages/platform-merge run build && \
pnpm --dir packages/error-tracking run build && \
pnpm --dir apps/webapp typecheck
```

Exit `0`. The initial clean-clone dependency-order failure is outside this candidate and is not counted as a
watchdog finding.

## Fault injection

All mutations were temporary and restored before the audit commit:

- replacing the DEV `null` timeout with the production timeout made
  `never classifies a slow healthy development compilation as an unsupported client` exit `1` at the fallback
  visibility assertion;
- forcing the timeout to `null` in production made
  `shows and reports the production fallback when module never executed` exit `1` at the fallback visibility
  assertion;
- forcing every report to use `module_never_executed` made
  `reports a production module that executed but never mounted React` exit `1` on the exact failure kind;
- removing the SSR `hidden` attribute made
  `renders the fallback hidden in server markup before any script executes` exit `1` on the exact fallback element.

After restoration, the working tree contains only this report and the two intended acceptance-test improvements.
