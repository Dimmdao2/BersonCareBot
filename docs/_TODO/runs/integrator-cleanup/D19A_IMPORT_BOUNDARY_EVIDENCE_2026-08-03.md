# Track D D19a — final import-boundary recensus and structural closure

Authority: `AGENTS.md` §5, §24; `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D19a.

## Census

Command from the D19a brief, run before the change:

```bash
rg -n "@/infra/(db|repos)|import\\(['\"]@/infra/(db|repos)" \
  apps/webapp/src/modules apps/webapp/src/app/api \
  -g '!*.test.ts' -g '!*.test.tsx' -g '*.{ts,tsx}'
```

Its production rows were `modules/auth/service.ts` (six dynamic `pgUserByPhonePort`
imports), `modules/integrator/events.ts` (two infra-owned type imports), and
`modules/system-settings/configAdapter.ts` (`pgSystemSettings` readers plus
`pgAppRuntimeSettings` construction). The command also prints seven `*.test.ts` files because
its final inclusive glob re-includes them; those were never production allowlist entries.

After the change, the same command has no production row. This equivalent ordering makes the
test exclusion unambiguous and produced no output:

```bash
rg -n "@/infra/(db|repos)|import\\(['\"]@/infra/(db|repos)" \
  apps/webapp/src/modules apps/webapp/src/app/api \
  -g '*.{ts,tsx}' -g '!**/*.test.ts' -g '!**/*.test.tsx'
```

## Classification and removal

| Former file | Finding | Result |
| --- | --- | --- |
| `modules/auth/service.ts` | Domain/session code dynamically reached `pgUserByPhonePort` for session revocation, signed-entry lookup, verified email, logout and dev-bypass refresh. | Removed. `SessionUserPort` is module-owned and is bound to the canonical repository only by `app-layer/di/bindAuthModulePorts.ts`; both `buildAppDeps()` and Node instrumentation establish that composition boundary. Existing login/OTP/dev-bypass semantics keep the same canonical port calls. |
| `modules/integrator/events.ts` | The event module imported projection port types from infra. | Removed. `SupportCommunicationPort` was already public in `modules/messaging/ports.ts`; `ReminderProjectionPort` now belongs to `modules/reminders/projectionPort.ts`. The route still supplies concrete ports from `buildAppDeps()`. |
| `modules/system-settings/configAdapter.ts` | Module-level settings reads constructed and imported Postgres implementations directly. | Removed. Module-owned `ConfigAdapterPort` receives the runtime/settings readers only through `app-layer/di/bindSystemSettingsConfigAdapter.ts`; startup instrumentation and `buildAppDeps()` are composition roots. DB-backed settings behavior and cache/error semantics are unchanged. |

No former record was a valid module-layer composition root. No allowlist remains in
`apps/webapp/eslint.config.mjs`.

## Structural gate

`scripts/check-webapp-infra-import-boundary.mjs` is part of `pnpm --dir apps/webapp run lint`.
It parses TypeScript AST for production `modules/**` and `app/api/**/route.ts`, rejecting imports
and re-exports from `@/infra/db/**` or `@/infra/repos/**`, including aliased bindings, literal and
constant/computed dynamic imports, and relative-path bypasses. Its self-test rejects seven bypass
forms and accepts a consumer of a module port.

## Verification

- `node scripts/check-webapp-infra-import-boundary.mjs --self-test` — PASS: 7 bypass forms rejected; canonical port consumer accepted.
- `node scripts/check-webapp-infra-import-boundary.mjs` — PASS.
- `pnpm --dir apps/webapp exec vitest --run src/modules/system-settings/configAdapter.unit.test.ts src/app/api/integrator/events/route.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts` — PASS: 5 files / 30 tests.
- `pnpm --dir apps/webapp run lint` — PASS.
- `pnpm run lint` — PASS.
- `pnpm --dir apps/webapp run typecheck` — PASS.
- `git diff --check` — PASS.
