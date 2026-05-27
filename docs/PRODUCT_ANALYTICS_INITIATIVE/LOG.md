# Product analytics initiative — execution log

Канонический журнал инициативы. План: [`.cursor/plans/archive/product_analytics.plan.md`](../../.cursor/plans/archive/product_analytics.plan.md).

## 2026-05-27 — Block 1 (data foundation)

### Сделано

- Drizzle schema: `product_push_notifications`, `product_analytics_events_recent`, `product_analytics_hourly`, `product_analytics_user_hourly` (`apps/webapp/db/schema/productAnalytics.ts`).
- Migration `0083_product_analytics.sql` + journal idx 83.
- Module `apps/webapp/src/modules/product-analytics/` (ports, types, service, timeRange, normalizePageKey, aggregateKeys).
- Repos: `pgProductAnalytics`, `inMemoryProductAnalytics`; `deps.productAnalytics` в `buildAppDeps`.
- `getAdminDashboard` — заглушка (агрегации в Block 4).

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `check-drizzle-journal-sync.sh` | OK |
| `vitest` `normalizePageKey.test.ts`, `service.test.ts` | 9 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` на новых файлах | OK |

### Исправления по review

1. **`page_view` вне `/app/patient/**`** — service отбрасывает событие после `normalizePageKey` (не пишет в `__all__`).
2. **Dedupe `push_open`** — опора на partial unique index + обработка `23505` при гонке вставки (вместо только `SELECT` перед `INSERT`).
3. **`recordEventsBatch`** — единый путь: `insertRecent` → skip hourly при dedupe.

### Осознанно не в Block 1

- Ingest (auth, client reporter, API) — Block 2.
- Push payload / SW — Block 3.
- Admin API/UI aggregations — Blocks 4–5.
- Retention endpoint + host cron — Block 6.
- `pnpm run migrate` на dev — выполнить локально перед smoke.

### Следующий шаг

Block 2: `auth_login`, `POST /api/patient/analytics/events`, `PatientAnalyticsReporter`, `pwa/launch`.
