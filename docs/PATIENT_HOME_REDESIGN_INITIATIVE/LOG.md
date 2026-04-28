# PATIENT_HOME_REDESIGN_INITIATIVE — LOG

## 2026-04-28 — Phase 1 start

- Phase: `Phase 1 — БД и CMS: медиа разделов + настройка блоков главной`
- Status: `in_progress`
- Branch: `patient-home-redesign-initiative`

### Planned scope

- Add only `cover_image_url` and `icon_image_url` to `content_sections`.
- Add `patient_home_blocks` and `patient_home_block_items`.
- Seed fixed home blocks: `daily_warmup`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses`.
- Implement patient home blocks module + ports/repo + DI wiring.
- Extend CMS sections form with cover/icon media fields.
- Add admin page `/app/settings/patient-home` with preview, block actions, item dialogs, and reorder.
- Add Phase 1 tests.

### Explicit constraints acknowledged

- Do not rewrite patient home runtime page in this phase.
- Do not modify `content_pages`.
- Do not add `ALLOWED_KEYS` or any new env vars.
- Do not change courses model.
- Do not add `home_slot`, `home_sort_order`, `access_type` to `content_sections`.
- Do not hardcode slugs from `CONTENT_PLAN.md` in runtime logic.

## 2026-04-28 — Phase 1 execution result

- Status: `completed`

### Implemented

- DB schema: `content_sections.cover_image_url`, `content_sections.icon_image_url`.
- New tables: `patient_home_blocks`, `patient_home_block_items`.
- Seeded fixed blocks in migration `0008_material_frightful_four.sql`.
- Added `modules/patient-home` (block catalog, port, service, validation rules).
- Added infra repos for patient-home blocks:
  - `pgPatientHomeBlocks.ts` (Drizzle ORM)
  - `inMemoryPatientHomeBlocks.ts`
- DI wiring: `buildAppDeps().patientHomeBlocks`.
- CMS section form expanded with cover/icon media pickers + validation and persistence.
- Added section list thumbnails for cover/icon.
- Added admin settings page `/app/settings/patient-home`:
  - non-clickable preview items;
  - per-block menu `⋯` with show/hide for all blocks;
  - add/edit item dialogs only for: `daily_warmup`, `situations`, `subscription_carousel`, `courses`, `sos`;
  - reorder blocks in dedicated modal;
  - reorder items in edit dialog via drag-and-drop.

### Runtime contract checks

- No runtime hardcode of slugs from `CONTENT_PLAN.md`.
- `target_ref` remains polymorphic without FK to `content_pages`/`content_sections`/`courses`.

### Test and gate results

- Targeted Phase 1 tests: `PASS` (new repo/service/actions/RTL specs).
- `pnpm test:webapp`: `PASS`.
- `pnpm run ci`: failed only at final `audit` stage due registry vulnerabilities outside Phase 1 scope:
  - `postcss` advisory (`<8.5.10`)
  - `fast-xml-parser` advisory (`<5.7.0`)

### Test policy note

- Full `pnpm run ci` was run during Phase 1 under the older prompt wording.
- Per `.cursor/rules/test-execution-policy.md`, this should not be repeated after every phase.
- Future phases should use targeted/phase-level checks unless there is real repo-level scope, Phase 9 final rehearsal, explicit pre-push request, or user explicitly asks for full CI.

## 2026-04-28 — FIX post-audit (Phase 1)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_1.md` only).
- `AUDIT_PHASE_1.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; updated this log only.
- Verification (step-level, `.cursor/rules/test-execution-policy.md`): targeted Phase 1 Vitest bundle (8 files listed in `AUDIT_PHASE_1.md` §4).

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run` on the eight Phase 1 paths from `AUDIT_PHASE_1.md` §4.
- Result: `Test Files 8 passed (8)`, `Tests 25 passed (25)`.

## 2026-04-28 — Phase 2 execution result

- Phase: `Phase 2 — Промо-материал курса + целевые настройки главной`
- Status: `completed`

### Implemented

- Schema + migration `0009_content_pages_linked_course.sql`: `content_pages.linked_course_id`, FK `content_pages_linked_course_fkey` → `courses(id)` ON DELETE SET NULL, index `idx_content_pages_linked_course`.
- `pgContentPages.ts`: порт переведён на Drizzle (`getDrizzle`), `ContentPageRow.linkedCourseId`, `ContentPageUpsertInput`; in-memory порт с полным поведением + `resetInMemoryContentPagesStoreForTests`.
- CMS: `ContentForm` — выбор опубликованного курса; `saveContentPage` — валидация UUID и проверка `status === "published"`; страницы `edit`/`new` подгружают список курсов.
- Пациент: CTA на `/app/patient/content/[slug]` при опубликованном курсе; ссылка на экземпляр программы или каталог с `?highlight=<courseId>` (UUID).
- `patient/courses` + `PatientCoursesCatalogClient` — подсветка карточки по `highlight`.
- `system_settings`: ключ `patient_home_daily_practice_target` в `ALLOWED_KEYS` и `ADMIN_SCOPE_KEYS`; валидация PATCH 1–10.
- `/app/settings/patient-home`: панель «Цель практик на главной» (`PatientHomePracticeTargetPanel`).
- `modules/patient-home/todayConfig.ts` — `getPatientHomeTodayConfig`, `parsePatientHomeDailyPracticeTarget`.
- Тесты: `pgContentPages.test.ts`, расширены `actions.test.ts`, `ContentForm.test.tsx`, `route.test.ts`, `todayConfig.test.ts`.

### Explicit constraints (Phase 2)

- Не добавлены `patient_home_daily_warmup_page_slug`, `patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time`.
- Нет второго UI разминки в `AppParametersSection`.
- Slug-и из `CONTENT_PLAN.md` не хардкодятся.

### Gate (phase-level webapp)

- `pnpm --dir apps/webapp exec tsc --noEmit` — pass
- `pnpm --dir apps/webapp lint` — pass
- `pnpm test:webapp` (корень) — pass (`Test Files 381 passed`, `Tests 1947 passed`)

## 2026-04-28 — FIX post-audit (Phase 2)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_2.md` only).
- `AUDIT_PHASE_2.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; updated this log only.
- Verification (targeted Phase 2 Vitest bundle per `AUDIT_PHASE_2.md` §4).

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgContentPages.test.ts src/modules/patient-home/todayConfig.test.ts src/app/app/doctor/content/actions.test.ts src/app/app/doctor/content/ContentForm.test.tsx src/app/api/admin/settings/route.test.ts`
- Result: `Test Files 5 passed (5)`, `Tests 48 passed (48)`.

## 2026-04-28 — Phase 3 execution result

- Phase: `Phase 3 — Главная пациента: мобильный layout «Сегодня»`
- Status: `completed`

### Implemented

- Переписан [`apps/webapp/src/app/app/patient/page.tsx`](apps/webapp/src/app/app/patient/page.tsx): `AppShell` title «Сегодня», `PatientHomeToday` + `LegalFooterLinks`; редирект при отсутствии сессии (согласовано с layout).
- Новая главная: [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) и компоненты `PatientHomeGreeting`, `PatientHomeDailyWarmupCard`, `PatientHomeBookingCard`, `PatientHomeSituationsRow`, `PatientHomeProgressBlock`, `PatientHomeNextReminderCard`, `PatientHomeMoodCheckin`, `PatientHomeSosCard`, `PatientHomePlanCard`, `PatientHomeSubscriptionCarousel`, `PatientHomeCoursesRow`, общие стили [`patientHomeCardStyles.ts`](apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts).
- Runtime-порядок и видимость: `deps.patientHomeBlocks.listBlocksWithItems()` + [`filterAndSortPatientHomeBlocks`](apps/webapp/src/modules/patient-home/patientHomeBlockPolicy.ts); персональные блоки (`progress`, `mood_checkin`, `next_reminder`, `plan`) скрыты при `patientRscPersonalDataGate !== allow`.
- Разминка: один вызов [`getPatientHomeTodayConfig`](apps/webapp/src/modules/patient-home/todayConfig.ts); видимость items и блока учтены в сервисе.
- Резолверы без infra: [`patientHomeResolvers.ts`](apps/webapp/src/modules/patient-home/patientHomeResolvers.ts), упрощённый выбор напоминания [`patientHomeReminderPick.ts`](apps/webapp/src/modules/patient-home/patientHomeReminderPick.ts).
- Удалены: `PatientMiniAppPatientHome.tsx`, `PatientHomeBrowserHero.tsx`, `PatientHomeExtraBlocks.tsx`.
- `ProgressBlock` / `MoodCheckin` — заглушки; таблицы practice/mood не добавлялись.
- Тесты: `patientHomeBlockPolicy.test.ts`, `patientHomeReminderPick.test.ts`, `patientHomeResolvers.test.ts`, RTL для `PatientHomeSituationsRow`, `PatientHomeSubscriptionCarousel`, `PatientHomeBookingCard`, `PatientHomeSosCard`.
- Обновлены [`patient-home.md`](apps/webapp/src/modules/patient-home/patient-home.md), этот `LOG.md`.

### Explicit constraints (Phase 3)

- Не менялись страницы `/app/patient/sections/[slug]`.
- Slug-и из `CONTENT_PLAN.md` не хардкодятся.
- Нет реальных сущностей progress/mood в БД.

### Gate (phase-level webapp)

- `pnpm --dir apps/webapp exec tsc --noEmit` — pass
- `pnpm --dir apps/webapp lint` — pass
- Targeted Vitest (Phase 3 bundle + `todayConfig.test.ts`): `Test Files 8 passed`, `Tests 26 passed`
- `pnpm test:webapp` (корень) — pass (`Test Files 388 passed`, `Tests 1967 passed`)

## 2026-04-28 — FIX post-audit (Phase 3)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_3.md` only).
- `AUDIT_PHASE_3.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; updated this log only.
- Verification (targeted Phase 3 Vitest bundle per `AUDIT_PHASE_3.md` §4).

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeBlockPolicy.test.ts src/modules/patient-home/patientHomeReminderPick.test.ts src/modules/patient-home/patientHomeResolvers.test.ts src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/modules/patient-home/todayConfig.test.ts`
- Result: `Test Files 8 passed (8)`, `Tests 26 passed (26)`.

## 2026-04-28 — Micro-fix (AUDIT_PHASE_3 §3 note 1)

- Mode: `FIX` (согласованный micro-fix по minor note, не Phase 4).
- Удалён неиспользуемый импорт `buildAppDeps` из [`apps/webapp/src/app/app/patient/page.tsx`](apps/webapp/src/app/app/patient/page.tsx).

### Gate

- Command: `pnpm --dir apps/webapp exec tsc --noEmit`
- Result: pass

