# Оценки материалов (1–5 звёзд)

Краткий канон по реализации в webapp: одна строка на пару **пользователь × цель** (`public.material_ratings`), агрегаты для отображения считаются в сервисе. Страница врача **`/app/doctor/material-ratings`** в UI называется **«Статистика материалов»**: сверху платформенный дашборд (`GET /api/doctor/content-stats`), ниже таблицы именно **оценок звёздами**.

## Данные

- **Таблица:** `material_ratings` (Drizzle: `apps/webapp/db/schema/materialRatings.ts`, миграция `apps/webapp/db/drizzle-migrations/0065_material_ratings.sql`).
- **Цель:** `target_kind` ∈ `content_page` | `lfk_exercise` | `lfk_complex`, `target_id` — UUID сущности.
- **Оценка:** `stars` (smallint 1…5), `updated_at`.
- **Уникальность:** `(user_id, target_kind, target_id)`.

## Доступ и бизнес-правила

- **Пациент (`modules/material-rating`):** чтение агрегата и своей оценки через `GET /api/patient/material-ratings` без обязательной сессии для публичного контента; при сессии — поле `myStars`. Запись — `PUT` при `requirePatientApiBusinessAccess`.
- **Контекст программы:** для `lfk_exercise` и `lfk_complex` при `PUT` обязательны `programInstanceId` и `programStageItemId` (проверка, что материал в активной программе пациента и не disabled). Для `content_page` — опционально; доступ к странице проверяется через порт контента (`content_pages` + политика auth-only).
- **Врач:** `GET /api/doctor/material-ratings/aggregate` — публичный агрегат по `kind`+`id` (роль doctor/admin). `GET /api/doctor/material-ratings/summary` — постраничная сводка по целям с метаданными для списка.

## UI

- Блок звёзд: `MaterialRatingBlock` (+ нативный fallback `MaterialRatingNativeStars`), встраивается на пациентских страницах контента/ЛФК и в формах врача/CMS там, где нужна обратная связь по материалу.
- Кабинет врача: **`/app/doctor/material-ratings`** (пункт меню «Статистика материалов») — сверху дашборд платформенных метрик (**`GET /api/doctor/content-stats`**, тот же JSON, что **`GET /api/admin/reminder-stats`**, загрузчик **`loadContentEngagementStats`**; агрегаты **по всей платформе**, не касeload врача; тестовые аккаунты исключены без **`dev_mode`** — см. §«Дашборд content-stats» ниже); UI: [`MaterialContentStatsClient.tsx`](../../apps/webapp/src/app/app/doctor/material-ratings/MaterialContentStatsClient.tsx); ниже постраничная сводка по оценкам; **`/app/doctor/material-ratings/[kind]/[id]`** — детализация за период ≤31 дня (график и список оценивших).

## Дашборд content-stats (верх «Статистика материалов»)

Query **`windowHours`** (целое **1…720**, по умолчанию **168**); в UI — пресеты **24 ч** / **7 дн.** / **30 дн.**

| Поле | Смысл |
|------|--------|
| **`warmupVideoTopPages`** | Топ страниц по открытиям видео разминки (`patient_daily_warmup_video_views`). |
| **`warmupVideoEstimatedWatchMinutes`** | Оценка минут просмотра разминок: сумма **`media_files.video_duration_seconds`** по открытиям **`patient_daily_warmup_video_views`**; UUID из **`content_pages.video_url`** — сегмент **`/api/media/{uuid}`** (query/hash отрезаются, допускается полный URL). Если длительности в БД нет — оценка по числу открытий × средняя длительность каталога или **120 с** на открытие. |
| **`videoPlayback.totalResolutions`** | Выдачи видео за окно (`loadAdminPlaybackHealthMetrics`): **`COUNT(*)`** из **`media_playback_resolution_events`** с учётом audience; при **отсутствии** audience-фильтра и нуле событий — fallback на **`media_playback_stats_hourly`**. При активном audience-фильтре hourly **не** подмешивается (нет per-user разбивки). |
| **`videoPlaybackEstimatedWatchMinutes`** | Сумма **`media_playback_resolution_events`** × **`media_files.video_duration_seconds`** (отдельный filtered `COUNT` событий); при нулевой сумме длительностей — **число resolution-событий** × средняя длительность каталога или **120 с** на событие (`estimateWatchMinutes`). Длительность пишет **media-worker** при транскоде; для уже готовых роликов без длительности — backfill при повторном job (`already_ready`). |
| **`practiceTopPages`** / **`practiceBySource`** | Завершения практики (`patient_practice_completions`). |
| **`pushOpensSummary`** | **`opened`** — **`product_analytics_events_recent`** (`push_open`); **`sent`** — **`product_push_notifications`**; **`openRate`** = opened/sent. |

Блоки напоминаний (`occurrenceHistory*`, `peopleWithNotifications`) на этой странице не показываются — они на **`/app/doctor/analytics/notifications`**.

**Аудитория:** `GET /api/doctor/content-stats` и `GET /api/admin/reminder-stats` передают `excludedUserIds` из `loadDoctorAnalyticsAudience()` (тестовые аккаунты исключены, пока выключен **`dev_mode`**; **`debug_forward_to_admin`** не влияет). Агрегаты **по всей платформе**, не «только пациенты этого врача». Фильтр по пользователю применяется к **push** (`push_open`, `product_push_notifications`), **видео** (`media_playback_resolution_events`, `media_playback_user_video_first_resolve`, `media_playback_client_events`), **разминкам**, **практике** (`patient_daily_warmup_video_views`, `patient_practice_completions`), **напоминаниям** (`occurrenceHistory*`, `peopleWithNotifications`). Почасовые rollups `media_playback_stats_hourly` в doctor-facing аналитике **не** подмешиваются при активном audience-фильтре.

## Детализация для врача (`GET /api/doctor/material-ratings/detail`)

Границы периода — календарные дни в **`app_display_timezone`**, данные в полуинтервале **`[startUtcIso, endExclusiveUtcIso)`**.

| Поле в `days[]` | Источник |
|-----------------|----------|
| **`viewCount`** | `COUNT(*)` из **`media_playback_user_video_first_resolve`**, где **`media_id`** входит в множество **видео**-медиа, связанных с целью, и локальный день (`timezone(iana, first_resolved_at)`) совпадает с **`day`**. Множество `media_id`: канонический **`/api/media/{uuid}`** в **`lfk_exercise_media`** для упражнения; для **`lfk_complex`** — объединение по упражнениям шаблона; для **`content_page`** — из **`video_url`**, если строка распознана как тот же шаблон URL; иначе **0**. |
| **`ratingActivityCount`** | Число строк **`material_ratings`** с данной целью, у которых **`updated_at`** попадает в локальный день **`day`** (отражает выставление/изменение оценки в этот день; одна строка на пользователя). |
| **`avgStarsInActivity`** | **`AVG(stars)`** только по строкам, учтённым в **`ratingActivityCount`** за этот день; при **0** — **`null`**. |

История смены звёзд одним пользователем по дням без отдельного event-log **не** восстанавливается: используется только текущая строка и её **`updated_at`**.

Список **`raters`**: строки из **`material_ratings`** за интервал; подпись строится из **`platform_users`** при наличии строки пользователя, иначе в **`displayLabel`** подставляется **`user_id`** (нет потери оценки из-за отсутствия join).

Non-video и страницы без распознанного **`/api/media/{uuid}`** дают нулевую линию просмотров до появления отдельной аналитики.

## Связанные файлы

- Модуль: `apps/webapp/src/modules/material-rating/`
- Репозиторий: `apps/webapp/src/infra/repos/pgMaterialRating.ts` (+ in-memory для тестов), хелпер видео-media: `apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts`
- API: `apps/webapp/src/app/api/patient/material-ratings/`, `apps/webapp/src/app/api/doctor/material-ratings/{aggregate,summary,detail}/`, `apps/webapp/src/app/api/doctor/content-stats/route.ts`
- Реестр HTTP: `apps/webapp/src/app/api/api.md` — **`patient/material-ratings`**, **`doctor/material-ratings/*`**, **`doctor/content-stats`**, **`admin/reminder-stats`** (тот же payload, что у врача, плюс admin mode).
