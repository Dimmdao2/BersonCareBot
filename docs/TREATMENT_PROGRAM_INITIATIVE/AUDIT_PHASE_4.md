# AUDIT — Фаза 4 (экземпляр программы: назначение, deep copy, snapshot, override)

**Дата аудита:** 2026-04-18.  
**Вход:** `SYSTEM_LOGIC_SCHEMA.md` § 3 (статусы этапа экземпляра), § 5 (копирование шаблон → экземпляр), § 6 (override комментариев), § 11 (LFK/CMS без ломки существующих таблиц).  
**Scope:** `apps/webapp/db/schema/treatmentProgramInstances.ts`, миграция `db/drizzle-migrations/0003_treatment_program_instances.sql`; `apps/webapp/src/modules/treatment-program/` (`instance-service.ts`, `types.ts`, `ports.ts`, `instance-service.test.ts`); `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`, `pgTreatmentProgramItemSnapshot.ts`, in-memory реализации; `apps/webapp/src/app/api/doctor/**/treatment-program-instances/**`, `.../clients/[userId]/treatment-program-instances/**`; UI карточки экземпляра врача.

**Метод:** статический обзор кода и тестов модуля; полный прогон тестов репозитория в этом аудите **не** выполнялся.

---

## Краткий вердикт

| # | Проверка | Статус |
|---|-----------|--------|
| 1 | Deep copy: `snapshot`, `comment`, `local_comment`, `settings` (§ 5) | **PASS** |
| 2 | Независимость экземпляра от шаблона после копирования (§ 5) | **PASS** |
| 3 | Override: приоритет `local_comment` над `comment` (§ 6) | **PASS** (отображение + API + форма врача после FIX) |
| 4 | Начальные статусы этапов: первый `available`, остальные `locked` (§ 5 + § 3) | **PASS** |
| 5 | Изоляция `modules/treatment-program/` (§ 12) | **PASS** |

---

## 1) Deep copy: snapshot, comment, local_comment, settings — § 5

### Verdict: **PASS**

Эталон § 5: при назначении — `comment` и `settings` копируются, `local_comment` изначально пуст (NULL), `snapshot` — JSON снимка блока.

| Поле § 5 | Реализация |
|----------|------------|
| `comment` | `instance-service.ts` → `assignTemplateToPatient`: в `itemInputs` передаётся `comment: it.comment` из элемента шаблона. |
| `local_comment` | `pgTreatmentProgramInstance.createInstanceTree`: для строк элемента `localComment: null`; для этапа экземпляра `localComment: null`. |
| `settings` | В дерево передаётся `settings: it.settings` из шаблона; insert `settings: it.settings ?? undefined`. |
| `snapshot` | Для каждого элемента вызывается `snapshots.buildSnapshot(it.itemType, it.itemRefId)` до вставки; в БД пишется в колонку `snapshot`. |

**Тесты (модуль):** `instance-service.test.ts` — кейс «deep copy: stages order, first available rest locked, comment and snapshot, local_comment null»; «deep copy preserves settings from template stage item (§5)».

---

## 2) Независимость экземпляра от шаблона — § 5

### Verdict: **PASS**

Эталон: после копирования экземпляр **независим**; изменения шаблона не влияют на существующие экземпляры.

| Механизм | Оценка |
|----------|--------|
| Хранение | Этапы и элементы экземпляра — отдельные таблицы с собственными копиями полей; `getInstanceForPatient` / `getInstanceById` читают только таблицы экземпляра. |
| Связь с шаблоном | `template_id` на экземпляре — справочная; при удалении шаблона поведение по FK не ломает уже скопированное дерево (в схеме — `ON DELETE SET NULL` для шаблона). |
| Нет обратной синхронизации | Обновление строк шаблона не обновляет строки экземпляра (нет триггеров/общих представлений в scope фазы 4). |

**Тест (модуль):** `instance-service.test.ts` — «instance item comment and snapshot are independent of template edits after assign (§5)»: после `updateStageItem` у элемента **шаблона** у экземпляра неизменны `comment` и `snapshot`.

---

## 3) Override комментариев — § 6

### Verdict: **PASS**

**Отображение (§ 6, IF local_comment NOT NULL → иначе comment):**

- `effectiveInstanceStageItemComment` в `types.ts`: непустой `localComment` после `trim` имеет приоритет; иначе используется `comment` (с `trim`). Согласовано с маппингом `effectiveComment` в PG-порте при чтении детали.
- Сервис: `updateStageItemLocalComment`; PATCH API `.../stage-items/[itemId]` — тонкий слой, валидация тела, вызов сервиса.
- Пустой / пробельный override: нормализация в `NULL` в репозитории; JSDoc у `effectiveInstanceStageItemComment` фиксирует контракт.

**Тесты (модуль):** «§6 effectiveComment: local overrides template copy»; «§6 reset localComment shows template comment again».

**Редактирование (§ 6, шаги 1–2):**

- Шаг 1 § 6 (предзаполнение при пустом `local_comment`): в **`TreatmentProgramInstanceDetailClient`** черновик формы override задаётся как **`initialDraft={item.effectiveComment ?? ""}`** — при отсутствии override в поле попадает тот же текст, что видит пациент (`comment` из копии шаблона), без лишнего набора. Сохранение по-прежнему через PATCH в `localComment` (бэкенд не дублирует шаг 1 автоматически — достаточно контракта API + UI).

**Шаг 3 § 6 — `comment_changed`:** таблица событий — **фаза 7** (`SYSTEM_LOGIC_SCHEMA.md` § 8). Не блокер корректности § 6 для отображения и PATCH; открыто до реализации событий.

---

## 4) Статусы этапов: первый `available`, остальные `locked` — § 3 / § 5

### Verdict: **PASS**

- § 5 задаёт **начальное** состояние: первый этап `available`, остальные `locked`.
- `instance-service.ts`, цикл по `stagesSorted`: `const status = i === 0 ? "available" : "locked"`.
- CHECK в БД для `treatment_program_instance_stages.status` включает полный набор § 3 (`locked`, `available`, `in_progress`, `completed`, `skipped`) — готовность к переходам фазы 6.
- Автоматические и ручные переходы по диаграмме § 3 (кроме начального назначения) — **вне scope** данного аудита фазы 4.

**Тест (модуль):** «deep copy: ... first available rest locked ...».

---

## 5) Изоляция модуля — § 12

### Verdict: **PASS**

| Проверка | Результат |
|----------|-----------|
| `rg '@/infra' apps/webapp/src/modules/treatment-program` | **Нет совпадений** (на дату аудита). |
| Тесты экземпляра | `instance-service.test.ts` использует `@/app-layer/testing/treatmentProgramInMemory`, `treatmentProgramInstanceInMemory`. |
| HTTP | `route.ts` для экземпляра — парсинг, роль, вызов `buildAppDeps().treatmentProgramInstance`; без бизнес-логики копирования в route. |

---

## 6) Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 11

### Verdict: **PASS**

- Новые таблицы экземпляра не изменяют DDL существующих `lfk_exercises`, `lfk_complex_templates`, `content_pages` и т.д.
- Снимок (`buildSnapshot`) **читает** библиотечные сущности на момент назначения; на строке элемента экземпляра полиморфная `item_ref_id` без FK на библиотеку — согласовано с § 4.
- Legacy-таблицы из § 11 (`patient_lfk_assignments`, …) в коде фазы 4 не модифицируются.

---

## Gate (фаза 4)

| Критерий | Статус |
|----------|--------|
| Таблицы экземпляра + миграция Drizzle `0003_*` | **OK** (в репозитории) |
| Deep copy § 5 | **OK** |
| § 6 отображение и override через API | **OK** |
| Начальные статусы этапов § 5 | **OK** |
| Изоляция `modules/treatment-program` | **OK** |
| Событие `comment_changed` | **Открыто до фазы 7** |
| Предзаполнение формы override (§ 6 шаг 1) | **OK** — после FIX (`effectiveComment` → `initialDraft`) |

---

## MANDATORY FIX INSTRUCTIONS

**Critical / major:** **нет** — блокирующих расхождений с § 3 (начальные статусы), § 5 (deep copy и независимость), § 6 (приоритет комментария для отображения и сброс override), § 11 (без ломки LFK/CMS) по результатам этого аудита не выявлено.

| # | Severity | Инструкция | Статус |
|---|----------|------------|--------|
| 1 | optional / minor | **§ 6 UX:** предзаполнение черновика формы override из отображаемого комментария (`effectiveComment`). | **Закрыто FIX** — `TreatmentProgramInstanceDetailClient.tsx`: `initialDraft={item.effectiveComment ?? ""}`. |
| 2 | informational | **`comment_changed`** (§ 6 шаг 3, § 8): реализовать запись события при изменении `local_comment` — **фаза 7** (`treatment_program_events`). | **Defer фаза 7** |
| 3 | informational | Миграция **`0003_treatment_program_instances.sql`** на окружениях: `pnpm --dir apps/webapp run db:migrate:drizzle` (или процесс DevOps). | **Defer (операционно)** — см. `EXECUTION_RULES.md`, `LOG.md`. |

**Уже закрытые ранее пункты (не требуют повторного FIX):** тесты на `settings` при deep copy; тест на независимость `comment`/`snapshot` от правок шаблона; JSDoc у `effectiveInstanceStageItemComment` для пустого override.

---

## Команды для повторной проверки (точечно, без полного `pnpm test`)

```bash
rg '@/infra' apps/webapp/src/modules/treatment-program
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts
```

---

## AUDIT_PHASE_4 FIX — верификация (2026-04-18)

| Пункт MANDATORY | Результат |
|-----------------|-----------|
| Critical / major | **N/A** — в аудите не заводились. |
| #1 optional §6 UX | **Закрыто** — предзаполнение `initialDraft` через `item.effectiveComment`. |
| #2 `comment_changed` | **Defer фазы 7** — без изменения кода. |
| #3 миграция `0003_*` на окружениях | **Defer (операционно)**. |

**Повторная сверка с эталоном (код + точечные тесты модуля):**

- **§ 5 Deep copy:** `assignTemplateToPatient` + `createInstanceTree` — `comment`, `settings`, `snapshot`, `localComment: null`; тесты `instance-service.test.ts` (в т.ч. settings, first stage / local_comment).
- **§ 5 Независимость:** тест «instance item comment and snapshot are independent of template edits after assign».
- **§ 6 Приоритет `local_comment`:** `effectiveInstanceStageItemComment` / `effectiveComment`; тесты override и сброса.
- **§ 3 / § 5 Статусы при назначении:** `i === 0 ? "available" : "locked"`; тест «first available rest locked».
- **§ 12 Изоляция:** `rg '@/infra' apps/webapp/src/modules/treatment-program` — пусто.

**Проверки в цикле FIX (без полного `pnpm test:webapp` / `pnpm run ci`):** см. `LOG.md` — lint webapp, typecheck webapp, `vitest run instance-service.test.ts`, при необходимости `pnpm run build:webapp` и `pnpm run audit` (известные advisories lockfile).

---

## Заключение

Фаза 4 **соответствует** эталону **`SYSTEM_LOGIC_SCHEMA.md`** по **§ 5** (deep copy и независимость), **§ 6** (приоритет `local_comment`, форма врача с предзаполнением по шагу 1), **§ 3** (начальная разметка `available` / `locked`), **§ 11** (только чтение LFK/CMS для snapshot). Изоляция модуля от `@/infra` соблюдена. В **MANDATORY** остаются только **informational defer**: события (фаза 7), миграция на стендах.
