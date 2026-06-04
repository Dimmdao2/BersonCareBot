# Doctor UI Unification Initiative

Пофазное приведение UI кабинета врача (`/app/doctor/**`) к единой дизайн-системе без изменения бизнес-логики, API и схем БД.

## Канон

| Документ | Назначение |
|----------|------------|
| [`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) | Целевые паттерны (секции, каталоги, карточка клиента, диалоги) |
| [`.cursor/rules/doctor-ui-shared-primitives.mdc`](../../../../.cursor/rules/doctor-ui-shared-primitives.mdc) | Обязательные указания для агентов при правках `/app/doctor/**` |
| [`AUDIT.md`](AUDIT.md) | Baseline-таблица отклонений по маршрутам и ключевым компонентам |
| [`LOG.md`](LOG.md) | Журнал исполнения по фазам и manual visual checklist |
| План фаз 0–5 (архив) | [`.cursor/plans/archive/doctor-ui-unification-phases_1146e22e.plan.md`](../../../../.cursor/plans/archive/doctor-ui-unification-phases_1146e22e.plan.md) — **закрыт**, не держать активным в Cursor Build |

## Контекст density (не откатывать)

- [`docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md`](../../APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md)
- [`docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](../../APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md)

Новая работа — **визуальная согласованность** поверх уже уплотнённого UI.

## Scope

**In:** `apps/webapp/src/app/app/doctor/**`, `apps/webapp/src/shared/ui/**` (foundation), `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, эта папка.

**Out:** patient UI, API/DB/миграции, CI workflow, route structure, auth, загрузка данных, новые npm-зависимости.

## Фазы (кратко)

| Фаза | Содержание |
|------|------------|
| 0 | Baseline audit → `AUDIT.md` |
| 1 | `doctorVisual.ts` + опциональные тонкие wrappers |
| 2 | Today, appointments, analytics/clients, online-intake |
| 3A | Shell карточки клиента |
| 3B | Вкладки и панели клиента |
| 4A | Каталоги (split-layout эталон — exercises) |
| 4B | CMS, media, хвостовые маршруты, `admin/booking/**` |
| 5 | Ссылка в `docs/README.md`, manual checklist, полный `pnpm run ci` |

## Эталоны в коде

- Каталог: `exercises/ExercisesPageClient.tsx`
- Карточка клиента: `clients/doctorClientCardChrome.ts`
- Каркас: `shared/ui/doctorWorkspaceLayout.ts`, `shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx`

## Статус

| Фаза | Статус |
|------|--------|
| 0 | **done** (2026-06-04) — см. [`LOG.md`](LOG.md) |
| 1 | **done** (2026-06-04) — `doctorVisual.ts`, wrappers, пилот на «Сегодня»; см. [`LOG.md`](LOG.md) |
| 2 | **done** (2026-06-04) — `appointments`, `analytics/clients`, `online-intake`; см. [`LOG.md`](LOG.md) |
| 3A | **done** (2026-06-04) — shell карточки клиента; см. [`LOG.md`](LOG.md) |
| 3B | **done** (2026-06-04) — вкладки и панели клиента; см. [`LOG.md`](LOG.md) |
| 4A | **done** (2026-06-04) — каталоги doctor; см. [`LOG.md`](LOG.md) |
| 4B | **done** (2026-06-04) — CMS, media, tail routes; `admin/booking/**` → cancelled (BOOKING_REWORK); см. [`LOG.md`](LOG.md) |
| 5 | **done** (2026-06-04) — `docs/README.md` ссылка, гайд §20, code-level DoD; `pnpm run ci` — exit 0 в сессии закрытия (повтор перед push — по pre-push); см. [`LOG.md`](LOG.md) |

**Граница 4A / 4B:** split-каталоги и editor shells на `doctorVisual`; CMS, media, хвостовые маршруты — 4B.

## Закрытие инициативы (2026-06-04)

Инициатива **закрыта**. План фаз 0–5 выполнен: foundation (`doctorVisual.ts`, wrappers), массовое выравнивание doctor UI по `AUDIT.md`, гайд и оглавление синхронизированы.

**Ручная visual-проходка:** сделана **частично**, на уровне code-level и выборочных экранов — **первично принята**. Полная пиксельная отработка **каждой страницы** (desktop/mobile, density, actions) выносится в **отдельные задачи** по мере глобальной работы над интерфейсом; опираться на [`DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) и `.cursor/rules/doctor-ui-shared-primitives.mdc`, не на активный phased-план.

**Дальнейшая работа:** точечные/постраничные улучшения doctor UI — вне scope этой инициативы; `AUDIT.md` остаётся снимком закрытия, новые отклонения фиксировать в LOG соответствующей задачи или новой инициативы.
