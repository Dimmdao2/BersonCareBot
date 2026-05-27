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

## 2026-05-27 — Block 2 (ingest входов и страниц)

### Сделано

- `recordAuthLogin` + вызовы после успешного входа: `telegram-init`, `max-init`, `exchange`, `oauthWebSession` (Google/Apple), `yandexOAuthCallbackHandler`.
- `POST /api/patient/analytics/events` (batch ≤20, Zod, `requirePatientApiBusinessAccess`).
- `PatientAnalyticsReporter` в `PatientClientLayout` — `app_open` / `page_view` / `heartbeat` с debounce и `client_session_id`.
- `POST /api/patient/pwa/launch` — snapshot в `heartbeat` + metadata (`pwa_launch_snapshot`), **без** `app_open` (канон — reporter).

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `vitest` product-analytics + `api/patient/analytics/events` + `clientEntryChannel` | 18 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` Block 2 файлы | OK |

### Исправления по review

1. **`recordAuthLogin`** — запись только для `platform_users.id` (UUID); legacy transport id (`tg:…`) пропускается.
2. **`PatientAnalyticsReporter`** — удалён неиспользуемый `pathnameRef`.
3. **`clientEntryChannel.test.ts`** — покрытие выбора канала (pwa / telegram / max / browser).

### Заметки

- `entry_channel` на client ingest приходит с клиента (`resolveClientEntryChannel`).
- `app_open` не дублируется из `pwa/launch`.
- SMS/email login в Block 2 не подключались (в плане — перечисленные auth entry routes + OAuth).

### Следующий шаг

Block 3: push pipeline (`trackingId`, SW `notificationclick`, `push-open` API).
