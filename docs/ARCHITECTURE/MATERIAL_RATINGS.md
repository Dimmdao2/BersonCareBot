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

## Связанные файлы

- Модуль: `apps/webapp/src/modules/material-rating/`
- Репозиторий: `apps/webapp/src/infra/repos/pgMaterialRating.ts` (+ in-memory для тестов)
- API: `apps/webapp/src/app/api/patient/material-ratings/`, `apps/webapp/src/app/api/doctor/material-ratings/{aggregate,summary}/`
- Реестр HTTP: `apps/webapp/src/app/api/api.md` (раздел patient/doctor material-ratings)
