# Doctor UI Unification Initiative

Пофазное приведение UI кабинета врача (`/app/doctor/**`) к единой дизайн-системе без изменения бизнес-логики, API и схем БД.

## Канон

| Документ | Назначение |
|----------|------------|
| [`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) | Целевые паттерны (секции, каталоги, карточка клиента, диалоги) |
| [`AUDIT.md`](AUDIT.md) | Baseline-таблица отклонений по маршрутам и ключевым компонентам |
| [`LOG.md`](LOG.md) | Журнал исполнения по фазам и manual visual checklist |
| План фаз 0–5 | Файл `doctor-ui-unification-phases_1146e22e.plan.md` в Cursor plans (`~/.cursor/plans/`); перенос в `.cursor/plans/archive/` — по закрытию инициативы |

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
| 3–5 | pending |

**Граница 2 / 3:** фазы 1–2 закрыли foundation + high-impact (`/app/doctor`, `appointments`, `analytics/clients`, `online-intake`); следующий этап — client shell/tabs (3A/3B).
