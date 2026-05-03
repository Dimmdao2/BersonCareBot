# STAGE B4 PLAN — Рекомендации: тип, регион тела, метрики текста

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Расширить каталог рекомендаций: UI «Тип» вместо «Область», `body_region`, поля `quantity` / `frequency` / `duration` как фристайл-текст; расширение enum домена (`domain` в коде может остаться — см. ТЗ).

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.6, §3 B4.

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

- [`apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx)
- [`apps/webapp/src/modules/recommendations/recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) (или последующий rename в отдельном задаче)
- `apps/webapp/db/schema/*recommendation*`

## 5. Execution checklist

1. [ ] Миграции + enum расширение без ломания существующих строк.
2. [ ] Форма + список/фильтры.
3. [ ] Тесты compose формы.
4. [ ] `eslint` / `vitest` / `tsc`.

## 6. Stage DoD

- Критерии ТЗ §6 для B4.
- [`LOG.md`](LOG.md).
