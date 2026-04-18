# AUDIT — Фаза 7 (история изменений, `treatment_program_events`)

**Дата аудита:** 2026-04-18.  
**Эталон:** `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md` **§ 8** (таблица событий, перечень `event_type`, обязательность `reason` для `stage_skipped` и `item_removed`, запись только через сервисный слой).  
**Scope (файлы фазы):**  
`apps/webapp/db/schema/treatmentProgramEvents.ts`, миграция `db/drizzle-migrations/0006_treatment_program_events.sql`;  
`src/modules/treatment-program/instance-service.ts`, `progress-service.ts`, `event-recording.ts`, `ports.ts`, `types.ts` (`TREATMENT_PROGRAM_EVENT_TYPES`);  
`infra/repos/pgTreatmentProgramEvents.ts`, `inMemoryTreatmentProgramInstance.ts` (порт событий);  
`buildAppDeps` (подключение events);  
API `app/api/doctor/treatment-program-instances/[instanceId]/events/route.ts`, структурные маршруты (`stage-items`, `stages`, …);  
UI `TreatmentProgramInstanceDetailClient.tsx` (таймлайн);  
тесты `treatment-program-events.test.ts`, `progress-service.test.ts` (события §8).  

**Вне scope:** полный прогон CI монорепозитория; изменения фаз 6/9, не относящиеся к событиям.

---

## 1) Таблица `treatment_program_events` через Drizzle и поля § 8

### Verdict: **PASS**

| Поле § 8 | Реализация |
|----------|------------|
| `instance_id` → экземпляр программы | `instanceId` NOT NULL, FK → `treatment_program_instances` `ON DELETE CASCADE` |
| `actor_id` → `platform_users` | `actorId` nullable, FK `ON DELETE SET NULL` — для автоматических переходов (`actorId: null`, подпись в UI «система») |
| `event_type` | `text` NOT NULL + CHECK на множество из § 8: `item_added`, `item_removed`, `item_replaced`, `comment_changed`, `stage_added`, `stage_removed`, `stage_skipped`, `stage_completed`, `status_changed`, `test_completed` |
| `target_type` | CHECK: `stage` \| `stage_item` \| `program` |
| `target_id` | UUID NOT NULL |
| `payload` | JSONB NOT NULL, default `'{}'::jsonb` |
| `reason` | `text` nullable в БД; для `stage_skipped` / `item_removed` обязательность обеспечивается **сервисом** (`event-recording.ts`) и API (см. § 3) |
| `created_at` | `timestamptz`, `defaultNow()` |
| Первичный ключ | `id` uuid (не перечислен в § 8 явно — стандартная суррогатная строка) |

**Индекс:** `idx_treatment_program_events_instance_created` на `(instance_id, created_at DESC)` — эффективная выборка последних событий по экземпляру.

**Запись только через приложение:** вставки через `TreatmentProgramEventsPort.appendEvent`; в миграции **нет** триггеров на вставку событий.

**Источники:** `treatmentProgramEvents.ts`, `0006_treatment_program_events.sql`.

---

## 2) Событие при мутациях программы (add / remove / replace / skip / complete / comment_changed)

### Verdict: **PASS** по перечисленным в § 8 и расширенной семантике `status_changed` (см. § 8 в эталоне — фаза 7 / 9)

| Ожидание аудита | Где пишется | `event_type` / заметка |
|-----------------|-------------|-------------------------|
| Добавить этап | `doctorAddStage` | `stage_added` |
| Удалить этап | `doctorRemoveStage` | `stage_removed` |
| Добавить элемент | `doctorAddStageItem` | `item_added` |
| Удалить элемент | `doctorRemoveStageItem` | `item_removed` + `reason` |
| Заменить элемент | `doctorReplaceStageItem` | `item_replaced` |
| Пропустить этап | `doctorSetStageStatus` → `recordStageStatusChange` | `stage_skipped` + `reason` |
| Завершить этап (врач или авто по элементам) | `recordStageStatusChange` / `maybeCompleteStageFromItems` | `stage_completed` |
| Изменить комментарий элемента (effective) | `updateStageItemLocalComment` | `comment_changed` (только если effective до/после различается) |
| Завершить программу (`active` → `completed`) | `updateInstance` | `status_changed`, `target_type: program` |
| Иные переходы этапа (`locked`/`available`/`in_progress`/…) | `recordStageStatusChange` | `status_changed`, `target_type: stage`, `payload` с `from`/`to` или `stage_skipped` / `stage_completed` |
| Отметить простой элемент выполненным | `patientCompleteSimpleItem` | `status_changed`, `target_type: stage_item`, `payload.scope: stage_item`, поле `completedAt` |
| Завершить тест в наборе | `patientSubmitTestResult` | `test_completed`; при закрытии всего набора — ещё `status_changed` по элементу с контекстом `test_set_all_tests_done` |
| Переупорядочить этапы / элементы (фаза 9) | `doctorReorderStages` / `doctorReorderStageItems` | `status_changed`, `payload.scope`: `stages_reordered` / `stage_items_reordered` |

**Вне § 8 как тип события:** первичное назначение программы (`createInstanceTree` / `assignTemplateToPatient`) — отдельного `event_type` в § 8 нет; события не пишутся (ожидаемо).

**Informational:** смена **только** `title` программы через `updateInstance` **без** смены `status` — событие **не** создаётся (в § 8 нет типа «переименование»).  
**Informational:** **override** итога теста врачом (`doctorOverrideTestResult`) — отдельного события в § 8 нет.

---

## 3) `stage_skipped` и `item_removed`: обязательный `reason` и валидация

### Verdict: **PASS**

| Правило | Реализация |
|---------|------------|
| `stage_skipped` | (1) `doctorSetStageStatus`: при `status === "skipped"` пустой `reason` после trim → ошибка до записи этапа. (2) `recordStageStatusChange`: для `stage_skipped` вызывается `normalizeEventReason("stage_skipped", doctorReason ?? afterRow.skipReason)` в цепочке `buildAppendEventInput`. |
| `item_removed` | (1) `doctorRemoveStageItem`: `normalizeEventReason("item_removed", input.reason)` **до** удаления строки. (2) API `DELETE .../stage-items/[itemId]`: Zod `reason: z.string().min(1).max(20000)`. |
| Персистенция | Колонка `reason` в `treatment_program_events`; для пропуска этапа смысл дублирует поле `skip_reason` на этапе (связь с фазой 6). |

**Уровень БД:** CHECK «`reason` NOT NULL при определённых `event_type`» **не** задан — истина в сервисе и контракте API (**informational**: усиление целостности — отдельная миграция с учётом исторических строк).

---

## 4) Таймлайн врача: хронологический порядок

### Verdict: **PASS**

| Аспект | Реализация |
|--------|------------|
| Выборка PG | Последние **N** записей (по умолчанию 200, max 500): `WHERE instance_id = ? ORDER BY created_at DESC LIMIT N`. |
| Порядок для UI | После выборки массив **разворачивается** (`reverse()`), итог: **от старых к новым** внутри окна из N событий (`pgTreatmentProgramEvents.ts`, комментарий в коде). |
| In-memory | Тот же контракт: новые сверху при сортировке, затем `reverse` для выдачи «старые → новые». |
| UI | `TreatmentProgramInstanceDetailClient`: текст «Порядок: **от старых к новым**»; список `<ul>` без нумерации; отображение `createdAt` через `toLocaleString("ru-RU")`. |

---

## 5) Тесты: запись событий и правила `reason`

### Verdict: **PASS**

| Сценарий | Файл | Покрыто |
|----------|------|---------|
| `item_removed` без причины / пробелы → ошибка | `treatment-program-events.test.ts` | Да |
| `item_removed` + `item_added` + `reason` | там же | Да |
| `comment_changed` | там же | Да |
| `stage_added`, `stage_removed` | там же | Да |
| `item_replaced` + `payload` before/after | там же | Да |
| `status_changed` программы (`active` → `completed`) | там же | Да |
| Монотонность `created_at` в `listEventsForInstance` (старые раньше новых) | там же | Да |
| Reorder этапов/элементов (фаза 9) | там же | Да |
| `stage_skipped` + событие §8 | `progress-service.test.ts` | Да |
| `test_completed`, `stage_completed` при прохождении набора | `progress-service.test.ts` | Да |

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 8 (итог)

| Пункт § 8 | Статус |
|-----------|--------|
| Структура таблицы и роли полей | OK |
| Перечень `event_type` | OK (совпадает с CHECK и с перечнем § 8, включая `test_completed`) |
| `reason` для `stage_skipped`, `item_removed` | OK (сервис + API DELETE элемента) |
| Запись без триггеров | OK |
| Уточнение § 8 про `status_changed` (программа / этап / элемент, `payload.scope`) | Согласовано с реализацией и текстом эталона |

---

## Gate (фаза 7, аудит 2026-04-18)

| Критерий | Статус |
|----------|--------|
| Drizzle + миграция `0006_*` | OK |
| События на ключевых мутациях (включая add/remove/replace/skip/complete/comment) | OK |
| Reason-правила для skip/remove | OK |
| Таймлайн врача (хронология в рамках окна N) | OK |
| Тесты событий и reason | OK |
| Миграции на стендах | Операционно (вне аудита кода) |

**Gate verdict:** **PASS**

---

## MANDATORY FIX INSTRUCTIONS

### Critical / Major

| Статус FIX (2026-04-18) | Деталь |
|-------------------------|--------|
| **Закрыто (N/A)** | В аудите **не выявлено** блокирующих отклонений от § 8; дополнительный код-фикс не требовался. Процедура регрессии при правках — см. «AUDIT_PHASE_7 FIX — верификация» ниже. |

### Minor

| Тема | Статус FIX (2026-04-18) |
|------|-------------------------|
| Таймлайн (старые → новые в окне N) | **Уже закрыто** в коде до FIX-прохода; переподтверждено при ревью. |
| Интеграционные тесты мутаций / хронологии | **Уже закрыто** (`treatment-program-events.test.ts`, `progress-service.test.ts`); переподтверждено. |
| Unit-тесты правил `reason` в `normalizeEventReason` / `buildAppendEventInput` | **Закрыто в FIX:** `event-recording.test.ts` (§8). |

### Informational (defer — без изменения кода)

| Тема | Комментарий |
|------|-------------|
| CHECK в БД на непустой `reason` для части `event_type` | **Defer** — риск для исторических строк; истина в сервисе + API. |
| Событие при override результата теста врачом | **Defer** — в § 8 отдельного типа нет. |
| Событие при смене только `title` программы | **Defer** — в § 8 не требуется; при необходимости — отдельный `event_type` или расширение `payload`. |

---

## AUDIT_PHASE_7 FIX — перепроверка мутаций → `treatment_program_events`

Повторная сверка сервисного слоя (без изменения логики в FIX):

| Мутация | Сервис / метод | Событие §8 | Примечание |
|---------|----------------|------------|------------|
| Добавить этап | `doctorAddStage` | `stage_added` | OK |
| Удалить этап | `doctorRemoveStage` | `stage_removed` | OK |
| Добавить элемент | `doctorAddStageItem` | `item_added` | OK |
| Удалить элемент | `doctorRemoveStageItem` | `item_removed` + **reason** | `normalizeEventReason` до удаления |
| Заменить элемент | `doctorReplaceStageItem` | `item_replaced` | OK |
| Комментарий элемента | `updateStageItemLocalComment` | `comment_changed` | Только если изменился effective |
| Статус программы | `updateInstance` | `status_changed` / `program` | При смене `status` |
| Смена только `title` | `updateInstance` | *нет события* | **Defer** §8 — не требуется эталоном |
| Переупорядочивание | `doctorReorderStages` / `doctorReorderStageItems` | `status_changed` + `payload.scope` | OK |
| Пропуск этапа | `doctorSetStageStatus` → `recordStageStatusChange` | `stage_skipped` + **reason** | Двойная валидация: сервис skip + `normalizeEventReason` |
| Завершение этапа | `recordStageStatusChange` / авто | `stage_completed` / `status_changed` | OK |
| Прогресс пациента | `patientCompleteSimpleItem`, `patientSubmitTestResult` | `status_changed`, `test_completed` | OK |
| Назначение программы | `assignTemplateToPatient` | *нет* | В §8 нет типа «создан экземпляр» — ожидаемо |

---

## AUDIT_PHASE_7 FIX — обязательность `reason` (подтверждение)

| Правило §8 | Где валидируется |
|------------|------------------|
| `stage_skipped` | `doctorSetStageStatus` (пустой `reason` → ошибка до БД); `normalizeEventReason` / `buildAppendEventInput`; интеграция: `progress-service.test.ts`; **unit:** `event-recording.test.ts`. |
| `item_removed` | `doctorRemoveStageItem` + `normalizeEventReason`; API **DELETE** `stage-items/[itemId]` — `reason: z.string().min(1)`; интеграция: `treatment-program-events.test.ts`; **unit:** `event-recording.test.ts`. |

---

## AUDIT_PHASE_7 FIX — верификация (команды)

**Вход:** `AUDIT_PHASE_7.md`, `SYSTEM_LOGIC_SCHEMA.md` § 8, `EXECUTION_RULES.md`.

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/event-recording.test.ts src/modules/treatment-program/treatment-program-events.test.ts src/modules/treatment-program/progress-service.test.ts` — **PASS** (3 files, **31** tests).
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**

Полный `pnpm run ci` по монорепозиторию **не** выполнялся (ограничение scope фазы).

**Gate verdict (AUDIT_PHASE_7 FIX):** **PASS**

---

## История документа

- Аудит 2026-04-18 — таблицы § 1–5 и MANDATORY.
- **FIX 2026-04-18** — формальное закрытие critical/major (N/A), подтверждение minor, матрица мутаций, unit-тесты `event-recording.test.ts`, блок верификации и gate.
