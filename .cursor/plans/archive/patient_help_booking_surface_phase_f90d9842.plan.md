---
name: patient_help_booking_surface_phase
overview: "Patient UX справки на «Запись»: IA (ф1), блок ссылок на booking/new (ф2, 2026-06-03); about-страница, city-aware — ф3–4."
todos:
  - id: help-slugs-ia
    content: Зафиксировать IA раздела /help и канонические slug (preparation, after-visit, services-pricing, app-guide, address-spb/address-msk, about) + правило публикации через CMS
    status: completed
  - id: tests-docs-help-booking
    content: "Vitest help-content + CabinetInfoLinksCard RTL + booking-new-page contract; sync TODO/ACTIVE_WORKQUEUE/docs (ф1–2)."
    status: completed
  - id: booking-links-mount
    content: Смонтировать блок полезных ссылок под «Предстоящими записями» на /app/patient/booking/new с переиспользованием CabinetInfoLinks/buildCabinetInfoLinkTiles
    status: completed
  - id: about-page
    content: Добавить короткую страницу /app/patient/about с ссылкой на полный сайт и связать её из /help/booking
    status: pending
  - id: city-aware-address
    content: Заложить city-aware адреса (cityCode->адрес/ссылка) на экране записи и в полезных ссылках без ломки текущего /app/patient/address
    status: pending
  - id: cms-editor-checklist
    content: "Подготовить редакторский чеклист CMS: какие статьи обязательны к публикации для включения ссылок в booking/help"
    status: pending
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

## Phase 3 — City-Aware адреса
- Привязка `cityCode` в ссылках адреса (СПб/Мск) на booking flow.
- Fallback `/app/patient/address`.

## Phase 4 — CMS контент и документация
- Редакторский чеклист обязательных статей.
- Финальный sync docs по booking/help links.

## Definition Of Done (весь план)
- [x] Структура `/help` и canonical slug зафиксированы и документированы (фаза 1)
- [x] Блок полезных ссылок на `/app/patient/booking/new` (фаза 2)
- [ ] Страница `about` + ссылка на сайт
- [ ] City-aware адреса СПб/Мск с fallback
- [x] Тесты help-content + booking info links (фазы 1–2)
