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

## 5. Декомпозиция реализации

1. **Диагностика «глаза»**
   - воспроизвести текущий сценарий (что ожидал пользователь, что делает UI);
   - разделить: индикатор vs action-path publish/unpublish/archive.
2. **List pass**
   - карточки списка: превью/счётчик/статус;
   - корректные подписи `draft/published/archived`.
3. **Editor pass**
   - CTA блок: сохранить/опубликовать/архивировать;
   - понятные состояния disabled/pending.
4. **Filter pass**
   - интеграция двухосевой модели B1;
   - сохранение query на переходах.
5. **Verification**
   - regression сценарии публикации/архивирования/восстановления;
   - проверка usage/archive guard.

## 6. Execution checklist

1. [ ] Воспроизведение + классификация проблемы («индикатор UX» vs «реальный баг состояния»).
2. [ ] Список + карточка по критериям ТЗ.
3. [ ] Статусы и подписи согласованы с двухосевой моделью B1.
4. [ ] E2E/manual script публикация / архив / восстановление.
5. [ ] Сверка с [`../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).
6. [ ] `eslint` / `vitest` / `tsc` по затронутой области.
7. [ ] Smoke: статус в списке и в editor синхронизирован сразу после action.

## 7. Recommended checks (targeted)

```bash
rg "Eye|EyeOff|publish|archive|status" apps/webapp/src/app/app/doctor/lfk-templates
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <lfk-templates-related-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

Manual smoke minimum:
- draft -> publish -> archived -> restore;
- status chip/иконка в list и в editor совпадают после каждого action.

## 8. Stage DoD

- Критерии ТЗ §6 для B5.
- [`LOG.md`](LOG.md).
- В AUDIT явно отражено: была ли проблема в UX-ожидании или в реальном state-bug, и что именно исправлено.
