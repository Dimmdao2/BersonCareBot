# PATIENT_APP_VISUAL_REDESIGN_INITIATIVE

Сквозной визуальный редизайн пациентской части webapp: patient shell, навигация, общие patient-примитивы и главная "Сегодня" в стиле референсов.

Эта инициатива является отдельным visual pass поверх завершенной `PATIENT_HOME_REDESIGN_INITIATIVE`. Она не меняет runtime-модель главной, CMS-контракты, данные программ лечения, billing или интеграции.

## Ветка

Все EXEC/FIX этой инициативы выполняются строго в ветке:

```
patient-app-visual-redesign-initiative
```

Перед каждым EXEC/FIX агент должен убедиться, что текущая ветка именно эта. Если ветка не существует — создать от актуальной ветки разработки. Не работать в ветке `patient-home-redesign-initiative` — там завершенная инициатива.

## Нормативные документы

Перед любым PLAN/EXEC/AUDIT/FIX читать:

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md` (только для runtime-контрактов; **сама инициатива закрыта**, её PROMPTS файл агент не исполняет)
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md` (только редакционный ориентир, не runtime источник)
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/000-critical-integration-config-in-db.mdc`
- `.cursor/rules/runtime-config-env-vs-db.mdc`

Архивные документы и планы (не исполнять, только для контекста):

- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_*.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/GLOBAL_AUDIT.md`
- `.cursor/plans/phase_3_patient_home_*.plan.md`
- `.cursor/plans/phase_4.5_patient_home_*.plan.md`

## Главная цель

Максимально приблизить пациентское приложение к визуальному направлению референсов:

- светлый фон `#F7F8FB`;
- мягкие белые и пастельные карточки;
- крупная hero-карточка "Разминка дня";
- нижняя навигация на mobile/tablet;
- верхняя бренд-навигация `BersonCare` на desktop;
- единые кнопки, карточки, бейджи, иконки и progress-примитивы;
- переиспользуемые стили для следующих patient-страниц.

## Объём работ (in scope / out of scope)

In scope:

- patient visual tokens (`globals.css`);
- `AppShell` patient-режим;
- `PatientHeader`/`PatientGatedHeader`/`PatientBottomNav` + новый `PatientTopNav`;
- `navigation.ts` для конфигурации nav-items;
- `button-variants.ts` (только если расширение безопасно для doctor/admin);
- `patientHomeCardStyles.ts` и общие patient visual helpers;
- все блоки главной `/app/patient` (`PatientHome*`);
- targeted tests для затронутых файлов.

Out of scope (другие инициативы):

- редизайн других patient-страниц: booking flow, reminders, diary, profile, content, courses;
- редизайн doctor/admin UI;
- изменение CMS-контрактов, services, repos, API routes, миграций;
- billing/subscription gating;
- изменения course engine/treatment program model;
- LFK таблиц.

Другие patient-страницы получают новый shell/nav и могут импортировать общие primitives как побочный эффект, но их внутренняя верстка переделывается отдельной follow-up инициативой.

## Референсы

Папка с референс-скриншотами: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`. Если папка пуста — пользователь должен положить туда экспорт макетов перед EXEC Phase 3/4. Без файлов в этой папке агент не угадает финальный визуальный язык; в этом случае EXEC Phase 3/4 идёт по `VISUAL_SYSTEM_SPEC.md` как единственному источнику и фиксирует это в `LOG.md`.

Референсы — это направление, не пиксельный контракт. Структура навигации намеренно отличается от макетов (см. `MASTER_PLAN.md §4`).

## Принцип реализации

Не писать новую UI-систему рядом. Сначала сопоставить ТЗ с текущими элементами и менять существующие общие точки:

- `apps/webapp/src/app/globals.css`
- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/shared/ui/PatientGatedHeader.tsx`
- `apps/webapp/src/shared/ui/PatientBottomNav.tsx`
- `apps/webapp/src/app-layer/routes/navigation.ts`
- `apps/webapp/src/components/ui/button-variants.ts`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
- `apps/webapp/src/app/app/patient/home/PatientHome*.tsx`

Новые компоненты добавлять только если текущая структура не покрывает роль, например `PatientTopNav`.

## Политика именования CSS-переменных

Запрещено использовать суффиксы `*-new`, `*-v2`, `*-tmp` для новых patient-токенов. Новые переменные именуются семантически:

- radii: `--patient-card-radius-mobile`, `--patient-card-radius-desktop`, `--patient-hero-radius-mobile`, `--patient-hero-radius-desktop`, `--patient-pill-radius`;
- shadows: `--patient-shadow-card-mobile`, `--patient-shadow-card-desktop`, `--patient-shadow-nav`;
- colors: `--patient-color-primary`, `--patient-color-primary-soft`, `--patient-color-success`, `--patient-color-success-soft`, `--patient-color-warning`, `--patient-color-warning-soft`, `--patient-color-danger`, `--patient-color-danger-soft`, `--patient-text-primary`, `--patient-text-secondary`, `--patient-text-muted`, `--patient-border`, `--patient-page-bg`, `--patient-card-bg`.

Старые переменные (`--patient-radius`, `--patient-radius-lg`, `--patient-bg`, `--patient-surface`, `--patient-touch`, `--patient-gap`) **не удалять и значения не менять** до отдельного миграционного pass.

## Фазы

1. `00_INVENTORY_PLAN.md` — readonly inventory и точный implementation plan.
2. `01_FOUNDATION_PLAN.md` — patient-scoped tokens, shell background, shared patient visual primitives.
3. `02_NAVIGATION_PLAN.md` — bottom nav `< lg`, desktop top nav `lg+`, header behavior, mobile `max-width: 430px`.
4. `03_HOME_PRIMARY_PLAN.md` — greeting/layout, hero, booking, situations.
5. `04_HOME_SECONDARY_PLAN.md` — progress/streak, reminder, mood, SOS, plan, subscription/courses.
6. `05_TESTS_QA_CLEANUP_PLAN.md` — tests, QA, cleanup, LOG/docs.

## Проверки

Не гонять полный `pnpm run ci` после каждого этапа.

Использовать уровень проверок по `.cursor/rules/test-execution-policy.md`:

- targeted tests для измененных компонентов;
- `pnpm --dir apps/webapp typecheck` после TypeScript/React changes;
- `pnpm --dir apps/webapp lint` после существенных UI/refactor changes;
- full CI только перед push, при явной просьбе пользователя, или если scope стал repo-level.

## LOG

Все PLAN/EXEC/FIX агенты обязаны вести `LOG.md` этой инициативы:

- дата;
- фаза;
- что изменено;
- какие проверки выполнены;
- какие visual gaps/deviations остались;
- какие вопросы требуют решения владельца продукта;
- (опционально) ссылки на скриншоты до/после.

## Модельная стратегия

По умолчанию использовать **Composer 2** на всех этапах, включая финальный аудит.

Эскалация только при реальном риске дорогих ошибок:

- **Codex 5.3** — если задача превращается в сложный React/refactor с большим числом файлов и тестов (Phase 2 при глубоком рефакторе nav/shell, Phase 5 при сложном cleanup).
- **GPT 5.5** — только если несколько Composer 2 audits дали противоречивые findings или пользователь явно попросил независимую проверку.
- **Sonnet 4.6** — не используется по умолчанию.
- **Opus 4.7** — только при high-risk финальном ревью с unresolved contradictions, по явной просьбе пользователя.

Не эскалировать модель "для красоты". Цель — сделать работу дешево и безопасно.

