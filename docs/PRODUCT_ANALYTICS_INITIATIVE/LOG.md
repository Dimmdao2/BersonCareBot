# Product analytics initiative — execution log

Канонический журнал инициативы. План: [`.cursor/plans/archive/product_analytics.plan.md`](../../.cursor/plans/archive/product_analytics.plan.md).

## 2026-05-28 — Registration funnel events (auth error logging)

**Статус:** закрыто.

### Сделано

- Event types: `auth_register_attempt`, `auth_register_success`, `auth_register_failure` в `product_analytics_events_recent` (+ `product_analytics_hourly` rollup).
- `recordAuthRegistration` (best-effort); `maskContactHint`, `registrationErrorClass`; port `listRegistrationEvents` на `ProductAnalyticsPort`.
- System failures → `admin_audit_log` (`action=auth_register_failure`, `status=error`); user errors (в т.ч. `access_denied`, `duplicate_email`) — только PA.
- Admin: `GET /api/admin/auth-registration-events`; UI `/app/doctor/audit-log` (preset week/month, eventType, authMethod, copy attemptId).
- Ingest из auth routes: email, OAuth (start + Yandex/Google/Apple callbacks, provider `?error=`), phone OTP, messenger-bind, telegram/max-init, exchange.

### Код

- `apps/webapp/src/app-layer/product-analytics/recordAuthRegistration.ts`
- `apps/webapp/src/modules/auth/maskContactHint.ts`, `registrationErrorClass.ts`
- `apps/webapp/src/infra/repos/pgProductAnalytics.ts` — `listRegistrationEvents`
- `apps/webapp/src/app/app/doctor/audit-log/AdminAuthRegistrationEventsSection.tsx`

### Проверка

| Проверка | Результат |
|----------|-----------|
| `pnpm --dir apps/webapp run typecheck` | OK |
| vitest (registration bundle, 44 tests) | OK |
| `register/route`, `register/confirm/route`, `oauth/start/route`, `auth-registration-events/route` | OK |

Связанный журнал login/register: [`../LOGIN_REGISTER_NEW_LOGIC/LOG.md`](../LOGIN_REGISTER_NEW_LOGIC/LOG.md) §2026-05-28.

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
- `deploy/HOST_DEPLOY_README.md` — weekly cron + dry-run smoke; ссылка на UI **`cronJobs`** в system-health.
- `api.md` — контракт internal retention + tick `operator_job_status` (`analytics.product_analytics.retention`).

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

## 2026-05-28 — Gap closure (персонификация + page-hourly + push attribution)

### Что дозакрыто

1. **Активность каждого клиента (персонифицировано):**
   - `GET /api/admin/product-analytics` теперь возвращает `clientActivity[]`:
     - `userId`, `displayName`, `lastSeenAt`,
     - `appOpens`, `pageViews`, `pushOpens`, `activeMinutes`, `totalActivity`,
     - `channels[]` с теми же счетчиками по каждому `entryChannel`.
   - Источник имени: `platform_users.display_name` (fallback: `first_name + last_name`, затем `Пациент`).
   - UI `/app/doctor/usage`: добавлена таблица «Клиенты».

2. **Почасовой разрез по страницам:**
   - API расширен `pageViewsHourly[]` (`bucket`, `pageKey`, `views`, `uniqueUsers`) для top страниц в окне.
   - UI `/app/doctor/usage`: добавлен блок «Почасовой срез (топ-страницы)».

3. **Push-open attribution к владельцу push:**
   - В `recordPushOpen` (pg/inMemory): если `input.userId` отсутствует (клик из SW без сессии), используется `product_push_notifications.user_id`.
   - Dedupe по `push_tracking_id` сохранен (повторный click не увеличивает счетчики).

4. **Явные каналы PWA/Telegram/MAX/Browser в отчете:**
   - API расширен `entryChannelTotals[]`.
   - В summary UI добавлена строка «Заходы по каналам» с явными лейблами `PWA`, `Telegram`, `MAX`, `Браузер`.

### Проверки

| Проверка | Результат |
|----------|-----------|
| `pnpm --dir apps/webapp exec vitest run src/modules/product-analytics/buildAdminDashboard.test.ts src/modules/product-analytics/service.test.ts src/modules/product-analytics/clientEntryChannel.test.ts src/app/api/admin/product-analytics/route.test.ts src/app/api/patient/analytics/push-open/route.test.ts src/app-layer/product-analytics/createTrackedWebPushPayload.test.ts` | 22 passed |
| `pnpm --dir apps/webapp run typecheck` | OK |

### Примечание по plan-файлам

- По запросу пользователя отдельный plan-файл не редактировался; изменения отражены в коде и в этом execution log.

---

## 2026-05-28 — Аналитика уведомлений: люди, каналы, пояс приложения

### Сделано

1. **«По уведомлениям» / `loadContentEngagementStats`:**
   - Блок **«Люди с уведомлениями»** (`peopleWithNotifications`): рост по локальным суткам + donut каналов (взаимоисключающие сегменты).
   - Циферблат **24 ч** отправок (`reminderSendsLast24hClock`); push **вар 1/2** на контенте и уведомлениях.
   - Все бакеты и UI — **`app_display_timezone`** (`displayTimezone` в JSON), без подписей UTC в doctor-аналитике.
   - **`reminderRulesEnabledCount`** оставлен в API как `@deprecated` (число правил, не людей).

2. **Общие модули:** `reminderNotificationPeopleStats.ts`, `reminderHourlyClock.ts`, `displayTimeZoneFormat.ts`, `analytics/shared/*`.

3. **Product analytics:** перегруппировка hourly rollups в `buildAdminDashboard` по `displayTimezone`.

4. **Записи (неделя):** `pgDoctorAppointments` — границы «сегодня/завтра/неделя» через `localDayRangeBoundsIso` + `getAppDisplayTimeZone`.

5. **Здоровье системы:** убраны пользовательские «UTC» в подписях `SystemHealthSection`.

### Ограничения (осознанно)

- Рост людей с напоминаниями — кумулятив по `created_at` среди **сейчас** включённых правил; история отключений не учитывается.
- Пояс — **единый** `app_display_timezone`, не `calendar_timezone` каждого пациента.

### Проверки

| Проверка | Результат |
|----------|-----------|
| `vitest` stats/datetime/product-analytics/route tests | зелёные (локально) |

---

## 2026-05-28 — Retention tick + наблюдаемость cron (cross-cutting)

### Сделано (связь с Operator Health)

- `POST /api/internal/product-analytics/retention` — best-effort tick в **`operator_job_status`**: `job_family=analytics`, `job_key=analytics.product_analytics.retention` (`meta_json`: deleted* / dryRun).
- Сводка всех host cron — **`GET /api/admin/system-health`** → **`cronJobs`**, UI `/app/doctor/system-health` → «Cron-задачи хоста». Канон: [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) § 2026-05-28, реестр `apps/webapp/src/modules/operator-health/cronJobRegistry.ts`.

### Проверки

| Проверка | Результат |
|----------|-----------|
| `vitest` `product-analytics/retention/route.test.ts` (tick mock) | OK |
| `vitest` `collectCronJobsHealth.test.ts`, `system-health/route.test.ts` | OK |
| `pnpm --dir apps/webapp run typecheck` | OK |

---

## 2026-06-07 — Content engagement: push sent, video minutes, пресеты 24 ч

### Сделано

1. **`pushOpensSummary.sent`:** считается из **`product_push_notifications`**, не из **`product_analytics_hourly`**; **`opened`** — **`product_analytics_events_recent`** (`push_open`). Unit-тесты `mergePushOpenBuckets` / `summarizePushOpens` в [`loadAdminReminderStats.test.ts`](../../apps/webapp/src/app-layer/stats/loadAdminReminderStats.test.ts).
2. **KPI минут просмотра:** **`warmupVideoEstimatedWatchMinutes`**, **`videoPlaybackEstimatedWatchMinutes`** в **`loadContentEngagementStats`**; fallback платформенных минут — средняя **`media_files.video_duration_seconds`** × **`videoPlayback.totalResolutions`**, если resolution-событий нет.
3. **Разминки:** парсинг **`content_pages.video_url`** — канонический **`/api/media/{uuid}`** (query/hash отрезаются), как в [`materialRatingTargetVideoMediaIds.ts`](../../apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts).
4. **UI пресеты окна:** **24 ч** / **7 дн.** / **30 дн.** (`DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS`) на material-ratings, notifications, usage; **«Сутки»** (`preset=day`) на analytics/clients и детализации оценок.
5. **Каталог упражнений:** фильтр **`load=`** — merge SSR только при наличии param в URL (`hasLoadParam` / `doctorCatalogClientFilterUrlHints` в [`doctorCatalogClientUrlSync.ts`](../../apps/webapp/src/shared/lib/doctorCatalogClientUrlSync.ts)).
6. **Документация:** [`api.md`](../../apps/webapp/src/app/api/api.md), [`MATERIAL_RATINGS.md`](../ARCHITECTURE/MATERIAL_RATINGS.md), [`DOCTOR_CABINET_NAVIGATION.md`](../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md), [`reminders.md`](../../apps/webapp/src/modules/reminders/reminders.md).

### Проверки

| Проверка | Результат |
|----------|-----------|
| `vitest` `loadAdminReminderStats.test.ts`, `doctorCatalogClientUrlSync.test.ts` | OK (локально) |
