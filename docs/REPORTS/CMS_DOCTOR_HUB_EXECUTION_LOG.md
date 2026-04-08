# Журнал: CMS врача — десктопный хаб, фильтры, runtime-логирование

**Дата:** 2026-04-08  
**Связанный план (Cursor):** `cms_desktop_sidebar_cbf05efa` (сайдбар и `?section=`).  
**Архитектурная заметка:** [`../ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](../ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md)

## 1. UI хаба `/app/doctor/content`

- Компонент [`ContentPagesSidebar`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx): новости, мотивации, разделы, блок «Страницы» (все / по разделу), библиотека.
- [`page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx): `searchParams.section`, порядок групп по `content_sections`, «осиротевшие» slug в конце; CTA «Создать страницу» в основной колонке.
- [`ContentPagesSectionList`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx): `showSectionHeading` для режима одного раздела (без дубля с `h2`).

## 2. Сбои БД (прод): лог + мягкий UI

- [`logServerRuntimeError`](../../apps/webapp/src/infra/logging/serverRuntimeLog.ts) — JSON-строка в **stderr** (удобно для **journald**/systemd у unit вебаппа) + stack; поле `digest` для поддержки.
- [`DataLoadFailureNotice`](../../apps/webapp/src/shared/ui/DataLoadFailureNotice.tsx) — сообщение пользователю, код `digest`; в development — деталь и `console.error` в браузере.
- Подключено на: хаб контента, разделы, new/edit страниц; на главной пациента и `GET /api/menu` — только логирование без смены UX карточек.

## 3. Ожидаемое отсутствие БД

- Сборка/тесты: [`webappReposAreInMemory()`](../../apps/webapp/src/config/env.ts) — in-memory репозитории; отдельный «тихий» режим не смешивается с реальными ошибками PG при наличии `DATABASE_URL`.

## 4. Проверки

- `pnpm run ci` (корень репозитория) — успешно после изменений.
- Юнит-тест: [`serverRuntimeLog.test.ts`](../../apps/webapp/src/infra/logging/serverRuntimeLog.test.ts).

---

*Отчёты по этой теме вести в этом файле (`docs/REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md`).*
