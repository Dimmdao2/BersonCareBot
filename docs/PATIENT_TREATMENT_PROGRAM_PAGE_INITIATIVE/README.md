# PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

Мини-инициатива по **странице программы лечения** в кабинете пациента: data-enabler, деталь, визуальный редизайн детали с маршрутом этапа, список программ.

**Операционный источник правды (scope, DoD, файлы):** [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) — пункты **§1.0**, **§1.1**, **§1.1a**, **§1.1b**.

**Схема исполнения в roadmap:** A (данные) → B (деталь MVP) → C (редизайн детали + `stages/[stageId]`) → D (список). См. `ROADMAP_2` §1.1a «Схема исполнения для блока 1.x».

**Статус:** в работе / планирование (журнал — [`LOG.md`](LOG.md)).

---

## Main plan — этапы и модели агентов

Порядок строк таблицы — **обязательная последовательность** (следующий этап не начинать без закрытия предыдущего по DoD в `ROADMAP_2`).

| № | Этап (ROADMAP) | Содержание работ | Миграции / маршруты / UI | Основная модель агента | Примечание |
|---|----------------|------------------|---------------------------|-------------------------|------------|
| A | **§1.0** `started_at` | Колонка `started_at` на `treatment_program_instance_stages`, заполнение при `available → in_progress`, backfill, Drizzle + типы + `pg`/`inMemory` репозитории + read-модели | **Миграции + сервисный слой**, UI не обязателен | **GPT‑5.3 Codex** (`gpt-5.3-codex`) | Высокий риск тихих ошибок в данных; merge миграции — с явным ревью. Не расширять scope за пределы §1.0. |
| B | **§1.1a** деталь MVP | `/treatment-programs/[instanceId]`: текущий этап, этап 0, архив, назначения, «План обновлён», дата контроля от `started_at` | **UI + существующий маршрут**; без нового `stages/...` | **Claude Sonnet 4.6** (`claude-4.6-sonnet-medium-thinking`) | **Composer / Cursor Agent** — допустим как исполнитель, если нет изменений портов и схемы БД. |
| C | **§1.1b** редизайн детали | Hero, badges, карточка контроля, `Collapsible` этапа 0, превью этапа, «История тестирования», компактный архив; перенос полного тела этапа на **`stages/[stageId]`** | **Новые маршруты + layout**; миграций **нет** | **Claude Sonnet 4.6** (`claude-4.6-sonnet-medium-thinking`) | UI — Composer/Sonnet. Любое расширение read-порта — отдельным подэтапом с **Codex**. |
| D | **§1.1** список | `/treatment-programs`: hero активной программы, архив в `<details>`, empty state | **UI + loader**; миграций **нет** | **Claude Sonnet 4.6** | **Composer‑2** (`composer-2`) — для узкого S-прохода по списку, если объём не «L». |

Имена моделей приведены в формате, допустимом для **Task / подагентов** в Cursor (см. список slug в правилах репозитория).

---

## Инварианты и правила

- `ROADMAP_2` §1 п.4 — patient primitives, `components/ui/*`, [`PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md).
- `.cursor/rules/patient-ui-shared-primitives.mdc`, `.cursor/rules/clean-architecture-module-isolation.mdc`.
- Не менять закрытое ядро `treatmentProgram*` кроме согласованного **§1.0**; не добавлять проценты прогресса в MVP (§1.1 / §1.1a / §1.1b).

---

## Документы

| Файл | Назначение |
|------|------------|
| [`README.md`](README.md) | Этот файл — main plan и таблица агентов |
| [`STAGE_PLAN.md`](STAGE_PLAN.md) | Порядок A–D + pipeline `EXEC -> AUDIT -> FIX -> COMMIT` + финал `GLOBAL -> PREPUSH -> PUSH` |
| [`STAGE_A.md`](STAGE_A.md) | Подробная декомпозиция §1.0 (`started_at`) |
| [`STAGE_B.md`](STAGE_B.md) | Подробная декомпозиция §1.1a (detail MVP) |
| [`STAGE_C.md`](STAGE_C.md) | Подробная декомпозиция §1.1b (редизайн + `stages/[stageId]`) |
| [`STAGE_D.md`](STAGE_D.md) | Подробная декомпозиция §1.1 (список) |
| [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md) | Шаблоны запусков: stage `exec/audit/fix/commit` + `global audit/fix` + `prepush` + `push` |
| [`LOG.md`](LOG.md) | Журнал: прочитанные rules, scope, решения |
| [`BLOCK_LAYOUT_REFERENCE.md`](BLOCK_LAYOUT_REFERENCE.md) | Примитивные блок-схемы: список, MVP-деталь, **эталон §1.1b**, страница этапа |

---

## Связанные материалы

- Закрытый префикс A/B/C (без **1.0** / **1.1b** в том виде): [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md)
- Отдельное имя под чистый редизайн в roadmap: `PATIENT_PROGRAMS_DETAIL_REDESIGN_INITIATIVE` — при желании можно переименовать/слить папки позже; текущая инициатива покрывает **полный пайплайн** страницы программы (A→D).
