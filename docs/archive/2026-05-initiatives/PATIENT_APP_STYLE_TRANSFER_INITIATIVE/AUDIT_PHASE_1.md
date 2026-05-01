# AUDIT PHASE 1 — Patient App Style Transfer

Дата аудита: **2026-05-01**. Режим: **AUDIT Phase 1** (shared style primitives). Root `pnpm run ci` **не** запускался.

## 1. Verdict

**`PASS`**

## 2. Style-Only Scope Check

| Вопрос | Результат |
|--------|-----------|
| Content/copy не менялся? | **Да** — по `LOG.md` и диффу scope менялся только `patientVisual.ts` + `LOG.md`; строки UI и страницы patient не редактировались. |
| Порядок секций / structure / flow? | **Да** — без правок `page.tsx` и клиентов маршрутов. |
| Ссылки, маршруты, query params? | **Да** — не затрагивались. |
| Data fetching? | **Да** — без изменений. |
| Services / repos / API / migrations? | **Да** — не трогались. |
| Doctor / admin? | **Да** — изменён только `apps/webapp/src/shared/ui/patientVisual.ts` (как разрешено Phase 1). Глобальные `buttonVariants` / shadcn `Card` не менялись; импортов из `app/app/doctor/**` или `settings/patient-home/**` в изменениях нет. |
| Patient primitives вместо разовой стилизации? | **Да на уровне Phase 1** — добавлены общие константы классов в `patientVisual.ts` на `--patient-*` токенах; страницы пока **не** переведены на них (это Phase 2+), что соответствует `01_PRIMITIVES_PLAN.md` («no page restyling yet»). |
| Home-specific geometry не обобщён? | **Да** — примитивы используют **карточные** токены (`--patient-card-radius-*`, `--patient-shadow-card-*`, `--patient-border`, …), не hero/mood/warm-gradient из `patientHomeCardStyles.ts`. В комментарии к `patientCardSurfaceTokens` и `patientPillClass` явно отсекаются hero / «метрики главной». `patientListItemClass` — плоская строка списка **без** тени полноформатной карточки, не сетка/фиксированная высота hero. |

## 3. Mandatory Fixes

```md
No mandatory fixes.
```

## 4. Minor Notes

- Новые примитивы **ещё не подключены** к страницам patient — ожидаемо до Phase 2; при подключении нужно сохранять style-only правила из `CHECKLISTS.md`.
- `patientVisual.ts` лежит в `shared/ui/` и теоретически импортируем откуда угодно; классы завязаны на токены `#app-shell-patient`. Использование вне patient shell визуально некорректно — это уже было верно для старых `patientButton*`; Phase 2+ импорты должны оставаться в patient UI.
- Отдельный `patientPrimitives.ts` не создан — размер файла позволяет, это допустимо по `01_PRIMITIVES_PLAN.md` (optional).

## 5. Checks Reviewed/Run

| Проверка | Статус |
|----------|--------|
| Ревью исходников `patientVisual.ts` | Выполнено в рамках аудита |
| `pnpm --dir apps/webapp exec eslint src/shared/ui/patientVisual.ts` | Зафиксировано в `LOG.md` как выполненное при Phase 1 EXEC; **в этой audit-сессии не повторялось** |
| `pnpm --dir apps/webapp typecheck` | То же |
| Root `pnpm run ci` | **Не запускался** — по инструкции аудита |
| Vitest | Новых компонентов/тестовых файлов по Phase 1 нет — тесты не требовались (`01_PRIMITIVES_PLAN.md`) |

## 6. Route/Component Coverage

**Охват Phase 1:** только модуль примитивов.

- **Маршруты / страницы:** намеренно **не** менялись (`01_PRIMITIVES_PLAN.md` Forbidden).
- **Компоненты:** изменён один файл — `patientVisual.ts` (class exports).
- **Состояния UI страниц:** не проверялись — визуально приложение не менялось (см. `LOG.md`).

## 7. Deferred Product/Content Questions

Без изменений: подключение примитивов к контенту страниц, empty-state copy, IA — **Phase 2+** и продукт по необходимости; в Phase 1 не решалось.

## 8. Readiness

- **Ready for next phase:** **yes** → **Phase 2** (static/read-only style pass по `02_STATIC_PAGES_STYLE_PLAN.md` и матрице `PLAN_INVENTORY.md` §1 Phase 2).
- **Mandatory fixes:** нет.

---

## Приложение — сверка с `01_PRIMITIVES_PLAN.md`

| Primitive checklist | Экспорт в `patientVisual.ts` |
|---------------------|------------------------------|
| Card base | `patientCardClass` |
| Card compact | `patientCardCompactClass` |
| List item/card | `patientListItemClass` |
| Form surface | `patientFormSurfaceClass` |
| Section surface | `patientSectionSurfaceClass` |
| Section title | `patientSectionTitleClass` |
| Body/muted text | `patientBodyTextClass`, `patientMutedTextClass` |
| Empty state | `patientEmptyStateClass` |
| Pill/badge | `patientPillClass` |
| Primary/secondary/danger action | `patientPrimaryActionClass`, `patientSecondaryActionClass`, `patientDangerActionClass` (алиасы на `patientButton*`) |
| Inline link | `patientInlineLinkClass` |

| Compatibility checklist | Статус |
|---------------------------|--------|
| Существующие экспорты `patientVisual.ts` сохранены | **Да** — `patientLineClamp*`, все `patientButton*` включая `patientButtonWarningOutlineClass` на месте |
| Имена семантические, без `v2`/`new`/`tmp` | **Да** |
| Токены `--patient-*` из `#app-shell-patient` | **Да** |
| Нет фиксированных высот/grid главной как общего примитива | **Да** |
