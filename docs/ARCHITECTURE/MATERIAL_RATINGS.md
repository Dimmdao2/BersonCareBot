# Оценки материалов (1–5 звёзд)

Краткий канон по реализации в webapp: одна строка на пару **пользователь × цель** (`public.material_ratings`), агрегаты для отображения считаются в сервисе.

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
- Кабинет врача: **`/app/doctor/material-ratings`** — сводка по целям; **`/app/doctor/material-ratings/[kind]/[id]`** — детализация за период ≤31 дня (график и список оценивших).

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
- API: `apps/webapp/src/app/api/patient/material-ratings/`, `apps/webapp/src/app/api/doctor/material-ratings/{aggregate,summary,detail}/`
- Реестр HTTP: `apps/webapp/src/app/api/api.md` (раздел patient/doctor material-ratings)
