# STAGE B4 PLAN — Рекомендации: тип, регион тела, метрики текста

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Расширить каталог рекомендаций: UI «Тип» вместо «Область», `body_region`, поля `quantity` / `frequency` / `duration` как фристайл-текст; расширение enum домена (`domain` в коде может остаться — см. ТЗ).

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.6, §3 B4.

## 2. Hard gates before coding

- **Q3, Q4** закрыты инженерно по [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) §1 (не сливать старые `domain` с новыми в одной миграции; колонка остаётся `domain`, в UI — «Тип»). Противоречие врача — зафиксировать в `LOG.md` + §8 ТЗ.

## 3. In scope / out of scope

### In scope

- Drizzle: `body_region_id`, `quantity_text`, `frequency_text`, `duration_text`; расширение enum kind/domain по ТЗ §2.6.
- `RecommendationForm.tsx`: лейблы, `ReferenceSelect`, три коротких поля.
- `RecommendationsPageClient`: фильтр по региону; фильтр по kind.
- Backfill: существующие строки с NULL регионом.

### Out of scope

- Переименование колонки `domain` → `kind` в БД — **вне B4** (отдельный хвост после Q4).
- Слияние `bodyMd` и комментария — запрещено; комментарий — B7 / контекст вставки.

## 4. Likely files

- [`apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx)
- [`apps/webapp/src/modules/recommendations/recommendationDomain.ts`](../../../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) (или последующий rename в отдельном задаче)
- `apps/webapp/db/schema/*recommendation*`

## 5. Контракты данных (обязательная фиксация)

1. `recommendations.domain`:
   - колонка/тип остается как есть в B4;
   - UI-подпись «Тип».
2. Новые nullable поля:
   - `body_region_id`;
   - `quantity_text`, `frequency_text`, `duration_text`.
3. Legacy compatibility:
   - старые записи валидны без backfill;
   - фильтры корректно работают с `NULL`.

## 6. Декомпозиция реализации

1. **Schema**
   - migration для 4 новых nullable полей;
   - при необходимости индекс/where-индекс под region filter.
2. **Domain & repo**
   - типы create/update/read;
   - list/filter mapping по region и domain.
3. **Doctor UI**
   - `RecommendationForm`: label rename + 4 новых поля;
   - page list filters и query preserve.
4. **Compatibility**
   - проверить формы/экшены архив/разархив не ломаются;
   - проверить integration с assignment flows (без изменения B7 логики).
5. **Verification**
   - compose tests + smoke.

## 7. Execution checklist

1. [x] Миграции + enum расширение без ломания существующих строк.
2. [x] Форма + список/фильтры.
3. [x] Тесты compose формы.
4. [x] Negative path: пустые/частично заполненные quantity/frequency/duration сохраняются корректно.
5. [x] `eslint` / `vitest` / `tsc`.
6. [x] Smoke: create/update/archive/unarchive с новыми полями.
7. [x] Smoke: region filter и type filter вместе (пересечение фильтров) корректны.

## 8. Recommended checks (targeted)

```bash
rg "body_region_id|quantity_text|frequency_text|duration_text|domain" apps/webapp/db apps/webapp/src
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <recommendations-related-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

Если перед пушем полный `ci` упал на шагах после lint/typecheck, использовать соответствующий `pnpm run ci:resume:after-*` вместо перезапуска полного `ci` на каждой итерации.

## 9. Stage DoD

- Критерии ТЗ §6 для B4.
- [`LOG.md`](LOG.md).
- В AUDIT отражено, что `domain` не переименовывался, а только UI-лейбл/расширение значений.
