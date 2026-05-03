# STAGE B5 PLAN — Комплексы ЛФК: UX pass-1 и фикс «иконки глаза»

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Диагностировать ожидания vs реализацию по **«иконке глаза»** (сейчас в списке это **не кнопка**, а индикатор `published` — см. `PRE_IMPLEMENTATION_DECISIONS`), улучшить читаемость списка и карточки комплекса; подключить фильтры **B1**.

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.7, §3 B5.

## 2. Hard gates before coding

- **B1** закрыт (две оси в UI для ЛФК ↔ `status` в БД).

## 3. In scope / out of scope

### In scope

- Корневая причина бага «глаз» (если подтверждён) + регрессионный smoke.
- Список: превью, счётчик упражнений, отображение **draft / published / archived** из единого `status` + фильтры B1.
- Карточка: зоны метаданных / упражнений / действий; явные CTA сохранения/публикации/архивации.

### Out of scope

- Изменение доменной модели комплекса (только UI/поведение кнопок и фильтров).

## 4. Likely files

- [`apps/webapp/src/app/app/doctor/lfk-templates/`](../../apps/webapp/src/app/app/doctor/lfk-templates/)

## 5. Execution checklist

1. [ ] Воспроизведение + фикс.
2. [ ] Список + карточка по критериям ТЗ.
3. [ ] E2E или manual script публикация / архив / восстановление.
4. [ ] Сверка с [`../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

## 6. Stage DoD

- Критерии ТЗ §6 для B5.
- [`LOG.md`](LOG.md).
