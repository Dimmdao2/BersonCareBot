---
name: Оценки материалов (звёзды 1–5)
status: completed
overview: >-
  Публичные и пациентские оценки материалов (страница контента, упражнение, комплекс ЛФК):
  таблица material_ratings, модуль material-rating, API patient/doctor, UI-блок с нативным fallback,
  проверка доступа через программу и content_pages.
todos:
  - id: schema-migration
    content: 'Drizzle: material_ratings + миграция 0065'
    status: completed
  - id: module-repo-api
    content: 'modules/material-rating + pgMaterialRating + buildAppDeps + маршруты API'
    status: completed
  - id: ui-embed
    content: 'MaterialRatingBlock / native stars + встраивание patient + doctor/CMS'
    status: completed
  - id: tests-docs
    content: 'route.test, контрактные тесты; docs ARCHITECTURE/MATERIAL_RATINGS.md + api.md + DB_STRUCTURE'
    status: completed
isProject: false
---

# План: оценки материалов (звёзды) — закрыт

Канон описания: [`docs/ARCHITECTURE/MATERIAL_RATINGS.md`](../../docs/ARCHITECTURE/MATERIAL_RATINGS.md).

Definition of Done (факт):

- [x] Схема и миграция `0065_material_ratings.sql`.
- [x] Сервис и порты в `modules/material-rating`, репозиторий Drizzle.
- [x] `GET`/`PUT` `/api/patient/material-ratings`, `GET` aggregate/summary под `/api/doctor/material-ratings/…`.
- [x] UI и автотесты маршрутов по зоне.

План перенесён в репозиторий как завершённый (`status: completed`).
