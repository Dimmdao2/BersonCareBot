# MASTER PLAN — ASSIGNMENT_CATALOGS_REWORK (B1–B7)

## 1. Цель

Привести каталоги «Назначений» врача к согласованной модели фильтров, типизации и UX; **визуально** выровнять конструктор шаблонов программ с фактическим состоянием кода после завершения фазы A, **без** новой доменной работы `PROGRAM_PATIENT_SHAPE` вне scope B.

Канонический продуктовый источник: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md).

> Post-B wave: закрытие product defer вынесено в отдельный контур [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md) с этапами D1–D6. **2026-05-04:** D5 (`domain`→`kind`) **на паузе**; `DROP clinical_tests.scoring_config` — **решено** (инженерный follow-up, см. продуктовое ТЗ §7); расширение обязательного E2E в CI — **не** планируется.

## 2. Границы scope

### In scope

- Этапы **B1–B7** из продуктового ТЗ.
- Doctor-facing UI и API в контурах: клинические тесты, наборы тестов, рекомендации, комплексы ЛФК, список/конструктор шаблонов программ, shared `doctorCatalog*` и новый `CreatableComboboxInput`.
- Drizzle-миграции и сервисы/порты по затронутым модулям (см. этапные планы).
- Для **B7** — см. [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md): обязательны doctor + copy + read API; пациентский UI — только в объёме, нужном для DoD этапа.

### Out of scope

- **Не** добавлять **новые** фичи домена `PROGRAM_PATIENT_SHAPE`, не входящие в B (прогресс, `program_action_log`, бейджи и т.д.) — это **A2–A5** в [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md).
- **Не** менять семантику `treatment_program` progress / `program_action_log` / бейджи в B-этапах.
- **Примечание (код 2026-05):** B6 выполняется после завершения параллельной фазы A; фактическое состояние конструктора проверяется **перед EXEC B6** и фиксируется в `LOG.md` этапа.
- Курсы — [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md).

## 3. Зависимости и порядок

Базовые зависимости из ТЗ:

1. **B1** — поперечный: нужен для фильтров в **B3 / B5 / B6**; включает миграцию `test_sets` на публикационный статус и UI с двумя селектами (`active/archived` + `all/draft/published`).
2. **B2** (включая **B2.5**) — может идти параллельно с B4 после B1 там, где нет конфликта файлов; на практике B2 крупный — часто отдельным батчем.
3. **B3**, **B4**, **B5** — параллелизуемы после **B1** (см. координацию по общим файлам и CI).
4. **B6** — визуальный pass конструктора после обязательного pre-check фактического code-state (post-A completion). B6 не откатывает A; делает layout/превью/CTA поверх актуального состояния.
5. **B7** — после **B3** и **B4**; учитывать **`instance_stage_item.local_comment`** из **A2** `PROGRAM_PATIENT_SHAPE` (уже в доменном ТЗ) — не дублировать и не расходиться с копированием template→instance.

```text
B1 ──► B3, B4, B5, B6 (параллель по ресурсам)
         │
         └──► B7 (после B3+B4; согласовать с A2 по stage items)
```

Статусы продуктовых вопросов **Q1–Q7** — в продуктовом ТЗ §5/§8.2. Инженерные default до кода — в [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).

## 4. Карта кодовой базы (ориентир)

Уточнять перед каждым этапом через `rg` / дерево файлов.

| Область | Типичные пути |
|---------|----------------|
| Фильтры каталогов | `apps/webapp/src/shared/lib/doctorCatalogListStatus.ts`, новый `shared/ui/doctor/CatalogStatusFilters.tsx` |
| Клинические тесты | `apps/webapp/src/app/app/doctor/clinical-tests/`, `apps/webapp/src/modules/tests/` |
| Наборы тестов | `apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx` |
| Рекомендации | `apps/webapp/src/app/app/doctor/recommendations/`, `apps/webapp/src/modules/recommendations/` |
| Комплексы ЛФК | `apps/webapp/src/app/app/doctor/lfk-templates/` |
| Шаблоны программ | `apps/webapp/src/app/app/doctor/treatment-program-templates/**` (в т.ч. `TreatmentProgramConstructorClient.tsx`) |
| Схема БД | `apps/webapp/db/schema/**`, миграции `drizzle-kit` |

## 5. Политика проверок

На каждом этапе:

- целевой `eslint` по затронутым файлам;
- при изменении типов/схемы — `tsc --noEmit` для `apps/webapp`;
- unit/integration тесты по изменённым модулям (см. этапный план);
- smoke списков/форм врача.

Полный `pnpm run ci` — в конце батча или перед пушем (см. `.cursor/rules/pre-push-ci.mdc`).

## 6. Архитектурные и UI правила

- `modules/*` не импортируют `@/infra/db/*` и `@/infra/repos/*` — только порты и DI (`buildAppDeps`).
- Route handlers: parse → validate → auth → service → response; без business logic в `route.ts`.
- Новые таблицы и запросы — через Drizzle.
- Интеграционные ключи — не в env (общие правила репозитория).
- Doctor UI: shadcn-примитивы из `@/components/ui/*`, `ReferenceSelect` для справочников; не плодить raw one-off контролы, если в ТЗ не оговорено исключение (`CreatableComboboxInput` — явный новый shared).

## 7. Definition of Done (инициатива)

Совпадает с продуктовым ТЗ §6:

- B1: две оси фильтра (`active/archived` + `all/draft/published`) работают для ЛФК, шаблонов программ и наборов тестов; legacy query совместим.
- B2: `assessmentKind`, `body_region`, структурированный `scoring`, `CreatableComboboxInput`, таблица `measure_kinds` + API.
- B3: редактор наборов как LFK-комплекс, комментарий на item, UUID-textarea удалён из сценариев.
- B4: «Тип» в UI, регион, quantity/frequency/duration тексты, фильтры.
- B5: фикс «глаза», читаемый список/карточка, фильтры B1.
- B6: превьюшки, двухколоночный layout, CTA черновик/опубликовать/архив; **без новых доменных полей и без смены assign/snapshot**; существующие блоки A в конструкторе **не удалять** (см. `PRE_IMPLEMENTATION_DECISIONS`).
- B7: template `comment` + instance `local_comment` на согласованном наборе контейнеров; copy и override по ТЗ.
- После каждого закрытого B-этапа — запись в [`LOG.md`](LOG.md).
- Финально: `pnpm install --frozen-lockfile && pnpm run ci` зелёный; итоговый execution audit: [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) (+ при необходимости [`AUDIT_PREPUSH_POSTFIX.md`](AUDIT_PREPUSH_POSTFIX.md)).

## 8. Документы после прохода

- Запись в [`LOG.md`](LOG.md) по [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md).
- Закрытие этапа — audit по [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) (`AUDIT_STAGE_Bn.md` или общий файл).
- Новые продуктовые решения — журнал §8 в [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md).

## 9. Git, коммиты, пуш и CI

Согласовано с репо-правилами: `.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc`.

### Коммиты

- После каждого завершённого **EXEC** или **FIX** по этапу (рабочее дерево + обновлённый `LOG.md`, при AUDIT — закрытые critical/major или зафиксированный defer) — **один коммит** в текущую ветку.
- Сообщение коммита: префикс области, например `feat(doctor-catalogs): B2 clinical tests scoring` / `fix(doctor-catalogs): B2 audit …`.

### Пуш (ритм)

- **Не** пушить после каждого одиночного этапа по умолчанию.
- Рекомендуемый ритм: **пуш после закрытия блоков B1–B3, B4–B6 и после B7** (не чаще одного пуша на три закрытых этапа в середине волны; B7 — отдельный финальный пуш ветки).
- Досрочный пуш — только по явной команде пользователя; перед любым пушем — полный барьер CI (ниже).

### CI между коммитами

- **Запрещено** гонять `pnpm run ci` / `pnpm check` после каждого маленького шага или «для коммита».
- **Разрешено (step-level):** `eslint` / `vitest run <файл|паттерн>` / `tsc --noEmit` по **затронутой** области `apps/webapp` (и других пакетов, если менялись).
- **Phase-level** (после крупного куска этапа): полный `pnpm test:webapp` / `pnpm --dir apps/webapp test` без аргументов, если менялся весь контур webapp этапа.
- При **падении полного** `pnpm run ci` (перед пушем): сначала упавший шаг или конкретный тест-файл, затем хвост `pnpm run ci:resume:after-*` из корневого `package.json` — без повторного полного `ci` на каждой итерации правки (см. `pre-push-ci.mdc`).
- **Повторный** полный `ci` без новых изменений кода не запускать (reuse — `test-execution-policy.md`).

### Перед пушем (обязательно)

```bash
pnpm install --frozen-lockfile
pnpm run ci
```
