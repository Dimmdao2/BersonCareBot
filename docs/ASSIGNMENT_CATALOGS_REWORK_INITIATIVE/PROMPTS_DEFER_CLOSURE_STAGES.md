# ASSIGNMENT_CATALOGS_REWORK — defer closure prompts (D1–D6)

Контекст перед любым запуском:

- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/DEFER_CLOSURE_MASTER_PLAN.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D1_PLAN.md` … `STAGE_D6_PLAN.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/PRE_IMPLEMENTATION_DECISIONS.md`
- `docs/APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md` §9
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`

Правила:
- Каждый этап запускать как отдельный цикл: `EXEC` -> `AUDIT` -> `FIX`.
- Не переходить к следующему этапу до закрытия critical/major текущего AUDIT.
- Для каждого этапа: целевые `eslint`/`vitest`/`tsc`; полный `pnpm run ci` только перед push.
- После EXEC и FIX: обновлять `LOG.md` и делать отдельный коммит.

---

## D1 — EXEC

```text
Выполни stage D1 (measure_kinds как управляемый системный справочник) по:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D1_PLAN.md
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/DEFER_CLOSURE_MASTER_PLAN.md

Сделай:
1) Добавь управление списком measure_kinds (API + service + port + pg/inMemory).
2) Добавь doctor/admin UI-доступ к справочнику (без merge/dedup).
3) Обнови api.md и тесты.
4) Прогони таргетные eslint/vitest/tsc.
5) Обнови LOG.md и сделай коммит.
```

## D1 — AUDIT

```text
Проведи аудит D1 по STAGE_D1_PLAN.md.

Проверь:
- паритет API/service/port/pg/inMemory;
- корректность управления списком из UI;
- негативные пути (конфликт, пустое значение, ошибка сохранения).

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D1.md
Добавь MANDATORY FIX INSTRUCTIONS (critical/major/minor).
```

## D1 — FIX

```text
Выполни FIX по docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D1.md:
1) закрыть critical/major;
2) minor — исправить или defer с обоснованием в аудите;
3) прогнать таргетные проверки;
4) обновить LOG.md и сделать коммит.
```

---

## D2 — EXEC

```text
Выполни stage D2 (assessmentKind как системный справочник БД) по STAGE_D2_PLAN.md.

Сделай:
1) миграцию/сид справочника assessment kind;
2) переключение валидации/формы/фильтров с TS enum на БД-справочник;
3) read tolerant + write strict для legacy;
4) обнови api.md и тесты;
5) таргетные eslint/vitest/tsc;
6) LOG.md + коммит.
```

## D2 — AUDIT

```text
Проведи аудит D2:
- проверка миграции и seed;
- отсутствие хардкода enum как единственного источника;
- стабильность list/read для legacy кодов;
- корректность write validation.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D2.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## D2 — FIX

```text
Выполни FIX по AUDIT_STAGE_D2.md:
- critical/major закрыть обязательно;
- minor исправить или defer с обоснованием;
- таргетные проверки;
- LOG.md + коммит.
```

---

## D3 — EXEC

```text
Выполни stage D3 (типы рекомендаций как системный справочник БД) по STAGE_D3_PLAN.md.

Сделай:
1) миграцию категории/seed recommendation type;
2) переключение формы/SSR/API фильтров на БД-справочник;
3) сохранить read-tolerant поведение для legacy;
4) обновить api.md и тесты;
5) таргетные eslint/vitest/tsc;
6) LOG.md + коммит.
```

## D3 — AUDIT

```text
Проведи аудит D3:
- источник правды типа рекомендации = БД-справочник;
- паритет SSR и REST фильтров;
- legacy коды не приводят к падению чтения;
- регрессия B4 отсутствует.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D3.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## D3 — FIX

```text
Выполни FIX по AUDIT_STAGE_D3.md:
- закрыть critical/major;
- minor исправить или defer;
- таргетные проверки;
- LOG.md + коммит.
```

---

## D4 — EXEC

```text
Выполни stage D4 (Q2 qualitative в инстансе) по STAGE_D4_PLAN.md.

Сделай:
1) подтвердить и при необходимости выровнять pipeline прохождения test_set для qualitative;
2) обеспечить общий путь прогресса этапа без отдельной special-ветки;
3) тесты на qualitative -> result -> stage progress;
4) обновить api.md;
5) таргетные проверки;
6) LOG.md + коммит.
```

## D4 — AUDIT

```text
Проведи аудит D4:
- qualitative использует общий pipeline;
- decision и completion корректно отражаются в прогрессе этапа;
- docs и тесты подтверждают поведение.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D4.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## D4 — FIX

```text
Выполни FIX по AUDIT_STAGE_D4.md:
- закрыть critical/major;
- minor исправить или defer;
- таргетные проверки;
- LOG.md + коммит.
```

---

## D5 — пауза (2026-05-04)

Этап **`recommendations.domain` → `kind` отложен** владельцем. Блоки **D5 — EXEC / AUDIT / FIX ниже не запускать**, пока в [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) или [`LOG.md`](LOG.md) не снята пауза.

---

## D5 — EXEC

```text
Выполни stage D5 (domain -> kind) по STAGE_D5_PLAN.md.

ВАЖНО:
1) сначала spike и gate decision (Go/No-go), зафиксировать в LOG;
2) если Go — выполнить миграцию/рефактор/API/UI/tests/docs;
3) если No-go — не кодить частично, оформить defer с evidence.

После этапа: таргетные проверки, LOG.md, коммит.
```

## D5 — AUDIT

```text
Проведи аудит D5:
- проверь корректность gate decision;
- при Go: полнота rename и совместимость API;
- при No-go: достаточность spike-доказательств и defer-обоснования.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D5.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## D5 — FIX

```text
Выполни FIX по AUDIT_STAGE_D5.md:
- закрыть critical/major;
- minor исправить или defer;
- таргетные проверки;
- LOG.md + коммит.
```

---

## D6 — EXEC

```text
Выполни stage D6 (global defer closure audit) по STAGE_D6_PLAN.md.

Сделай:
1) собрать результаты D1–D4 и зафиксированный статус D5 (включая deferred без AUDIT_STAGE_D5);
2) проверить соответствие product plan §5/§7/§8 факту кода;
3) проверить что решения "не делаем" (publication_status extra, bulk API) не протекли в реализацию;
4) отметить отдельно решение по DROP `tests.scoring_config` (`0040`) vs состояние миграций (dev/prod);
5) подготовить глобальный аудит.
```

## D6 — AUDIT

```text
Проведи финальный аудит defer-wave:
- источники: AUDIT_STAGE_D1..D4, LOG, product plan; D5 — только если был audit-файл;
- проверь закрытие всех critical/major;
- зафиксируй residual risks;
- зафиксируй статус D5 (в т.ч. owner pause) и факт по DROP `tests.scoring_config` / миграция `0040` (repo, dev, prod);

Сохрани полный аудит: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md

Именованный вход «этап 6» (короткий указатель + ссылка на файл выше): docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D6.md
```

## D6 — FIX

```text
Выполни FIX по AUDIT_DEFER_CLOSURE_GLOBAL.md:
- устранить выявленные critical/major;
- minor закрыть или отложить с обоснованием;
- обновить LOG.md;
- перед push выполнить полный барьер:
  pnpm install --frozen-lockfile
  pnpm run ci
```
