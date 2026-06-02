# help-content — журнал

## 2026-06-03 — План patient_help_booking_surface, фаза 1 (IA + slug)

**Сделано:** семь канонических slug и `HELP_CANONICAL_ARTICLE_IA` в `canonicalSlugs.ts`; `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` + `resolvePublishedServicesPricingSlug` (legacy `cost`); `buildCabinetInfoLinkTiles` / `CabinetInfoLinks` (RSC); подсказка CMS в `ContentForm`; доки `help/help.md`, `cabinet/cabinet.md`, `README.md`, `docs/TODO.md`, `ACTIVE_WORKQUEUE.md`, `DOCTOR_CMS_AND_RUNTIME.md`.

**Не в scope фазы 1:** `/app/patient/about`, city-aware адреса, редакторский чеклист CMS.

## 2026-06-03 — План patient_help_booking_surface, фаза 2 (полезные ссылки на «Запись»)

**Сделано:** `CabinetInfoLinks` с `surface="booking"` под `BookingUpcomingSection` в `booking/new/page.tsx`; `omitBookingCta`; плитка `about` в `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`; `CabinetInfoLinksCard` + RTL/contract-тесты.

**План:** [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md) — фаза 2 закрыта.

**Проверки:** vitest `help-content`, `CabinetInfoLinksCard`, `cabinetInfoLinkTiles`, `booking-new-page`, `revalidatePatientContentPaths` (`booking/new`); `tsc --noEmit` webapp.

**Аудит (тот же день):** в `revalidatePatientContentPaths` добавлен `revalidatePath(routePaths.bookingNew)` при `section=help` — иначе плитки на «Запись» не обновлялись после публикации статей в CMS.

## 2026-06-03 — План patient_help_booking_surface, фаза 3 (city-aware адрес) — закрыта

**Сделано:** `patientHelpAddressLink.ts`; `buildCabinetInfoLinkTiles({ bookingCityCode })`; `booking/new/page.tsx`; `bookingNewHref.ts` (wizard back/success); `/app/patient/address` без изменений.

**Аудит и ревью:** alias `msk`; contract-тесты service/confirm/booking-new; нераспознанный `?cityCode=` → fallback на snapshot; reschedule → `successRedirectPath` с городом. Доки: `booking.md`, `cabinet.md`, `help.md`, `DOCTOR_CMS`, `TODO`, `ACTIVE_WORKQUEUE`, APP_RESTRUCTURE LOG.

**План:** [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md) — фаза 3 `completed`.

**Проверки:** vitest help-content + booking (~32 tests); `tsc --noEmit` webapp.

## 2026-06-03 — План patient_help_booking_surface, фаза 4 (about + CMS чеклист) — закрыта

**Сделано:** `/app/patient/about`; slug `booking` в canonical IA; `HelpBookingAboutLink` на `/help/booking`; `CMS_EDITOR_CHECKLIST.md`; `PatientAboutSiteLink` (reuse на «Запись»); sync docs/plan.

**План:** [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md) — план закрыт (ф4).

**Проверки:** vitest `canonicalSlugs`, `about-page`, `help-booking-about-link`, help-content + booking.

**Аудит (тот же день):** RTL `HelpBookingAboutLink`, `PatientAboutSiteLink`; contract `about-page` + `routePaths.patientAbout`; `cabinet.md` про `/about` и связь с `booking`; `docs/README.md` (план закрыт ф1–4); trim slug на `[slug]/page` для CTA `booking`.

## 2026-06-03 — План patient_help_booking_surface: финальная синхронизация docs/plan

**Статус:** план **закрыт** (фазы 1–4). YAML `todos` — все `completed`. См. [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md).

**Коммиты:** `89201d96` · `06b4ff59`/`dfebf1e5` · `231719e0` · `5568a397` · `79ada87e`.
