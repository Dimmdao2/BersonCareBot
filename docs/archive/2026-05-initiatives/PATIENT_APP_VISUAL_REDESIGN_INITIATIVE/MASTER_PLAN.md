# MASTER PLAN — Patient App Visual Redesign

## 1. Контекст

`PATIENT_HOME_REDESIGN_INITIATIVE` уже зафиксировала продуктовую модель главной "Сегодня": блоки, CMS-источники, прогресс, mood, reminders, plan, subscription carousel. Та инициатива закрыта; её PROMPTS файл и `.cursor/plans/archive/phase_3_*` / `phase_4.5_*` помечены как архив.

Новая задача — не менять модель данных, а привести patient UI к единому визуальному языку из `VISUAL_SYSTEM_SPEC.md`.

Главная опасность: один большой EXEC почти наверняка приведет к хаотичному diff, дублированию Tailwind-классов и поломке тестов. Поэтому работа разбита на малые visual-фазы.

## 2. Нормативные источники

Основные:

- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` — визуальная система и mapping к коду.
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md` — правила этой инициативы.
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md` — runtime/data constraints (без исполнения старых PROMPT'ов).
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md` — редакционный ориентир, не runtime source.

Repository rules:

- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/000-critical-integration-config-in-db.mdc`
- `.cursor/rules/runtime-config-env-vs-db.mdc`
- `.cursor/rules/system-settings-integrator-mirror.mdc`
- `.cursor/rules/pre-push-ci.mdc`

## 3. Absolute rules

- Do not hardcode slugs from `CONTENT_PLAN.md`.
- Do not add env vars.
- Do not redesign doctor/admin UI.
- Do not add billing/gating/subscription logic.
- Do not alter treatment program, course engine, or LFK tables.
- Do not restore old patient floating FAB.
- Do not add one-off visual classes when a shared patient primitive can cover the role.
- Do not run full `pnpm run ci` after every step.
- Do not execute prompts from `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` — закрытая инициатива.
- Do not name new CSS variables with `*-new`, `*-v2`, `*-tmp` suffixes.
- Update `LOG.md` after every EXEC/FIX.

## 4. Out of scope (other patient pages)

Эта инициатива редизайнит **только главную `/app/patient`**, plus shared shell/nav/primitives.

Following patient routes are explicitly out of scope and **must not be redesigned**:

- `/app/patient/booking/*`
- `/app/patient/reminders/*`
- `/app/patient/diary/*`
- `/app/patient/profile/*`
- `/app/patient/content/*`
- `/app/patient/courses/*`
- `/app/patient/lfk/*`
- `/app/patient/practice/*`

Они получают новый shell/nav и могут пользоваться общими primitives как побочный эффект, но их внутренние компоненты не меняются. Если EXEC обнаруживает, что какой-то primitive ломает другую patient-страницу — он откатывает изменение и фиксирует в `LOG.md` для будущей follow-up инициативы.

## 5. Target navigation

Mobile/tablet (`< lg`):

- bottom nav visible;
- top desktop nav hidden;
- bottom items: `Сегодня`, `Запись`, `Разминки`, `План`, `Дневник`;
- `Профиль` in top/right header icon;
- settings inside profile, no separate gear;
- inner mobile pages may show `Back`;
- no top `Home`.

Desktop (`lg+`):

- desktop top nav visible;
- bottom nav hidden;
- no patient `Back`;
- no separate `Home`;
- left brand: icon/logo + `BersonCare`;
- nav items: `Сегодня`, `Запись`, `Разминки`, `План`, `Дневник`;
- right: notifications if enabled + profile.

## 6. CSS variable naming policy

Старые переменные (`--patient-radius`, `--patient-radius-lg`, `--patient-bg`, `--patient-surface`, `--patient-touch`, `--patient-gap`) сохраняются неизменно. Их usages не мигрируются в этой инициативе.

Новые patient-токены именуются семантически без суффиксов `*-new`/`*-v2`/`*-tmp`. Допустимые имена:

- `--patient-card-radius-mobile`
- `--patient-card-radius-desktop`
- `--patient-hero-radius-mobile`
- `--patient-hero-radius-desktop`
- `--patient-pill-radius`
- `--patient-shadow-card-mobile`
- `--patient-shadow-card-desktop`
- `--patient-shadow-nav`
- `--patient-color-primary`, `--patient-color-primary-soft`
- `--patient-color-success`, `--patient-color-success-soft`
- `--patient-color-warning`, `--patient-color-warning-soft`
- `--patient-color-danger`, `--patient-color-danger-soft`
- `--patient-text-primary`, `--patient-text-secondary`, `--patient-text-muted`
- `--patient-border`, `--patient-page-bg`, `--patient-card-bg`

Если возникает конфликт между желаемым именем и существующей переменной — фиксировать в `LOG.md` и выбирать имя, которое не повторяет старое.

## 7. Mobile max-width

Mobile patient max-width меняется с `480px` на `430px` (per `VISUAL_SYSTEM_SPEC.md §1`). Это изменение делается **в Phase 2 (Navigation)** одновременно с правкой `PatientBottomNav` контейнера, потому что bottom nav и контентный контейнер должны иметь идентичный `max-width`. Phase 1 эту правку не делает, чтобы не оставлять рассинхронизованный layout между токенами и навигацией.

## 8. Phase overview

### Phase 0 — Inventory and exact implementation plan

Readonly phase. Confirm current code state, test files, dependency points, likely diff shape.

Deliverables:

- `PLAN_INVENTORY.md` in this initiative folder.
- Updated `LOG.md`.
- Clear GO/NO-GO for Phase 1.

### Phase 1 — Foundation

Add patient-scoped visual tokens and shared patient primitives while preserving existing behavior.

Scope:

- `globals.css`;
- `AppShell.tsx` — **только page background**, не max-width;
- `button-variants.ts` or patient-specific button helpers;
- `patientHomeCardStyles.ts` or nearby patient visual helper;
- no full home card redesign;
- no nav changes;
- **no max-width changes** — отложено до Phase 2.

Deliverables:

- patient tokens with semantic names;
- patient page background `#F7F8FB`;
- card/button/badge/icon helpers;
- existing CSS variables preserved;
- updated tests if changed code affects them;
- `LOG.md`.

### Phase 2 — Navigation

Implement navigation model from `VISUAL_SYSTEM_SPEC.md` and finalize patient max-width.

Scope:

- `navigation.ts`;
- `PatientBottomNav.tsx`;
- new `PatientTopNav.tsx` if needed;
- `PatientHeader.tsx` / `PatientGatedHeader.tsx`;
- `AppShell.tsx` — max-width `430px` для mobile patient + max-width `1120-1200px` для desktop;
- tests for nav/header/shell.

Deliverables:

- bottom nav visible `< lg`, hidden `lg+`;
- desktop top nav visible `lg+`, hidden `< lg`;
- mutual exclusivity between bottom and top nav verified by tests;
- mobile patient max-width `430px`;
- desktop patient `patient-wide` layout aligned with top nav;
- no desktop `Back`;
- no top `Home`;
- profile right;
- settings gear absent from patient header;
- `LOG.md`.

### Phase 3 — Home primary blocks

Redesign the most visible top part of patient home.

Scope:

- `PatientHomeTodayLayout.tsx`;
- `PatientHomeGreeting.tsx`;
- `PatientHomeDailyWarmupCard.tsx`;
- `PatientHomeBookingCard.tsx`;
- `PatientHomeSituationsRow.tsx`;
- related tests.

Deliverables:

- dashboard layout;
- greeting with **mandatory** time-of-day prefix using `getAppDisplayTimeZone()`;
- large gradient hero;
- success appointment card;
- situation icon tiles;
- `LOG.md`.

### Phase 4 — Home secondary blocks

Redesign remaining home cards and carousel.

Scope:

- `PatientHomeProgressBlock.tsx`;
- `PatientHomeNextReminderCard.tsx`;
- `PatientHomeMoodCheckin.tsx`;
- `PatientHomeSosCard.tsx`;
- `PatientHomePlanCard.tsx`;
- `PatientHomeSubscriptionCarousel.tsx`;
- `PatientHomeCoursesRow.tsx`;
- related tests.

Deliverables:

- progress + streak two-region card;
- warning reminder card;
- mood gradient card;
- danger SOS card with **always-icon-circle** layout (image, если есть, остаётся декоративным акцентом);
- plan card;
- subscription/courses on shared visual primitives;
- `LOG.md`.

### Phase 5 — Tests, QA, cleanup

Finalize tests, clean dead styles, document residual visual gaps.

Scope:

- all tests touched by previous phases;
- `LOG.md`;
- optional `AUDIT_VISUAL_FINAL.md`;
- docs updates.

Hard scope limits:

- **no other patient pages**;
- no `buttonVariants` doctor/admin refactor;
- no migration of legacy `--patient-radius*` usages;
- no broad TypeScript/React refactor outside primitives.

Deliverables:

- targeted tests passing;
- webapp typecheck/lint passing if scope warrants;
- no obvious stale classes within patient home/shell/nav;
- documented visual QA checklist;
- no full CI unless requested or before push.

## 9. Detailed dependency order

Do not start Phase 2 before Phase 1 passes audit or has `NO MANDATORY FIXES`.

Do not start Phase 3 before Phase 2 navigation behavior is stable. Home layout depends on shell/nav. Также Phase 3/4 не должны "доделывать" max-width или background, потому что эти параметры зафиксированы Phase 1/2.

Do not start Phase 4 before Phase 3 primitives and card style decisions are stable. Secondary blocks should reuse the same helpers.

Do not run Phase 5 cleanup before all visual phases have completed or been explicitly stopped.

## 10. Testing strategy

Use minimal sufficient checks per phase:

- Phase 0: no tests unless inventory discovers broken baseline.
- Phase 1: tests for changed shared helpers/shell; typecheck if TS changed.
- Phase 2: nav/header/shell tests, **must include mutual-exclusivity test for nav at `< lg` vs `lg+`**.
- Phase 3: primary home block tests.
- Phase 4: secondary home block tests.
- Phase 5: all impacted targeted tests + webapp typecheck/lint if previous phases changed TS/React widely.

Full CI is reserved for:

- explicit user request;
- before push;
- repo-level config changes;
- final pre-push rehearsal.

## 11. Documentation strategy

Every EXEC/FIX must update `LOG.md`. Recommended to attach screenshot links (mobile + desktop) for visible changes.

If an implementation deliberately diverges from `VISUAL_SYSTEM_SPEC.md`, the agent must:

1. record exact reason in `LOG.md`;
2. mark whether divergence is temporary or product decision;
3. if product decision, update `VISUAL_SYSTEM_SPEC.md` or this initiative plan.

## 12. Model recommendations

Default route across **all** phases including final audit:

- PLAN: Composer 2.
- EXEC: Composer 2.
- AUDIT: Composer 2.
- FIX: Composer 2.

Escalate only when explicitly justified:

- Phase 2 EXEC — Codex 5.3 only if Composer 2 produces broken nav/header refactor in two consecutive attempts.
- Phase 5 final audit — GPT 5.5 only if previous Composer 2 audits gave contradictory findings or user explicitly asks for independent review.
- Opus 4.7 — only by explicit user request for unresolved high-risk contradictions.
- Sonnet 4.6 — not in default route.

