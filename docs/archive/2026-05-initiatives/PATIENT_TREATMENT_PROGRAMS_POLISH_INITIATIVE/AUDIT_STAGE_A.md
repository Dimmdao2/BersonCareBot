# AUDIT — Stage A (`started_at` data enabler)

**Дата аудита:** 2026-05-04  
**Дата FIX по аудиту:** 2026-05-04  
**Канон этапа:** [`STAGE_A.md`](STAGE_A.md) · журнал исполнения: [`LOG.md`](LOG.md).

---

## FIX closure — Critical / Major / Minor

| Уровень | Статус | Что сделано |
|---------|--------|-------------|
| **Critical** | **CLOSED** | Проверено: один файл [`0043_treatment_program_instance_stage_started_at.sql`](../../../apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql); ровно одна запись `tag` `0043_treatment_program_instance_stage_started_at` в [`meta/_journal.json`](../../../apps/webapp/db/drizzle-migrations/meta/_journal.json). Логика `updateInstanceStage`: `started_at` в `SET` только при `startedAtForPatch !== undefined` (нет перезаписи при повторном `in_progress`). |
| **Major** | **CLOSED** | `TreatmentProgramInstanceStageRow.startedAt` в типах; `mapStage` отдаёт поле в detail; backfill SQL совпадает с описанием в [`LOG.md`](LOG.md). |
| **Minor** | **CLOSED / DEFER** | (1) **CLOSED** — команда `rg` и vitest в [`STAGE_A.md`](STAGE_A.md) обновлены (`started_at\|startedAt` + контрактный тест). (2) **CLOSED (частично)** — добавлен [`pgTreatmentProgramInstance.startedAt.contract.test.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts) (статическая проверка исходника PG-репо без БД). **DEFER:** полноценный PG integration test (INSERT/SELECT через `getDrizzle` под `USE_REAL_DATABASE=1`) не добавлен: в `package.json` `test:with-db` нет сценария treatment-program; default `vitest.setup` обнуляет `DATABASE_URL`; ввод в общий DB-harness — отдельная задача при появлении стандарта для instance-tree в реальной БД. (3) **CLOSED** — комментарий у `startedAtForPatch` в [`pgTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts). |

---

## 1) `started_at` добавлен корректно и additive

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Только добавление колонки, без удаления/переименования существующих | **PASS** | Миграция: один `ALTER TABLE ... ADD COLUMN "started_at"` ([`0043_treatment_program_instance_stage_started_at.sql`](../../../apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql)). |
| Nullable, без принудительного `NOT NULL` на сырых данных | **PASS** | Колонка `timestamp with time zone` без `NOT NULL`; Drizzle: `startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })` без `.notNull()` в [`treatmentProgramInstances.ts`](../../../apps/webapp/db/schema/treatmentProgramInstances.ts). |
| Схема приложения согласована с миграцией | **PASS** | Поле `startedAt` на `treatmentProgramInstanceStages` в том же файле схемы. |

**Вывод:** изменение additive и безопасно для отката схемы только удалением колонки (отдельная миграция вне scope этого аудита).

---

## 2) Миграция и backfill-эвристика описаны и воспроизводимы

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| SQL воспроизводим из репозитория | **PASS** | Файл миграции + тег в [`meta/_journal.json`](../../../apps/webapp/db/drizzle-migrations/meta/_journal.json): `0043_treatment_program_instance_stage_started_at`. |
| Эвристика явная | **PASS** | `UPDATE ... SET started_at = inst.created_at WHERE status = 'in_progress' AND started_at IS NULL` (join на `treatment_program_instances`). |
| Ограничения задокументированы | **PASS** | В [`LOG.md`](LOG.md): backfill только для `in_progress`; для `completed` / `skipped` / `locked` / `available` без истории старта — `NULL` осознанно. |

**Воспроизведение на окружении с БД** (после `DATABASE_URL` из [`SERVER CONVENTIONS`](../../../ARCHITECTURE/SERVER%20CONVENTIONS.md) для dev):

```bash
cd apps/webapp
pnpm exec drizzle-kit migrate
```

Ожидание: применится `0043_...sql`; post-migrate для строк `in_progress` без `started_at` поле заполнится из `created_at` экземпляра.

---

## 3) `started_at` проходит через type / repo / read-model

| Слой | Статус | Доказательство |
|------|--------|----------------|
| Тип строки этапа | **PASS** | `TreatmentProgramInstanceStageRow.startedAt: string \| null` в [`types.ts`](../../../apps/webapp/src/modules/treatment-program/types.ts). |
| Read-model детали | **PASS** | `TreatmentProgramInstanceDetail.stages` — массив `TreatmentProgramInstanceStageRow & { groups; items }`; маппинг `mapStage` включает `startedAt` в [`pgTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts). |
| PG write | **PASS** | Insert дерева / `addInstanceStage`: `startedAt` при начальном `in_progress`; `updateInstanceStage`: условная установка (см. п. 4). |
| In-memory симметрия | **PASS** | Те же правила в [`inMemoryTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts). |
| Контракт PG-файла (без live DB) | **PASS (post-FIX)** | [`pgTreatmentProgramInstance.startedAt.contract.test.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts) фиксирует наличие `mapStage.startedAt` и guard для первого `in_progress`. |

**DEFER (полный PG):** см. таблицу «FIX closure» — отдельный интеграционный прогон против Postgres для instance stages вне scope этого FIX.

---

## 4) `available` → `in_progress`: `started_at` только при `NULL`

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Не перетирать уже заданное значение | **PASS** | PG: `startedAtForPatch = patch.status === "in_progress" && !stRow.startedAt ? ... : undefined`; в `.set()` поле попадает только если `!== undefined` ([`pgTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts) ~407–415). |
| In-memory аналог | **PASS** | `nextStartedAt = patch.status === "in_progress" && !st.startedAt ? isoNow() : st.startedAt`. |
| Поведение на уровне продукта | **PASS (с уточнением)** | Код задаёт время при **любом** переходе в `in_progress`, если `started_at` ещё `NULL` (не только из `available`). Для канонического потока `locked → available → in_progress` это эквивалентно требованию STAGE_A; прямой прыжок в `in_progress` из другого статуса теоретически тоже получит метку первого входа — приемлемо как «первый раз в in_progress». |

**Тесты:** `progress-service.test.ts` — touch `available → in_progress` с assert на `startedAt`; сценарий двойного `doctorSetStageStatus(..., in_progress)` сохраняет то же значение.

---

## 5) Целевые проверки этапа A реально прогнаны

Команды из [`STAGE_A.md`](STAGE_A.md) «Локальные проверки»:

| Команда | Статус |
|---------|--------|
| `rg "started_at|startedAt" apps/webapp/db/schema/treatmentProgramInstances.ts apps/webapp/src/modules/treatment-program apps/webapp/src/infra/repos` | **PASS** (команда из [`STAGE_A.md`](STAGE_A.md) post-FIX; прогон при закрытии FIX). |
| `pnpm --dir apps/webapp exec tsc --noEmit` | **PASS** (exit 0). |
| `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts` | **PASS** (25 tests: 24 + 1; см. [`LOG.md`](LOG.md)). |

Дополнительно: в [`LOG.md`](LOG.md) зафиксированы предыдущие прогоны связанных vitest/eslint; при FIX обновлены только целевые команды этапа A.

---

## Сводка finding’ов по серьёзности (первичный аудит)

| Уровень | Количество | Кратко |
|---------|------------|--------|
| Critical | 0 | Блокирующих дефектов по пп. 1–5 не выявлено → **закрыто подтверждением в «FIX closure»**. |
| Major | 0 | Нарушений контракта не выявлено → **закрыто подтверждением в «FIX closure»**. |
| Minor | 2 (исходно) | Закрыты правками STAGE_A + контрактный тест + комментарий; PG live — **defer** с обоснованием в «FIX closure». |

---

## MANDATORY FIX INSTRUCTIONS

**Статус после FIX (2026-05-04):** сценарии Critical / Major не требовали правок кода — закрыты верификацией артефактов. Minor закрыты частично (см. «FIX closure»); превентивные шаги ниже остаются для **будущего регресса**.

### Critical (блокер релиза / данных)

**Сейчас (post-FIX):** **CLOSED** — журнал и файл миграции согласованы; перезапись `started_at` при повторном update исключена текущей реализацией.

**Если обнаружено (регресс):**

1. **Миграция не в журнале или дублирует tag** — синхронизировать [`meta/_journal.json`](../../../apps/webapp/db/drizzle-migrations/meta/_journal.json) с единственным файлом `0043_*.sql`; не применять «ручной» SQL в прод без той же семантики, что в репозитории.
2. **`started_at` перетирается при повторном `UPDATE`** — в `updateInstanceStage` (pg + inMemory) восстановить условие: писать `started_at` **только** если `patch.status === "in_progress"` и текущее значение в строке `NULL`/отсутствует; не включать колонку в `SET` при сохранении существующего значения (как в текущем PG-коде с `startedAtForPatch`).

### Major (нарушение контракта этапа A)

**Сейчас (post-FIX):** **CLOSED** — тип, read-path и backfill согласованы.

**Если обнаружено (регресс):**

1. **Тип `TreatmentProgramInstanceStageRow` без `startedAt`, но схема/БД уже с колонкой** — добавить поле в [`types.ts`](../../../apps/webapp/src/modules/treatment-program/types.ts) и во все ручные тестовые фикстуры `TreatmentProgramInstanceDetail`, иначе `tsc` и runtime-моки разъедутся.
2. **Read API / detail не отдаёт поле** — проверить `mapStage` и любые альтернативные селекты этапов; убедиться, что Drizzle `select()` не использует урезанный projection без `started_at`.
3. **Backfill противоречит заявленной эвристике** — править только SQL миграции в согласовании с командой (новая миграция «fix-up», не silent edit уже применённого файла на прод).

### Minor (качество / наблюдаемость)

**Сейчас (post-FIX):**

1. **CLOSED** — [`STAGE_A.md`](STAGE_A.md): `rg "started_at|startedAt"` и второй файл в `vitest run`.
2. **CLOSED (контракт)** + **DEFER (live PG)** — см. «FIX closure»: статический тест репозитория добавлен; полный PG harness — отложен.
3. **CLOSED** — комментарий у `startedAtForPatch` в PG-репозитории.

**Если регресс:**

1. Восстановить команды в `STAGE_A.md` и прогон контрактного теста.
2. При появлении общего `test:with-db` для treatment-program — добавить сценарий `getInstanceById` с проверкой колонки в БД.

---

## Ссылки на первичные артефакты

- Миграция: [`apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql`](../../../apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql)
- Схема Drizzle: [`apps/webapp/db/schema/treatmentProgramInstances.ts`](../../../apps/webapp/db/schema/treatmentProgramInstances.ts)
- Репозитории: [`pgTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts), [`inMemoryTreatmentProgramInstance.ts`](../../../apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts)
- Тесты: [`progress-service.test.ts`](../../../apps/webapp/src/modules/treatment-program/progress-service.test.ts), [`pgTreatmentProgramInstance.startedAt.contract.test.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts)
