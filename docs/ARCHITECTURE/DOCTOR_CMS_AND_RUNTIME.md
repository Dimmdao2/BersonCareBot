# Кабинет специалиста: CMS контента и обработка сбоев БД

## Маршруты CMS

- **Хаб:** `/app/doctor/content` — левое меню (новости, мотивации, разделы, фильтр по разделам, библиотека) и список страниц контента.
- **Медиа:** в контенте и библиотеке используются URL вида `/api/media/{uuid}`; файлы в приватном S3, отдача через webapp (редирект на presigned URL) при **входе пользователя** (same-origin cookie). См. `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` и `apps/webapp/src/app/api/api.md`.
- **Фильтр по разделу:** query-параметр `section=<slug>` (slug из `content_sections`). Неизвестный slug обрабатывается как «все страницы» (устойчивость к удалённым разделам в закладках).
- **Разделы (CRUD):** `/app/doctor/content/sections`, создание/редактирование страниц — `/new`, `/edit/[id]`.

Код: `apps/webapp/src/app/app/doctor/content/`, компонент сайдбара `ContentPagesSidebar.tsx`.

## Когда БД «нет» (ожидаемо)

- **Vitest** и **`next build` в CI без `DATABASE_URL`:** `webappReposAreInMemory()` в [`apps/webapp/src/config/env.ts`](../../apps/webapp/src/config/env.ts) включает in-memory репозитории; запросы к PostgreSQL для контента не выполняются, падения подключения нет.
- **Локальный `next dev` без `DATABASE_URL`:** конфиг падает при старте с явной ошибкой (нужен URL БД).

Тихий пустой ответ без ошибки в этом режиме — норма для сборки и тестов, не для продакшен-рантайма с настроенной БД.

## Сбой загрузки при живой БД

Если `DATABASE_URL` задан, но запрос падает (сеть, PostgreSQL, SQL), страницы CMS не должны молча показывать «пустой каталог».

Используется:

1. **Лог в stderr** — [`logServerRuntimeError`](../../apps/webapp/src/infra/logging/serverRuntimeLog.ts): одна строка JSON (`service`, `scope`, `digest`, `errName`, `errMessage`, `ts`) + stack отдельной строкой. В systemd/journald это видно как записи unit **`bersoncarebot-webapp-prod.service`** (см. [`SERVER CONVENTIONS`](SERVER%20CONVENTIONS.md); поле `service` в JSON может отличаться от имени unit).
2. **UI** — [`DataLoadFailureNotice`](../../apps/webapp/src/shared/ui/DataLoadFailureNotice.tsx): текст пользователю и **код `digest`** для поддержки; в `NODE_ENV === development` дополнительно текст ошибки в интерфейсе и `console.error` в браузере.

Секреты и полные connection string в лог не пишутся.

## Журнал работ и отчёты

- Хронология реализации (сайдбар, `?section=`, логирование, мягкая деградация): [`../REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md`](../REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md).

## Связанные документы

- Структура кабинета специалиста: [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md)
- Контент для пациента (`content_pages`): [`../../apps/webapp/src/modules/content-catalog/content-catalog.md`](../../apps/webapp/src/modules/content-catalog/content-catalog.md)
