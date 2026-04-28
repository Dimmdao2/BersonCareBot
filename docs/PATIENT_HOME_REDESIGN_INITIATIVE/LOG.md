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

## 2026-04-28 — Phase 4 start

- Phase: `Phase 4 — Главная пациента: планшет и десктоп`
- Status: `completed`

### Planned scope

- Add a patient-wide shell mode only for `/app/patient`.
- Keep all other patient routes on the narrow `variant="patient"` shell.
- Add `lg+` two-column layout in `PatientHomeToday`.
- Keep mobile and `md` as one narrow column.
- Render `subscription_carousel` full-width under the two columns on `lg+`.
- Add available webapp tests/snapshots for layout behavior.

### Explicit constraints acknowledged

- Do not change CMS or database schema/data.
- Do not change other patient pages.
- Do not hardcode editorial slugs from `CONTENT_PLAN.md`.
- Do not change public/anonymous access policy from Phase 4.5.

## 2026-04-28 — Phase 4 execution result

- Phase: `Phase 4 — Главная пациента: планшет и десктоп`
- Status: `completed`

### Implemented

- Added `AppShell` patient mode `variant="patient-wide"`: narrow `max-w-[480px]` below `lg`, `lg:max-w-6xl` on desktop.
- Applied `patient-wide` only in [`apps/webapp/src/app/app/patient/page.tsx`](apps/webapp/src/app/app/patient/page.tsx).
- Added [`PatientHomeTodayLayout.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx):
  - mobile and `md` remain a single-column stack in runtime block order;
  - `lg+` uses a 60/40 grid;
  - `subscription_carousel` spans both columns below the main blocks;
  - blocks render once (no duplicated DOM/id pairs between mobile and desktop).
- Updated `PatientHomeToday` to skip empty resolved blocks before layout placement.
- Updated [`apps/webapp/src/modules/patient-home/patient-home.md`](apps/webapp/src/modules/patient-home/patient-home.md) with the desktop layout contract.
- Added layout tests:
  - [`apps/webapp/src/shared/ui/AppShell.test.tsx`](apps/webapp/src/shared/ui/AppShell.test.tsx)
  - [`apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.test.tsx)

### Explicit constraints

- Other patient pages remain on `variant="patient"`.
- CMS and DB were not changed.
- No editorial slug from `CONTENT_PLAN.md` was hardcoded.
- Phase 4.5 public/anonymous access policy was not changed.

### Gate (phase-level webapp)

- `pnpm --dir apps/webapp exec vitest run src/shared/ui/AppShell.test.tsx src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/modules/patient-home/patientHomeBlockPolicy.test.ts src/modules/patient-home/patientHomeReminderPick.test.ts src/modules/patient-home/patientHomeResolvers.test.ts src/modules/patient-home/todayConfig.test.ts` — pass (`Test Files 10 passed`, `Tests 30 passed`).
- `pnpm --dir apps/webapp exec tsc --noEmit` — pass.
- `pnpm --dir apps/webapp lint` — pass.
- `pnpm test:webapp` — pass (`Test Files 390 passed | 5 skipped`, `Tests 1971 passed | 8 skipped`).
- Full CI was not run (no repo-level scope, no push/pre-push request).

## 2026-04-28 — FIX post-audit (Phase 4)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_4.md` only).
- `AUDIT_PHASE_4.md` §2 **Mandatory fixes:** `None` — no application, CMS, or DB changes required.
- Action: confirmed scope; updated this log only.
- Verification: targeted Phase 4 Vitest bundle from `AUDIT_PHASE_4.md` §4.

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/shared/ui/AppShell.test.tsx src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/modules/patient-home/patientHomeBlockPolicy.test.ts src/modules/patient-home/patientHomeReminderPick.test.ts src/modules/patient-home/patientHomeResolvers.test.ts src/modules/patient-home/todayConfig.test.ts`
- Result: `Test Files 10 passed (10)`, `Tests 30 passed (30)`.

## 2026-04-28 — Phase 4.5 execution result

- Phase: `Phase 4.5 — Публичная главная пациента и auth-on-drilldown`
- Status: `completed`

### Implemented

- [`patientLayoutAllowsUnauthenticatedAccess`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts): только канонический `/app/patient` (нормализация trailing slash); пустой pathname → `false`.
- [`apps/webapp/src/app/app/patient/layout.tsx`](apps/webapp/src/app/app/patient/layout.tsx): при `!session` и разрешённой главной — рендер `PatientClientLayout` без редиректа; иначе редирект на `/app?next=...`.
- [`apps/webapp/src/app/app/patient/page.tsx`](apps/webapp/src/app/app/patient/page.tsx): без сессии — `AppShell` с `user={null}`, `patientHideRightIcons`, `patientHideHome`, non-personal `PatientHomeToday`; без `redirect`.
- [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx): `session: AppSession | null`; персональные запросы только при `personalTierOk && session`; drilldown href и strip `/api/media/` для анонима.
- [`patientHomeGuestNav.ts`](apps/webapp/src/app/app/patient/home/patientHomeGuestNav.ts): `appLoginWithNextHref`, `hrefForPatientHomeDrilldown`, `stripApiMediaForAnonymousGuest`.
- Карточки: [`PatientHomeDailyWarmupCard`](apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx), [`PatientHomeBookingCard`](apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx), [`PatientHomeProgressBlock`](apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx), [`PatientHomeMoodCheckin`](apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx) — ветки anonymous vs onboarding.
- Экспорт policy из [`modules/platform-access/index.ts`](apps/webapp/src/modules/platform-access/index.ts).
- Тесты: расширен [`patientRouteApiPolicy.test.ts`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.test.ts); новые [`patientHomeGuestNav.test.ts`](apps/webapp/src/app/app/patient/home/patientHomeGuestNav.test.ts), [`PatientHomeToday.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx); обновлён [`PatientHomeBookingCard.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx).
- [`patient-home.md`](apps/webapp/src/modules/patient-home/patient-home.md) — кратко про Phase 4.5.

### Explicit constraints

- Вложенные `/app/patient/*` без сессии по-прежнему за редиректом; `/api/media/:id`, auth-модель, CMS/БД не менялись.
- Slug-и из `CONTENT_PLAN.md` не хардкодятся (в тестах — `fixture-*`).

### Gate (phase-level webapp)

- `pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientRouteApiPolicy.test.ts src/app/app/patient/home/patientHomeGuestNav.test.ts src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/modules/patient-home/patientHomeBlockPolicy.test.ts src/modules/patient-home/patientHomeReminderPick.test.ts src/modules/patient-home/patientHomeResolvers.test.ts src/modules/patient-home/todayConfig.test.ts` — pass.
- `pnpm --dir apps/webapp exec tsc --noEmit` — pass.
- `pnpm --dir apps/webapp lint` — pass.
- Full `pnpm run ci` не запускался (нет repo-level scope).

## 2026-04-28 — FIX post-audit (Phase 4.5)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_4_5.md` only).
- `AUDIT_PHASE_4_5.md` §2 **Mandatory fixes:** `None` — no application changes required.
- Action: confirmed scope; updated this log only.
- Verification: targeted Phase 4.5 Vitest bundle per `AUDIT_PHASE_4_5.md` §4.

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientRouteApiPolicy.test.ts src/app/app/patient/home/patientHomeGuestNav.test.ts src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx`
- Result: `Test Files 4 passed (4)`, `Tests 29 passed (29)`.

## 2026-04-28 — Push patient-home-redesign-initiative (Phase 4.5 + CI)

- План Phase 4.5 отмечен выполненным: в репозитории [`.cursor/plans/phase_4.5_patient_home_a2e6bd38.plan.md`](../../.cursor/plans/phase_4.5_patient_home_a2e6bd38.plan.md) (`phaseStatus: completed`, todos `completed`); тот же frontmatter синхронизирован с файлом плана в каталоге Cursor пользователя (`phase_4.5_patient_home_a2e6bd38.plan.md`).
- Перед пушем: `pnpm install --frozen-lockfile` и полный `pnpm run ci` — зелёный после добавления root `pnpm.overrides` для `postcss>=8.5.10` и `fast-xml-parser>=5.7.0` (устранение moderate advisories в `registry-prod-audit`).
- Коммит и `git push origin patient-home-redesign-initiative`.

## 2026-04-28 — Phase 5 start

- Phase: `Phase 5 — Прогресс выполнения и стрик`
- Status: `in_progress` (запись соответствует плану: до завершения работ зафиксированы scope и ограничения)

### Planned scope

- Таблица `patient_practice_completions`, Drizzle schema, миграция `0010_*`, CHECK/FK по README, без FK на `users`; [`ROLLBACK_SQL.md`](ROLLBACK_SQL.md).
- Модуль [`apps/webapp/src/modules/patient-practice/`](../../apps/webapp/src/modules/patient-practice/) с изоляцией слоя (без прямых импортов infra/db/repos из модулей).
- [`pgPatientPracticeCompletions.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts) только Drizzle; in-memory порт для тестов.
- `buildAppDeps().patientPractice`; `POST` / `GET` patient practice API; UI главной и страницы материала; `?from=daily_warmup` без slug из [`CONTENT_PLAN.md`](CONTENT_PLAN.md).
- Тесты по README §5.5; не менять дневники симптомов/ЛФК; без gamification.

### Explicit constraints (already acknowledged)

- Дневники симптомов и ЛФК вне scope изменений.
- Slug-и из CONTENT_PLAN не хардкодить в runtime.

## 2026-04-28 — Phase 5 execution result

- Phase: `Phase 5 — Прогресс выполнения и стрик`
- Status: `completed`

### Implemented

- Таблица `patient_practice_completions`: Drizzle schema [`apps/webapp/db/schema/patientPractice.ts`](../../apps/webapp/db/schema/patientPractice.ts), миграция [`apps/webapp/db/drizzle-migrations/0010_patient_practice_completions.sql`](../../apps/webapp/db/drizzle-migrations/0010_patient_practice_completions.sql), FK на `content_pages(id)` ON DELETE CASCADE, без FK на users; CHECK по `source` и `feeling`.
- Модуль [`apps/webapp/src/modules/patient-practice/`](../../apps/webapp/src/modules/patient-practice/) (ports, service, types, `streakLogic`, `patient-practice.md`).
- Репозитории: [`pgPatientPracticeCompletions.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts) (только Drizzle), [`inMemoryPatientPracticeCompletions.ts`](../../apps/webapp/src/infra/repos/inMemoryPatientPracticeCompletions.ts).
- DI: [`buildAppDeps.ts`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) → `patientPractice`.
- API: `POST /api/patient/practice/completion`, `GET /api/patient/practice/progress` с `requirePatientApiBusinessAccess`.
- UI: [`PatientHomeProgressBlock.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx) — реальные `todayDone`, цель, `streak`; [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) — загрузка прогресса при tier patient; [`PatientHomeDailyWarmupCard.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx) — ссылка с `?from=daily_warmup`; страница материала — [`PatientContentPracticeComplete.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx), обновлён [`page.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/page.tsx).
- Откат: [`ROLLBACK_SQL.md`](ROLLBACK_SQL.md) раздел `0010`.
- Тесты: service, streakLogic, [`pgPatientPracticeCompletions.test.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.test.ts) (smoke Drizzle-only + in-memory harness), API routes, ProgressBlock, DailyWarmupCard, ContentPracticeComplete, обновлён `PatientHomeToday.test.tsx`.

### Explicit constraints (Phase 5)

- Дневники симптомов и ЛФК не изменялись.
- Без gamification badges.
- Slug-и из `CONTENT_PLAN.md` не используются в runtime; источник `daily_warmup` только через query `from=daily_warmup`.

### Gate (phase-level webapp)

- Command: `pnpm --dir apps/webapp exec tsc --noEmit` — Result: pass (exit 0).
- Command: `pnpm --dir apps/webapp lint` — Result: pass (exit 0).
- Command: `pnpm --dir apps/webapp exec vitest run` on Phase 5 paths:
  - `src/modules/patient-practice/service.test.ts`
  - `src/modules/patient-practice/streakLogic.test.ts`
  - `src/infra/repos/pgPatientPracticeCompletions.test.ts`
  - `src/app/api/patient/practice/completion/route.test.ts`
  - `src/app/api/patient/practice/progress/route.test.ts`
  - `src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`
  - `src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx`
  - `src/app/app/patient/home/PatientHomeToday.test.tsx`
  - `src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx`
- Result: `Test Files 9 passed (9)`, `Tests 24 passed (24)`.

## 2026-04-28 — FIX post-audit (Phase 5)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_5.md` only).
- `AUDIT_PHASE_5.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; updated this log only (дневники симптомов/ЛФК не затрагивались).
- Verification (targeted Phase 5 Vitest bundle per `AUDIT_PHASE_5.md` §4).

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run` on the Phase 5 bundle (nine paths, см. § Gate у execution result выше).
- Result: `Test Files 9 passed (9)`, `Tests 24 passed (24)`.

## 2026-04-28 — Phase 6 start

- Phase: `Phase 6 — Чек-ин самочувствия`
- Status: `in_progress`

### Planned scope

- Add `patient_daily_mood` with primary key `(user_id, mood_date)` and score `1..5`.
- Use `getAppDisplayTimeZone()` to compute the local `mood_date`.
- Add isolated module `modules/patient-mood` with ports/service/types/docs.
- Add Drizzle-only runtime repo `pgPatientDailyMood` and in-memory repo for tests.
- Wire `buildAppDeps().patientMood`.
- Add thin `POST /api/patient/mood` and `GET /api/patient/mood/today`.
- Replace `PatientHomeMoodCheckin` placeholder with 5 emoji buttons and optimistic update.
- Add Phase 6 tests and phase-level webapp checks.

### Explicit constraints acknowledged

- Do not link mood to symptom diary or LFK diary.
- Do not add mood comments, tags, or history UI.
- Do not hardcode slugs from `CONTENT_PLAN.md`.
- Do not add env vars, `system_settings`, or CI workflow changes.
- Runtime access for the new table must use Drizzle ORM only.

## 2026-04-28 — Phase 6 execution result

- Phase: `Phase 6 — Чек-ин самочувствия`
- Status: `completed`

### Implemented

- Таблица `patient_daily_mood`: Drizzle schema [`apps/webapp/db/schema/patientDailyMood.ts`](../../apps/webapp/db/schema/patientDailyMood.ts), миграция [`apps/webapp/db/drizzle-migrations/0011_patient_daily_mood.sql`](../../apps/webapp/db/drizzle-migrations/0011_patient_daily_mood.sql), primary key `(user_id, mood_date)`, CHECK `score 1..5`, без FK на users.
- `drizzle.config.ts`, `db/schema/index.ts`, Drizzle meta snapshot обновлены; `db:verify-public-table-count` дополнен schema-файлами Phase 5/6.
- Модуль [`apps/webapp/src/modules/patient-mood/`](../../apps/webapp/src/modules/patient-mood/) (ports, service, types, `moodDate`, `patient-mood.md`).
- Репозитории: [`pgPatientDailyMood.ts`](../../apps/webapp/src/infra/repos/pgPatientDailyMood.ts) (Drizzle ORM only), [`inMemoryPatientDailyMood.ts`](../../apps/webapp/src/infra/repos/inMemoryPatientDailyMood.ts).
- DI: [`buildAppDeps.ts`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) → `patientMood`.
- API: `POST /api/patient/mood`, `GET /api/patient/mood/today` с `requirePatientApiBusinessAccess`, `getAppDisplayTimeZone()`, thin route handlers.
- UI: [`PatientHomeMoodCheckin.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx) — 5 emoji-кнопок, подсветка сохранённого score, optimistic update, rollback on error; [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) передаёт `initialMood`.
- Откат: [`ROLLBACK_SQL.md`](ROLLBACK_SQL.md) раздел `0011`.

### Explicit constraints (Phase 6)

- Mood не связан с symptom diary, LFK diary или `patient_practice_completions.feeling`.
- Комментарии, теги настроения и история mood не добавлялись.
- Slug-и из `CONTENT_PLAN.md` не используются в runtime.
- Новые env vars, `system_settings`, `ALLOWED_KEYS` и CI workflow не менялись.

### Gate (phase-level webapp)

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/patient-mood/moodDate.test.ts src/modules/patient-mood/service.test.ts src/infra/repos/pgPatientDailyMood.test.ts src/app/api/patient/mood/route.test.ts src/app/api/patient/mood/today/route.test.ts src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx`
- Result: `Test Files 7 passed (7)`, `Tests 20 passed (20)`.
- Command: `pnpm --dir apps/webapp exec tsc --noEmit` — Result: pass.
- Command: `pnpm --dir apps/webapp lint` — Result: pass.
- Command: `pnpm --dir apps/webapp run db:verify-public-table-count` — Result: pass (`116 public tables match pgTable exports`).
- Full CI was not run (no repo-level scope, no push/pre-push request).

## 2026-04-28 — FIX post-audit (Phase 6)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_6.md` only).
- `AUDIT_PHASE_6.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; plan todos for Phase 6 are already `completed`.
- Constraints re-confirmed: mood is not linked to symptom diary/LFK diary, no mood comments/tags/history, no slug hardcode from `CONTENT_PLAN.md`.
- Verification: targeted Phase 6 Vitest bundle per `AUDIT_PHASE_6.md` §4.

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/patient-mood/moodDate.test.ts src/modules/patient-mood/service.test.ts src/infra/repos/pgPatientDailyMood.test.ts src/app/api/patient/mood/route.test.ts src/app/api/patient/mood/today/route.test.ts src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx`
- Result: `Test Files 7 passed (7)`, `Tests 20 passed (20)`.

## 2026-04-28 — Phase 7 execution result

- Phase: `Phase 7 — Подписочная карусель и бейджи`
- Status: `completed`

### Implemented

- [`PatientHomeSubscriptionCarousel.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx): горизонтальный скролл с `snap-x snap-mandatory`, карточки `min-w-[280px] max-w-[320px]`, `scroll-padding` для peek; изображение/заголовок/бейдж по-прежнему из резолвера (`imageUrlOverride` → target image, `titleOverride` → title, `badgeLabel` → default «По подписке»).
- [`patientHomeResolvers.ts`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts): экспорт `DEFAULT_SUBSCRIPTION_BADGE`, `getSubscriptionCarouselSectionPresentation` — сопоставление slug раздела с `patient_home_block_items` блока `subscription_carousel` без хардкода редакционных slug-ов.
- [`sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx) + [`PatientSectionSubscriptionCallout.tsx`](../../apps/webapp/src/app/app/patient/sections/PatientSectionSubscriptionCallout.tsx): информационный блок при membership в карусели; контент не закрывается.
- Тесты: [`patientHomeResolvers.test.ts`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.test.ts), [`PatientHomeSubscriptionCarousel.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx), [`page.subscription.test.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.subscription.test.tsx).

### Explicit constraints (Phase 7)

- Нет платежей и paywall; нет gating по подписке.
- Slug-и из `CONTENT_PLAN.md` не используются в runtime; в тестах — только `fixture-*` slug-и.

### Gate (phase-level webapp)

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeResolvers.test.ts src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/sections/[slug]/page.subscription.test.tsx`
- Result: `Test Files 3 passed`, `Tests 12 passed`.
- Command: `pnpm --dir apps/webapp exec tsc --noEmit` — pass.
- Command: `pnpm --dir apps/webapp lint` — pass.
- Full CI was not run (no repo-level scope).

## 2026-04-28 — FIX post-audit (Phase 7)

- Mode: `FIX` (mandatory items from `AUDIT_PHASE_7.md` only).
- `AUDIT_PHASE_7.md` §2 **Mandatory fixes:** `None` — no application or schema changes required.
- Action: confirmed scope; no code changes.
- Constraints re-confirmed: no payments, no subscription gating, no editorial slug hardcode from `CONTENT_PLAN.md`.
- Verification: targeted Phase 7 Vitest bundle per `AUDIT_PHASE_7.md` §4.

### Gate

- Command: `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeResolvers.test.ts src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/sections/[slug]/page.subscription.test.tsx`
- Result: `Test Files 3 passed (3)`, `Tests 12 passed (12)`.

