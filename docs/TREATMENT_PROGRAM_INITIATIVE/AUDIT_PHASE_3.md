# AUDIT — Фаза 3 (шаблон программы / конструктор)

**Дата аудита:** 2026-04-18.  
**Вход:** `MASTER_PLAN.md` (фаза 3), `SYSTEM_LOGIC_SCHEMA.md` § 1–4.  
**Scope:** `db/schema/treatmentProgramTemplates.ts`, миграция `0002_sweet_ikaris.sql`, `modules/treatment-program/`, `app/api/doctor/treatment-program-templates/**`, `app/app/doctor/treatment-program-templates/**`, валидация ссылок `pgTreatmentProgramItemRefValidation*`.

---

## Краткий вердикт

| # | Проверка | Статус |
|---|-----------|--------|
| 1 | Таблицы шаблона по § 1 | **PASS** |
| 2 | `item_type` ⊆ § 4 | **PASS** |
| 3 | Повтор `item_ref_id` между этапами | **PASS** (тест + отсутствие UNIQUE в DDL) |
| 4 | Изоляция `modules/treatment-program/` | **PASS** |
| 5 | Конструктор: этап / элемент / порядок / удаление | **PASS** |

---

## 1) Таблицы шаблона и § 1 «Общий поток данных»

### Verdict: **PASS**

В § 1 на диаграмме используются короткие имена; в PostgreSQL — согласованные с `MASTER_PLAN` фаза 3:

| § 1 (концепт) | Таблица | Ключевые поля |
|---------------|---------|----------------|
| Шаблон программы | `treatment_program_templates` | `title`, `description`, `status` (`draft` / `published` / `archived`), `created_by`, timestamps |
| Этап шаблона | `treatment_program_template_stages` | `template_id` FK **CASCADE**, `title`, `description`, `sort_order` |
| Элемент этапа | `treatment_program_template_stage_items` | `stage_id` FK **CASCADE**, `item_type`, `item_ref_id` **UUID без FK** на библиотеку, `sort_order`, `comment`, `settings` JSONB |

Источник правды в коде: `apps/webapp/db/schema/treatmentProgramTemplates.ts`; миграция: `db/drizzle-migrations/0002_sweet_ikaris.sql`.

**Замечание:** расхождение только в **именовании** диаграммы (`treatment_program_template` ед.ч.) vs таблицы (`…_templates` мн.ч.) — ожидаемый стиль БД.

---

## 2) `item_type` и `SYSTEM_LOGIC_SCHEMA.md` § 4

### Verdict: **PASS**

Перечень § 4 (строки таблицы типов элементов):

| § 4 `item_type` | В `TREATMENT_PROGRAM_ITEM_TYPES` / Drizzle CHECK |
|-----------------|---------------------------------------------------|
| `exercise` | да |
| `lfk_complex` | да |
| `test_set` | да |
| `recommendation` | да |
| `lesson` | да |

CHECK в `treatment_program_template_stage_items`:  
`item_type = ANY (ARRAY['exercise','lfk_complex','recommendation','lesson','test_set'])` — **тот же набор**, что § 4 и `MASTER_PLAN` фаза 3.

**Урок (`lesson`):** эталон § 4 / § 10 — секция контента **`lessons`** и совместимость с **`course_lessons`**; валидация ссылок в PG принимает обе секции; конструктор подгружает уроки с учётом этого (см. страницу `[id]/page.tsx`).

---

## 3) Повторение элементов между этапами

### Verdict: **PASS**

- § 4: один и тот же `item_ref_id` может быть **на разных этапах**; внутри этапа — допускается с разными `sort_order`.
- В миграции **нет** UNIQUE на `(stage_id, item_type, item_ref_id)`.
- Регрессия: `modules/treatment-program/service.test.ts` — **`allows the same library ref on multiple stages (no unique constraint)`**.

---

## 4) Изоляция `modules/treatment-program/`

### Verdict: **PASS**

- В `service.ts`, `ports.ts`, `types.ts` **нет** `@/infra/db/*` и `@/infra/repos/*`.
- `service.test.ts` использует **`@/app-layer/testing/treatmentProgramInMemory`**.
- Проверка: `rg '@/infra' apps/webapp/src/modules/treatment-program` → **пусто** (кроме возможных игнорируемых путей — в дереве модуля импортов `@/infra` нет).

Маршруты `api/doctor/treatment-program-templates/**` используют `buildAppDeps().treatmentProgram` — без прямого infra в `route.ts`.

---

## 5) Конструктор (doctor UI)

### Verdict: **PASS**

Клиент: `app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`.

| Требование аудита | Реализация |
|-------------------|------------|
| Добавить этап | Диалог «+ Этап» → `POST /api/doctor/treatment-program-templates/[id]/stages` |
| Добавить элемент | «Добавить из библиотеки» → `POST .../stages/[stageId]/items` с `itemType` + `itemRefId` |
| Переупорядочить этапы | Два `PATCH .../stages/[stageId]` — обмен `sortOrder` (↑/↓) |
| Переупорядочить элементы | Два `PATCH .../stage-items/[itemId]` — обмен `sortOrder` (↑/↓) |
| Удалить этап | `DELETE .../stages/[stageId]` + `confirm` |
| Удалить элемент | `DELETE .../stage-items/[itemId]` + `confirm` |

---

## Gate (`MASTER_PLAN.md`, фаза 3)

| Критерий | Статус |
|----------|--------|
| Конструктор этапов в doctor UI | **OK** |
| Тесты на создание/редактирование шаблона | **OK** (`service.test.ts`, 6 тестов) |

---

## MANDATORY FIX INSTRUCTIONS

**Critical / major:** **нет** — по текущему состоянию репозитория блокирующих расхождений с § 1–4 и фазой 3 не выявлено.

| # | Severity | Инструкция | Статус |
|---|----------|------------|--------|
| 1 | informational | На окружениях с БД применить миграцию Drizzle **`0002_sweet_ikaris.sql`** (или актуальный журнал до нужной версии): `pnpm --dir apps/webapp run db:migrate:drizzle`. | **Defer (операционно)** — DevOps / локальная БД; см. `EXECUTION_RULES.md`, `LOG.md`. |
| 2 | optional | При изменении API конструктора — обновлять **`apps/webapp/src/app/api/api.md`** (секции treatment-program-templates). | **Процесс** — на момент аудита описание присутствует (после прошлых FIX). |
| 3 | optional / defer | Расширить автоматическое покрытие **конструктора** (например Vitest in-process для RSC-страницы или сценарий рядом с `treatment-program-blocks-inprocess.test.ts`) — снижает регресс только-UI. | **Defer** — не gate фазы 3 по `MASTER_PLAN`. |

---

## Команды для повторной проверки

```bash
rg '@/infra' apps/webapp/src/modules/treatment-program
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/service.test.ts
pnpm test:webapp
```

---

## Заключение

Фаза 3 **соответствует** `MASTER_PLAN.md`, **`SYSTEM_LOGIC_SCHEMA.md` § 1–4**: таблицы шаблона отражают конструктор из § 1; множество `item_type` совпадает с § 4; полиморфный `item_ref_id` без FK и с сервисной валидацией; **повтор ссылок между этапами** разрешён и покрыт тестом; **модуль изолирован** от `@/infra`; **конструктор** поддерживает добавление/упорядочивание/удаление этапов и элементов.
