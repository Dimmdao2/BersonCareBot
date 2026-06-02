---
name: patient_help_booking_surface_phase
overview: "Patient UX справки на «Запись»: IA, плитки, city-aware адрес, /about + CMS чеклист — закрыт 2026-06-03."
todos:
  - id: help-slugs-ia
    content: Зафиксировать IA раздела /help и канонические slug (preparation, after-visit, services-pricing, app-guide, address-spb/address-msk, about) + правило публикации через CMS
    status: completed
  - id: tests-docs-help-booking
    content: "Vitest help-content + booking + about/HelpBookingAboutLink RTL; sync TODO/ACTIVE_WORKQUEUE/docs (ф1–4)."
    status: completed
  - id: booking-links-mount
    content: Смонтировать блок полезных ссылок под «Предстоящими записями» на /app/patient/booking/new с переиспользованием CabinetInfoLinks/buildCabinetInfoLinkTiles
    status: completed
  - id: about-page
    content: Добавить короткую страницу /app/patient/about с ссылкой на полный сайт и связать её из /help/booking
    status: completed
  - id: city-aware-address
    content: Заложить city-aware адреса (cityCode->адрес/ссылка) на экране записи и в полезных ссылках без ломки текущего /app/patient/address
    status: completed
  - id: cms-editor-checklist
    content: "Подготовить редакторский чеклист CMS: какие статьи обязательны к публикации для включения ссылок в booking/help"
    status: completed
isProject: false
---

# Patient Help & Booking Surface Plan

**Архив:** `.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`

## Scope
- Включить полезные ссылки и справочный контент в рабочий поток `Запись`.
- Добавить короткую внутреннюю страницу `about` со ссылкой на полный сайт.
- Подготовить city-aware подачу адреса для СПб/Мск в рамках текущего booking UX.

Разрешённые зоны:
- [apps/webapp/src/app/app/patient/booking/new/page.tsx](apps/webapp/src/app/app/patient/booking/new/page.tsx)
- [apps/webapp/src/app/app/patient/cabinet/CabinetInfoLinks.tsx](apps/webapp/src/app/app/patient/cabinet/CabinetInfoLinks.tsx)
- [apps/webapp/src/modules/help-content/cabinetInfoLinkTiles.ts](apps/webapp/src/modules/help-content/cabinetInfoLinkTiles.ts)
- [apps/webapp/src/modules/help-content/canonicalSlugs.ts](apps/webapp/src/modules/help-content/canonicalSlugs.ts)
- [apps/webapp/src/app/app/patient/help/page.tsx](apps/webapp/src/app/app/patient/help/page.tsx)
- Новый маршрут `apps/webapp/src/app/app/patient/about/page.tsx`
- Доки: `docs/TODO.md`, `docs/ACTIVE_WORKQUEUE.md`, `apps/webapp/src/app/app/patient/help/help.md`, `apps/webapp/src/app/app/patient/cabinet/cabinet.md`

## Out Of Scope
- Редизайн всего booking wizard.
- Полная переработка `/app/patient/address` на карте/гео.
- Изменение Rubitime/booking core API.

## Phase 1 — IA Help + Slugs — закрыта 2026-06-03

- [x] Семь канонических slug + `HELP_CANONICAL_ARTICLE_IA` (`canonicalSlugs.ts`)
- [x] `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` + `resolvePublishedServicesPricingSlug` (legacy `cost`)
- [x] Доки: `help/help.md`, `cabinet.md`, `modules/help-content/README.md` + `LOG.md`, `TODO`, `ACTIVE_WORKQUEUE`, `DOCTOR_CMS`, APP_RESTRUCTURE LOG
- [x] Vitest `help-content` (12 tests); `tsc --noEmit` webapp

Проверки (выполнены):
- `rg "HELP_CANONICAL_ARTICLE_SLUG" apps/webapp/src/modules/help-content`
- Сверка `routePaths.patientHelpArticle` для всех канонических slug

## Phase 2 — Полезные ссылки на странице «Запись» — закрыта 2026-06-03

- [x] `CabinetInfoLinks surface="booking"` под `BookingUpcomingSection` в `booking/new/page.tsx`
- [x] `buildCabinetInfoLinkTiles({ omitBookingCta })`, плитка `about` → `/help/about`
- [x] `CabinetInfoLinksCard` + vitest/RTL + `booking-new-page.test.ts` (contract mount)
- [x] `booking/new/booking.md`, sync `TODO` / `ACTIVE_WORKQUEUE` / `DOCTOR_CMS` / `DOCTOR_PATIENT_CARD` LOG
- [x] `revalidatePatientContentPaths` — инвалидация `routePaths.bookingNew` при изменении раздела `help`

Проверки (выполнены): `cabinetInfoLinkTiles`, `CabinetInfoLinksCard`, `booking-new-page`, `help-content`, `revalidatePatientContentPaths` (22 tests); блок всегда рендерится (базовые плитки без CMS).

## Phase 3 — City-Aware адреса — закрыта 2026-06-03

- [x] `patientHelpAddressLink.ts` — нормализация `moscow`/`msk`/`spb`, `resolvePatientAddressHref`, `pickBookingCityCodeForAddressLinks`
- [x] `buildCabinetInfoLinkTiles({ bookingCityCode })` + `CabinetInfoLinks` / `booking/new/page.tsx` (`searchParams.cityCode`, `cityCodeSnapshot` предстоящих)
- [x] Fallback `/app/patient/address` без изменений iframe-страницы
- [x] `bookingNewHref(cityCode)` — wizard «Назад» (service) и success/reschedule redirect (confirm)
- [x] Ревью: нераспознанный `?cityCode=` не блокирует snapshot; reschedule → `successRedirectPath` с городом
- [x] Vitest: `patientHelpAddressLink` (+ alias `msk`), `bookingNewHref`, `cabinetInfoLinkTiles`, contract pages, `ConfirmStepClient`

Проверки (выполнены): vitest help-content + booking (`bookingNewHref`, `*-page`, `ConfirmStepClient`) — ~32 tests; `tsc --noEmit` webapp

## Phase 4 — CMS контент и документация — закрыта 2026-06-03

- [x] `/app/patient/about` + `routePaths.patientAbout` + `PatientAboutSiteLink`
- [x] Slug `booking` в `canonicalSlugs.ts` (8-й канон); `/help/booking` → `HelpBookingAboutLink` → `/about`
- [x] `CMS_EDITOR_CHECKLIST.md`; подсказка в `ContentForm` (help)
- [x] Финальный sync: `help.md`, `about.md`, `cabinet.md`, `README`/`LOG`, `TODO`, `ACTIVE_WORKQUEUE`, `DOCTOR_CMS`
- [x] Аудит: RTL `HelpBookingAboutLink`, `PatientAboutSiteLink`; усилен contract `about-page`

Проверки (выполнены): vitest `canonicalSlugs`, `about-page`, `PatientAboutSiteLink`, `HelpBookingAboutLink`, `help-booking-about-link`, help-content + booking

## Definition Of Done (весь план)
- [x] Структура `/help` и canonical slug зафиксированы и документированы (фаза 1)
- [x] Блок полезных ссылок на `/app/patient/booking/new` (фаза 2)
- [x] Страница `about` + ссылка на сайт + связь из `/help/booking` (фаза 4)
- [x] City-aware адреса СПб/Мск с fallback (фаза 3)
- [x] Редакторский чеклист CMS (фаза 4)
- [x] Тесты help-content + booking info links (фазы 1–4)
