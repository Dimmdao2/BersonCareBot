# help-content — журнал

## 2026-06-03 — План patient_help_booking_surface, фаза 1 (IA + slug)

**Сделано:** семь канонических slug и `HELP_CANONICAL_ARTICLE_IA` в `canonicalSlugs.ts`; `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` + `resolvePublishedServicesPricingSlug` (legacy `cost`); `buildCabinetInfoLinkTiles` / `CabinetInfoLinks` (RSC, монтирование на «Запись» — фаза 2); подсказка CMS в `ContentForm`; доки `help/help.md`, `cabinet/cabinet.md`, `README.md`, `docs/TODO.md`, `ACTIVE_WORKQUEUE.md`, `DOCTOR_CMS_AND_RUNTIME.md`.

**Не в scope фазы 1:** mount на `/booking/new`, `/app/patient/about`, city-aware адреса, редакторский чеклист CMS.

**План:** [`.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md`](../../../../.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md) — фаза 1 закрыта.

**Проверки:** `pnpm --dir apps/webapp exec vitest run src/modules/help-content/` (11 tests); `tsc --noEmit` webapp.
