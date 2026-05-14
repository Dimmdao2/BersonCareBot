# DEPENDENCY_CI_UPDATE — execution log

## Baseline

- `pnpm outdated -r --format json` → [OUTDATED-SNAPSHOT.json](./OUTDATED-SNAPSHOT.json) (waves: safe vs deferred).

## Done in this change set

1. GitHub Actions: `checkout`, `setup-node`, `cache`, `pnpm/action-setup` bumped to majors on Node 24 runtime; removed `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` after bump.
2. Webapp: `middleware.ts` → `proxy.ts` (Next 16 convention); tests/docs references updated.
3. Safe dependency wave: patch/minor bumps + AWS SDK 3.1047.0 + manifest alignment (`fastify`, `postcss`, `@types/node`).
4. Risky wave: **ESLint 10 отложен** — `eslint-config-next@16.2.6` тянет плагины с peer `eslint@^9`; выровняли **root + webapp на `eslint@^9.39.4`** (одна мажорная линия). `admin/` React 19 + Vite 7 + TS 5.9; `engines.node` → `>=22` где объявлено.

## Checks

- `pnpm install` (lockfile обновлён).
- `pnpm run ci` — **OK** (локально, ~4m).
- `cd admin && npm install && npm run build` — **OK** (Vite 7; рекомендуемый Node для Vite — `>=22.12` или `>=20.19`).
