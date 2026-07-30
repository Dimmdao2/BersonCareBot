Готово. Коммит создан локально: `4ab706c14 feat(gates): freeze new raw SQL #987` (без push).

- Проверка и отсортированный debt-manifest: [check-no-new-raw-sql.mjs](/home/dev/dev-projects/bcb-wt-tariff/scripts/check-no-new-raw-sql.mjs)
- Подключена в root `pnpm lint` и [webapp lint](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/package.json).
- D18a отмечен с доказательствами в [WORK_ORDER.md](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:340).

Точный текст падения на временном вызове:

```text
check-no-new-raw-sql: raw SQL debt manifest violation.
New raw .query(...) SQL outside the frozen D18c debt list:
  - apps/integrator/src/rawSqlD18aFixture.ts:2
Use the owning application's Drizzle port/parameterized sql`...`.execute() path; do not add files to this list.
```

Размер manifest: integrator — 17 файлов; webapp — 30 файлов.

Проверки зелёные: `pnpm lint`, `pnpm --filter webapp lint`, `pnpm --filter @bersoncare/integrator lint`. Чужие изменения env-файлов сохранены нетронутыми.