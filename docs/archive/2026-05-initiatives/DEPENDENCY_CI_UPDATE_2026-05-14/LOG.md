# DEPENDENCY_CI_UPDATE — execution log

## Коммит

- **`09b790e4`** — `chore: upgrade CI actions, Next proxy convention, and dependencies` (ветка `main`, push на `origin`).

## Baseline

- `pnpm outdated -r --format json` → [OUTDATED-SNAPSHOT.json](./OUTDATED-SNAPSHOT.json) (waves: safe vs deferred).

## Done in this change set

1. **GitHub Actions** (рантайм экшенов на Node 24, без `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`):
   - [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml): `actions/checkout@v5`, `actions/cache@v5`.
   - [`.github/actions/setup-pnpm/action.yml`](../../../.github/actions/setup-pnpm/action.yml): `pnpm/action-setup@v5`, `actions/setup-node@v5`, `node-version: "22"`.
2. **Webapp Next 16**: файл конвенции `middleware.ts` заменён на [`apps/webapp/src/proxy.ts`](../../../apps/webapp/src/proxy.ts) (`export function proxy` + прежний `config.matcher`). Логика платформы остаётся в каталоге [`apps/webapp/src/middleware/platformContext.ts`](../../../apps/webapp/src/middleware/platformContext.ts) (имя папки `middleware/` — модуль кода, не файл конвенции Next).
   - Тесты: [`apps/webapp/src/proxy.test.ts`](../../../apps/webapp/src/proxy.test.ts), переименованный [`apps/webapp/src/platformContextRedirects.test.ts`](../../../apps/webapp/src/platformContextRedirects.test.ts) (бывший `middleware.test.ts`).
   - Правки ссылок в смежных доках: `platform.md`, `guards.md`, `MINIAPP_AUTH_FIX_EXECUTION_LOG.md`, архив `BOT_CONTACT_MINI_APP_GATE.md`.
3. **Safe dependency wave**: patch/minor в workspace, **AWS SDK `3.1047.0`** (webapp + media-worker + integrator dev), выравнивание `fastify` / `postcss` / `@types/node` (в т.ч. `packages/booking-rubitime-sync`).
4. **Risky / политика**:
   - **ESLint 10 не поднимали в webapp** — у `eslint-config-next@16.2.6` цепочка плагинов с peer до **eslint 9**; **root + webapp** на **`eslint@^9.39.4`**.
   - **`engines.node`**: `>=22` в корне, integrator, media-worker; **`admin/package.json`** — `>=22.12.0` (требования Vite 7).
   - **`admin/`**: React 19, Vite 7, `@vitejs/plugin-react@^5.2.0`, TypeScript 5.9; обновлён `admin/package-lock.json`.

## Checks

- `pnpm install` (lockfile обновлён).
- `pnpm run ci` — **OK** (локально, ~4m).
- `cd admin && npm install && npm run build` — **OK** (Vite 7; рекомендуемый Node для Vite — `>=22.12` или `>=20.19`).
