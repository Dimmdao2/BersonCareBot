# Финальная коррекция DB chokepoint и chart size gate — 2026-08-17

## Паспорт

- Ветка: `wt/final-fix-db-chart-20260817`.
- Исходный SHA: `5e7ee1f754cc30bd78025d98caebcba2618ec9e5`.
- Scope: только findings B-02/B-03 независимого системного аудита B, совпадающие findings 3/4 аудита A.
- Authority: bounded brief родительского оркестратора; `AGENTS.md` §5, §7, §9–§10b, §15–§20, §24; оба финальных audit reports.
- Ограничения соблюдены: DB, DEV, TEST, PROD, env, deploy, provider, migration и push не запускались и не изменялись.

## Результат

### DB chokepoint

- `playbackUserVideoFirstResolve` в app-layer больше не импортирует Drizzle SQL, schema, `getWebappSqlDb` или `runWebappNamedRoot` и не содержит SQL.
- В модуле media определён `PlaybackUserVideoFirstResolvePort`; конкретная реализация находится в `infra/repos/pgPlaybackUserVideoFirstResolve.ts` и подключена через существующий `buildAppDeps` composition root.
- Patient-ветка продолжает вызывать ровно `app.record_current_patient_playback_first_resolve(uuid)` через webapp named-root port; staff-ветка продолжает использовать Drizzle insert с тем же conflict target.
- Обновлены оба активных relation/callsite inventories. Сгенерированные privilege/allowlist SQL остались побайтно неизменными: права и capability не расширены.
- Добавлены два unit-теста: точная patient capability и сохранение staff Drizzle path.

### Chart positive-size gate

- `PositiveSizeResponsiveContainer` больше не вызывает setter из effect и не имеет lint suppression.
- Размер читается через `useSyncExternalStore` как стабильный примитивный snapshot; подписка использует `ResizeObserver`, а fallback — `window.resize`.
- `ResponsiveContainer` монтируется только при `width > 0 && height > 0`, с явными положительными числовыми размерами; `-1`, `0` и скрытый container в Recharts не передаются.

## Проверки

- `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-db-chart-20260817 && pnpm --dir apps/webapp exec vitest --run src/infra/repos/pgPlaybackUserVideoFirstResolve.unit.test.ts src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts src/shared/ui/charts/PositiveSizeResponsiveContainer.unit.test.tsx"` — PASS: `3/3` files, `7/7` tests.
- `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-db-chart-20260817 && pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp run lint && node --test deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/port-context-callsite-catalog.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/relation-access.test.mjs"` — PASS: workspace prerequisites, webapp typecheck, полный webapp lint и `65/65` privilege/catalog tests.
- После добавления unit-теста: `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-db-chart-20260817 && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp run lint"` — PASS на финальном production+test tree.
- `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-db-chart-20260817 && node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs deploy/postgres/privileges/relation-access.test.mjs"` — PASS: `44/44` на финальных inventories.
- `node scripts/check-db-chokepoint.mjs` — PASS: `check-db-chokepoint: OK`.
- `node scripts/check-no-new-raw-sql.mjs` — PASS: production debt `0`.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS: четыре generated privilege/allowlist artifacts совпадают побайтно.
- `git diff --check` — PASS.

Первый прямой запуск `pnpm --dir apps/webapp typecheck` до сборки workspace-пакетов упал только на отсутствующих локальных `@bersoncare/*` dist-модулях свежего клона. После канонических prerequisite builds два финальных typecheck запуска прошли; это не product failure.

Полный `pnpm run ci` не запускался: bounded scope полностью покрыт точными behavior, typecheck, полным webapp lint, DB chokepoint/raw-SQL и privilege/callsite gates; отдельного непокрытого интеграционного риска не осталось.
