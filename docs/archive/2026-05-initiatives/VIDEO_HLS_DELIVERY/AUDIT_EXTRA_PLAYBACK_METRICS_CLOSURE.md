# Экстра-аудит: закрытие DEFER/INFO (playback metrics, TTL, docs) — 2026-05-03

**Область:** реализация по внутреннему плану «VIDEO_HLS_DELIVERY — закрытие выбранных DEFER/INFO» (агрегаты `media_playback_stats_hourly`, `GET /api/admin/system-health` → `videoPlayback`, TTL preview/intake, документы S3/watermark/media-worker, обновления `AUDIT_GLOBAL` / `api.md`).

**Цель этого документа:** зафиксировать расхождения с чек-листами плана, недочёты тестового покрытия и **непредвиденные** риски после правок — как backlog отдельного этапа доработок (не пересмотр вердикта phase 01–10).

### Revision 2026-05-03 (фиксы по аудиту)

В репозитории закрыты пункты backlog §2 и часть §5:

- **Тесты:** [`playbackStatsHourly.test.ts`](../../apps/webapp/src/app-layer/media/playbackStatsHourly.test.ts) — мок Drizzle для `recordPlaybackResolutionStat` (insert → values → `onConflictDoUpdate`), кейсы fallback, повторный вызов, ошибка БД и лог.
- **Тесты:** [`route.test.ts`](../../apps/webapp/src/app/api/admin/system-health/route.test.ts) — маршрутизация SQL по подстрокам (устранение гонки при параллельных пробах); кейс **`video_playback_probe_failed`** при падении запроса к `media_playback_stats_hourly`.
- **UI:** [`SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx) — пояснение семантики счётчиков (мульти-резолв / HLS refresh); подсказка при выключенном playback API и нулевой статистике.
- **Док:** [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) — явная ссылка на [`S3_PRIVATE_MEDIA_EXECUTION_LOG.md`](../REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md) § Private bucket policy.
- **Док:** [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — семантика `videoPlayback`, internal retention (`revision` до batch 2: только счётчик резолвов).

### Revision 2026-05-03 (batch 2: уникальные пары, Drizzle, UX «API выкл», retention)

- **Схема + миграция:** `media_playback_user_video_first_resolve` (PK `(user_id, media_id)`), Drizzle в `db/schema`; запись из `resolveMediaPlaybackPayload` через **`recordPlaybackUserVideoFirstResolve`** (идемпотентный insert, ошибки не ломают выдачу).
- **Дашборд:** `loadAdminPlaybackHealthMetrics` (**Drizzle**, без raw `pool.query`) — `uniquePlaybackPairsFirstSeenInWindow` = число новых dedup-строк с `first_resolved_at` в последних 24 ч UTC (первая «уникальная» пара пользователь+видео *в этом окне*; повторные визиты тем же пользователем к тому же файлу исторически уже не добавляются в dedup‑таблицу и не увеличивают счётчик; см. код).
- **`GET /api/admin/system-health`:** при **`video_playback_api_enabled=false`** не выполняются запросы к `media_playback_*`; **`SystemHealthSection`** не показывает числовые ряды воспроизведения при выключенном API (**`playback_disabled`**).
- **Retention почасового агрегата:** `POST /api/internal/media-playback-stats/retention` + `purgeStalePlaybackHourlyStats` (Drizzle), по умолчанию **90** суток; dedup‑таблица не режется.

**Фиксируется вне scope кодом:** включение cron retention на конкретном хосте (см. `deploy/HOST_DEPLOY_README.md`).

### Revision 2026-05-03 (batch 3: post-fix audit closure)

- **Preview redirect cache-control:** устранён риск TTL-mismatch для fallback redirect в `GET /api/media/[id]/preview/[size]` — `Cache-Control` теперь привязан к `video_presign_ttl_seconds` (не дольше жизни подписи URL).
- **Закрыты пропуски тестового покрытия:** добавлены unit-тесты на Drizzle-агрегатор `adminPlaybackHealthMetrics`, service `playbackHourlyRetention`, route `internal/media-playback-stats/retention`; обновлён тест preview route под новый cache-control.
- **Статус:** критичных code-level хвостов по batch 2 не осталось; сохраняются только ops/product пункты из §5.

---

## 1. Вердикт по соответствию плану

| Блок плана | Статус | Комментарий |
|------------|--------|-------------|
| Таблица + миграция `media_playback_stats_hourly` | **Соответствует** | PK `(bucket_hour, delivery)`, CHECK по `delivery`, индекс по `bucket_hour`. |
| Запись из `resolveMediaPlaybackPayload` | **Соответствует** | Ошибки записи глотаются, лог `playback_stats_hourly_write_failed`. |
| System-health API + UI | **Соответствует** | `videoPlayback`, `meta.probes.videoPlayback`, карточка в `SystemHealthSection`. |
| TTL preview + intake | **Соответствует** | `getVideoPresignTtlSeconds()` в preview и intake presign. |
| Документы (S3 log, PHASE_10 TODO, media-worker README, AUDIT_GLOBAL §8, api.md) | **Соответствует** | Содержательно закрыто. |
| **Чек-лист тестов upsert** | **Закрыто (revision 2026-05-03)** | Unit-тесты с моком Drizzle — см. Revision выше. |
| **Чек-лист probe «ошибка БД»** | **Закрыто (revision 2026-05-03)** | Тест `video_playback_probe_failed` — см. Revision выше. |
| **HOST_DEPLOY ↔ private bucket checklist** | **Закрыто (revision 2026-05-03)** | Ссылка из `deploy/HOST_DEPLOY_README.md` на § Private bucket policy. |

---

## 2. Недоделки по чек-листам плана

### 2.1 Unit-тест «инкремент / конфликт upsert»

**Было:** только **`utcHourBucketIso`**.

**Стало (revision 2026-05-03):** мок Drizzle в [`playbackStatsHourly.test.ts`](../../apps/webapp/src/app-layer/media/playbackStatsHourly.test.ts) — вызов insert/values/`onConflictDoUpdate`, повторные вызовы, ошибка insert.

### 2.2 Тесты `GET /api/admin/system-health` — сбой probe `videoPlayback`

**Было:** нет кейса ошибки SQL для агрегатов.

**Стало (revision 2026-05-03):** отказ запроса к `media_playback_stats_hourly` → `video_playback_probe_failed` в [`route.test.ts`](../../apps/webapp/src/app/api/admin/system-health/route.test.ts). Параллельные пробы: **`mockImplementation`** по подстрокам SQL вместо цепочки `mockResolvedValueOnce`.

---

## 3. Непредвиденные семантические и продуктовые эффекты

### 3.1 Метрика — не «уникальные просмотры», а «успешные резолвы playback»

Счётчик увеличивается на **каждый** успешный выход из `resolveMediaPlaybackPayload` (файл + видео). Это включает:

- **RSC:** [`patient/content/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/page.tsx) вызывает резолвер при наличии сессии и включённом API.
- **HTTP:** `GET /api/media/[id]/playback`.

На странице контента с адаптивным видео ([`PatientContentAdaptiveVideo.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/PatientContentAdaptiveVideo.tsx)) при **HLS** клиент по таймеру **повторно запрашивает** JSON (`fetchPlaybackJson`) до истечения presign — каждый такой запрос даёт **ещё один инкремент** в статистике за тот же пользовательский сеанс. Плюс повторы при ошибках / кнопке «Повторить».

**Итог:** дашборд отражает **нагрузку/частоту успешных резолвов API**, а не «уникальные воспроизведения» или «уникальные сессии». Для оператора это может выглядеть как «много просмотров» без пояснения.

**Сделано (revision 2026-05-03, batch 2):** см. блок **Revision … (batch 2)** выше и [`06-execution-log.md`](./06-execution-log.md); отдельный счётчик уникальных пар + Drizzle‑агрегаты + UX без «нулевой статистики» при выключенном playback API + internal retention.

**Историческое (до batch 2):** подписи о том, что `totalResolutions` — это частота успешных резолвов, а не «уникальные просмотры» только по почасовому счётчику.

**Опционально в будущем:** метрика «уникальные просмотры в окне» в смысле *уникальных зрителей за 24 ч независимо от времени первой dedup‑записи* — **вне** текущей реализации (сейчас — «первые вхождения dedup‑строк за окно»).

### 3.2 Выключенный playback API и нулевая статистика

При **`video_playback_api_enabled=false`** резолвер возвращает **503** до записи статистики — событий в таблице нет.

**Сделано (revision 2026-05-03, batch 2):** проба **`videoPlayback`** не ходит в БД при выключенном API; **`SystemHealthSection`** скрывает числовые ряды, статус аккордеона **`playback_disabled`**.

### 3.3 Рост таблицы без ретенции

~~**Непредвиденно в плане:** `media_playback_stats_hourly` **не имеет** политики архивации/удаления старых bucket’ов. Объём растёт как «число часов × число каналов delivery» (практически небольшой, но бессрочный).~~

**Закрыто в репозитории (2026-05-03, batch 2):** `POST /api/internal/media-playback-stats/retention` (+ Drizzle‑purge по `bucket_hour`, default **90** дней). Dedup‑таблица **без TTL** по продуктовому решению (lifetime «видел хотя бы раз»).

**На хосте:** подключить редкий cron — `deploy/HOST_DEPLOY_README.md`.

### 3.4 Миграция на production

Таблица почасового агрегата появляется после миграции **`0026_media_playback_stats_hourly`**; таблица дедупа уникальных пар — **`0027_media_playback_user_video_first_resolve`**. До применения соответствующих миграций запись статистики или dedup падает в catch (лог), дашборд может быть неполным — поведение ожидаемо при поэтапном деплое.

---

## 4. Прочие наблюдения (низкий приоритет)

- **Сводка `fallbackTotal`:** суммируются **`fallback_count`** по всем строкам `delivery` за окно — согласовано с тем, что при каждом резолве в строку выбранного `delivery` добавляется 0 или 1 к fallback; сумма — общее число «fallback-событий», не обязательно равная числу резолвов с `fallbackUsed` как доля (несколько каналов не дублируют одно событие).
- **Неизвестный `delivery` в выборке:** в коде агрегации учитываются только `hls` / `mp4` / `file`; теоретический мусор в обход CHECK не попадёт в `byDelivery`, но войдёт в `totalResolutions`/`fallbackTotal` через цикл — маловероятно при целостности БД.

---

## 5. Оставшийся backlog (после revision 2026-05-03, batch 3)

1. **Ops:** на production включить **`cron`** на `POST …/internal/media-playback-stats/retention` (пример — `deploy/HOST_DEPLOY_README.md`).
2. **Продукт (опционально):** см. §3.1 — иная трактовка «уникальных за 24 ч» без привязки к моменту первой записи dedup‑строки.

---

## 6. Связанные файлы (аудируемая реализация)

- [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts) — `mediaPlaybackStatsHourly`, `mediaPlaybackUserVideoFirstResolve`
- [`apps/webapp/db/drizzle-migrations/0026_media_playback_stats_hourly.sql`](../../apps/webapp/db/drizzle-migrations/0026_media_playback_stats_hourly.sql)
- [`apps/webapp/db/drizzle-migrations/0027_media_playback_user_video_first_resolve.sql`](../../apps/webapp/db/drizzle-migrations/0027_media_playback_user_video_first_resolve.sql)
- [`apps/webapp/src/app-layer/media/playbackStatsHourly.ts`](../../apps/webapp/src/app-layer/media/playbackStatsHourly.ts)
- [`apps/webapp/src/app-layer/media/playbackHourlyRetention.ts`](../../apps/webapp/src/app-layer/media/playbackHourlyRetention.ts)
- [`apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts`](../../apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts)
- [`apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts`](../../apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts)
- [`apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts`](../../apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts)
- [`apps/webapp/src/app/api/admin/system-health/route.ts`](../../apps/webapp/src/app/api/admin/system-health/route.ts)
- [`apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts`](../../apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts)
- [`apps/webapp/src/app/app/settings/SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx)

---

**Итоговый вывод:** после revision **2026-05-03** и **batch 3** закрыты code-level/test/documentation хвосты экстра-аудита; на хосте остаётся только **cron** retention (ops) и опциональная продуктовая трактовка «уникальных за окно». Статус **CLOSED** в [`AUDIT_GLOBAL.md`](./AUDIT_GLOBAL.md) сохраняется; документ остаётся **историческим сводом** находок и пост-фактум улучшений.
