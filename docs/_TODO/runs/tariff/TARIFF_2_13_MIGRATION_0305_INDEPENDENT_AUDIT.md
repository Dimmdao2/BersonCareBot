> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Тариф 2.13 — независимый аудит migration 0305: PASS

Кандидат: `b3df61d01`. Аудит только migration fix; продукт, plan/taskdb и окружения не менялись.

1. **PASS** — `git diff --name-status b3df61d01^ b3df61d01` показывает только новую `0305`, её journal и journal-пометку плана. В SQL ровно три требуемых `CREATE OR REPLACE FUNCTION`.
2. **PASS** — в каждой из трёх функций ровно один `LEFT JOIN LATERAL app.saas_billing_effective_tariff(...) AS tariff ON true`; `public.saas_tariffs` join отсутствует.
3. **PASS** — поблочное сравнение с `0297` показывает равенство тел после замены только tariff join; signatures, owners и grants идентичны, `commercial_access_state` отсутствует, quota/policy ветви не менялись.
4. **PASS** — первая строка `0305` — `-- TEMPORARY LOCAL MIGRATION NUMBER 0305`; journal содержит tag `0305_tariff_snapshot_access_doors_local`, а `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:26` сохраняет номер за `wt/tariff-access-state-tails`.
5. **PASS** — выполнены:

   ```bash
   bash apps/webapp/scripts/check-drizzle-journal-sync.sh
   DATABASE_URL='postgres://audit_no_connect@127.0.0.1:1/audit_no_connect' pnpm --dir apps/webapp exec drizzle-kit check
   node apps/webapp/scripts/check-access-ladder-transitions.mjs
   pnpm --dir apps/webapp lint
   pnpm --dir apps/webapp typecheck
   ```

   Все завершились с кодом `0`. `drizzle-kit check` получил заведомо недостижимый URL только для обязательной валидации конфигурации и не подключался к БД. Access-ladder proof использовал собственный disposable local PostgreSQL cluster; DEV/TEST/PROD не затрагивались.

Проверки запускались на `9a62423ae`; `git diff --name-status b3df61d01..HEAD -- apps/webapp/db/drizzle-migrations/0305_tariff_snapshot_access_doors_local.sql apps/webapp/db/drizzle-migrations/meta/_journal.json` пуст, поэтому migration/journal совпадают с кандидатом. Живой DEV oracle остаётся следующим gate лидера.
