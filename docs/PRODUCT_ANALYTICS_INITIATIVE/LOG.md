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

## 2026-05-27 — Block 3 (push pipeline)

### Сделано

- `pushNotificationCopy`: `sloganKey` / `getWarmupSloganKey`; `resolveReminderWebPushPayload` → `pushKind`, `warmupSloganKey`.
- `createTrackedWebPushPayload` — факт в `product_push_notifications` + hourly `push_sent` перед отправкой.
- Трекинг в: `integratorNotifyChannels`, `platformUserReminderWebPushNotify`, `patientWebPushNotify` (news/appointments); metadata в `notification_delivery_attempts`.
- `sendWebPushToSubscriptions` / `sw.js`: `trackingId`, topic/kind/slogan в payload и `notification.data`.
- `POST /api/patient/analytics/push-open` — dedupe, сессия опциональна (`user_id` null без cookie).

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `vitest` web-push + analytics + push-open + tracked payload | 54 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` Block 3 файлы | OK |

### Исправления по review

1. **`occurrence_id`** — в `createTrackedWebPushPayload` пишется только при валидном UUID (integrator `occurrenceId` часто text → `null`, иначе silent fail без `trackingId`).
2. **`clientEntryChannel.test.ts`** — импорт `beforeEach` (typecheck).
3. **Тесты:** `createTrackedWebPushPayload.test.ts`, сериализация tracking-полей в `sendWebPushToSubscriptions.test.ts`.

### Ограничения (зафиксировано)

- SW только scope `/app`; mini app без SW; open без сессии — только `tracking_id`.
- Doctor reply push — вне Block 3 (не в списке плана).
- `push_sent` фиксируется при создании факта отправки, не по факту доставки провайдером.

## 2026-05-27 — Block 4 (admin read API)

### Сделано

- `buildAdminDashboard` — агрегации summary / entryChannelHourly / topPages / pushByTopic / warmupSlogans / activeUsersDaily из hourly + user_hourly.
- `pgProductAnalytics.getAdminDashboard` — выборка rollups + sample text из `product_push_notifications`.
- `inMemoryProductAnalytics.getAdminDashboard` — тот же builder для тестов.
- `GET /api/admin/product-analytics` + `loadAdminProductAnalytics`.
- Контракт в `apps/webapp/src/app/api/api.md`.

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `vitest` `buildAdminDashboard.test.ts`, `service.test.ts`, `route.test.ts` | 8 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` Block 4 файлы | OK |

### Исправления по review

1. **inMemory `warmupSloganSamples`** — фильтр по окну `windowHours` (как в pg по `created_at`), чтобы `sampleText` не подтягивался из push вне интервала.

## 2026-05-27 — Block 5 (admin Settings UI)

### Сделано

- UI «Использование»: **`/app/doctor/usage`** (ранее `?adminTab=product-analytics` в Settings).
- `ProductAnalyticsSection` — пресеты 24ч / 7д / 30д, fetch `GET /api/admin/product-analytics`.
- Блоки: сводка, заходы по каналу (line chart), страницы, push/topic + слоганы разминки, активные клиенты (line chart).
- `settings.md` обновлён.

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` Block 5 файлы | OK |
| `vitest` `api/admin/product-analytics/route.test.ts` | 2 passed |

### Исправления по review

1. **`ProductAnalyticsSection`** — при смене окна сбрасывать `data` до ответа API, чтобы не показывать метрики предыдущего интервала.

## 2026-05-27 — Block 6 (retention + docs + финализация)

### Сделано

- `POST /api/internal/product-analytics/retention` — Bearer `INTERNAL_JOB_SECRET`, query `recentDays` / `userHourlyDays` / `hourlyDays` / `pushDays`, `dryRun=1`.
- `runProductAnalyticsRetention` + purge в port (pg/inMemory) с dry-run.
- `deploy/HOST_DEPLOY_README.md` — weekly cron + dry-run smoke.
- `api.md` — контракт internal retention.

### Проверка (post-review)

| Проверка | Результат |
|----------|-----------|
| `vitest` product-analytics (все затронутые) | 36 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |
| `eslint` Block 6 файлы | OK |

### Исправления по review

1. **inMemory `purgeUserHourlyOlderThan`** — реализован (раньше заглушка `{ deleted: 0 }`).
2. **retention route.test** — кейс дефолтных окон без query.

### Инициатива

Все блоки 1–6 закрыты. Перед merge: `pnpm run migrate` (dev) + smoke + один `pnpm run ci`.

## 2026-05-28 — Синхронизация документации (post-audit)

- План: [`.cursor/plans/archive/product_analytics.plan.md`](../../.cursor/plans/archive/product_analytics.plan.md) — `todos` 1–6 `completed`, DoD `[x]`; уточнено, что `pwa/launch` пишет `heartbeat` (snapshot), не `app_open`.
- IDE-копия плана (`product_analytics_plan_6f8e3d0b`) приведена к тому же состоянию.
- Retention в плане: дефолты `recentDays=90`, `userHourlyDays=180`, `hourlyDays=730`, `pushDays=730` (как в `productAnalyticsRetention.ts` и `deploy/HOST_DEPLOY_README.md`).
