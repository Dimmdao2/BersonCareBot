# STAGE B7 PLAN — Universal comment pattern (template + local override)

> **Дисциплина:** коммит после каждого закрытого **EXEC** или **FIX**; пуш пачками после **B3, B6, B7** или по явной команде пользователя — [`MASTER_PLAN.md`](MASTER_PLAN.md) §9. **CI между коммитами:** таргетные проверки; **не** `pnpm run ci` на каждый коммит; полный CI перед пушем; при падении полного CI — `ci:resume:*` (`.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`). **Канон:** [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 1. Цель этапа

Раскатить паттерн **template `comment` → копия в instance `local_comment` → override** на согласованный набор item-контейнеров; UI врача и отображение пациенту по правилам ТЗ.

Источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.9, §3 B7.

## 2. Hard gates before coding

- **B3** и **B4** закрыты (первичное появление комментария на test_set items и ясность по рекомендациям).
- Согласовать с **A2** [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A2_PLAN.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/STAGE_A2_PLAN.md): `instance_stage_item.local_comment` — канон из [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §1.9; не дублировать и не расходить семантику копирования.
- **Q7** закрыт инженерно: см. [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) §1 (каталоговая рекомендация без отдельного template comment).

## 3. In scope / out of scope

### In scope

- Аудит таблиц template/instance item и план колонок (зафиксировать результат в `LOG.md`).
- Drizzle: недостающие `comment` / `local_comment` по результатам аудита (**включая** `local_comment` на `lfk_complex_exercises` по `PRE_IMPLEMENTATION_DECISIONS.md`).
- Сервисы копирования template→instance обновить для переноса комментария.
- Doctor UI: поле комментария у item в шаблоне; в инстансе — override с placeholder «Из шаблона».
- Patient: по `PRE_IMPLEMENTATION_DECISIONS` — без отдельного большого редизайна Plan: обязательно корректный read API + точечный показ комментария там, где уже есть готовый экран/блок; новые крупные patient-компоненты только если это требуется для DoD.

### Out of scope

- Слияние `bodyMd` рекомендации с комментарием.
- Новые env для интеграций.

## 4. Матрица обязательного аудита сущностей (перед кодом)

До миграций собрать таблицу и приложить в `LOG.md`:

1. `entity` (template/instance pair)
2. `template comment column` (есть/нет)
3. `instance local_comment column` (есть/нет)
4. `copy path implemented` (да/нет, где)
5. `doctor UI edit path` (да/нет, где)
6. `patient read path` (да/нет, где)
7. `planned action in B7`

Минимальный стартовый набор для проверки:

- treatment program stage items;
- test_set_items / instance equivalent path;
- lfk_complex_template_exercises / lfk_complex_exercises;
- другие item-containers, попадающие под §2.9 продуктового ТЗ.

## 5. Декомпозиция реализации

1. **Audit-first**
   - заполнить матрицу сущностей;
   - зафиксировать границу B7 v1 по patient UI.
2. **Schema**
   - добавить недостающие `comment` / `local_comment` (включая `lfk_complex_exercises.local_comment`);
   - миграции nullable/additive.
3. **Copy logic**
   - template->instance копирование комментариев по каждому контейнеру;
   - fallback `local_comment ?? template_comment`.
4. **Doctor UI**
   - edit template comment;
   - edit/clear local_comment override в instance.
5. **Patient/read**
   - read API корректно возвращает fallback;
   - точечный UI показ там, где уже есть готовый блок.
6. **Verification**
   - unit tests copy/override/clear;
   - targeted integration/smoke.

## 6. Execution checklist

1. [ ] Таблица аудита: entity → template table → instance table → есть/нет колонок.
2. [ ] Миграции nullable.
3. [ ] Copy-путь в сервисах назначения / комплексов / наборов / программ.
4. [ ] UI врача + минимальные patient read-paths.
5. [ ] Unit: copy; override; очистка → fallback.
6. [ ] Negative tests: отсутствующий template comment, пустой local_comment, rollback на fallback.
7. [ ] `eslint` / `vitest` / `tsc`.
8. [ ] Smoke: одинаковый комментарий виден в doctor instance + patient read-path после copy.

## 7. Recommended checks (targeted)

```bash
rg "local_comment|comment|template.*comment|fallback" apps/webapp/db apps/webapp/src
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <treatment-program-and-test-set-comment-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

Audit artifact must include:
- матрица container coverage;
- список defer items с причинами;
- подтверждение, что `bodyMd` не смешан с comment.

## 8. Stage DoD

- Критерии ТЗ §6 для B7.
- [`LOG.md`](LOG.md).
- Остатки вынесены в backlog ТЗ §7 при необходимости (явным списком).
- В AUDIT есть матрица покрытых контейнеров и непокрытых хвостов (с reason/defer).
