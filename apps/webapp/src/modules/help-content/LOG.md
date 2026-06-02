# help-content — журнал

## 2026-06-03 — План patient_help_booking_surface, фаза 1 (IA + slug)

**Сделано:** семь канонических slug и `HELP_CANONICAL_ARTICLE_IA` в `canonicalSlugs.ts`; `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` + `resolvePublishedServicesPricingSlug` (legacy `cost`); `buildCabinetInfoLinkTiles` / `CabinetInfoLinks` (RSC); подсказка CMS в `ContentForm`; доки `help/help.md`, `cabinet/cabinet.md`, `README.md`, `docs/TODO.md`, `ACTIVE_WORKQUEUE.md`, `DOCTOR_CMS_AND_RUNTIME.md`.

**Не в scope фазы 1:** `/app/patient/about`, city-aware адреса, редакторский чеклист CMS.

## 2026-06-03 — План patient_help_booking_surface, фаза 2 (полезные ссылки на «Запись»)

**Сделано:** `CabinetInfoLinks` с `surface="booking"` под `BookingUpcomingSection` в `booking/new/page.tsx`; `omitBookingCta`; плитка `about` в `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`; `CabinetInfoLinksCard` + RTL/contract-тесты.

**План:** [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md) — фаза 2 закрыта.

**Проверки:** vitest `help-content`, `CabinetInfoLinksCard`, `cabinetInfoLinkTiles`, `booking-new-page`, `revalidatePatientContentPaths` (`booking/new`); `tsc --noEmit` webapp.

**Аудит (тот же день):** в `revalidatePatientContentPaths` добавлен `revalidatePath(routePaths.bookingNew)` при `section=help` — иначе плитки на «Запись» не обновлялись после публикации статей в CMS.
