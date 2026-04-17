# Audit Stage 1 — первичные результаты

**Дата аудита (UTC):** 2026-04-03  
**Документы-вход:** `STAGE_1_BRANCH_TIMEZONE_DB.md`, `MASTER_PLAN.md`, `AGENT_EXECUTION_LOG.md`  
**Проверка CI:** `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (exit 0).

---

## Verdict

**REWORK_REQUIRED**

---

## Сводка по чеклисту

| # | Критерий | Результат |
|---|-----------|-----------|
| 1 | Миграции timezone для `branches` и `booking_branches` | **OK:** `056_branches_timezone.sql`, `057_booking_branches_timezone.sql`, `058_branch_timezone_seed.sql` |
| 2 | Колонки `NOT NULL`, дефолт `Europe/Moscow` | **OK** |
| 3 | `getBranchTimezone`: TTL + fallback | **OK в коде** (см. critical: источник данных vs админка) |
| 4 | UI/валидация не ломают сохранение | **Частично:** PATCH/POST для каталога согласованы; см. critical + major |
| 5 | Тесты + `pnpm run ci` | **OK** (подтверждено локальным прогоном) |

---

## Findings

### Critical

**C1 — Разные таблицы: админка пишет `booking_branches`, integrator читает `branches`**

- **Проблема:** `getBranchTimezone` выбирает `timezone` только из `branches` (`integrator_branch_id`). Админ booking-catalog обновляет `booking_branches`. Нет синхронизации `UPDATE branches SET timezone = …` при сохранении каталога.
- **Файлы:** `apps/integrator/src/infra/db/branchTimezone.ts`, `apps/webapp/src/infra/repos/pgBookingCatalog.ts`; при синке через проекцию — `apps/webapp/src/infra/repos/pgBranches.ts`.
- **Исправление:** при PATCH/upsert каталога обновлять `branches.timezone` по связке `rubitime_branch_id` → `integrator_branch_id`, **или** перенести чтение в `getBranchTimezone` на `booking_branches` (с тем же fallback).

### Major

**M1 — `upsertBranch`: при `ON CONFLICT` не обновляется `timezone`**

- **Проблема:** В `DO UPDATE` нет присвоения `timezone` из `EXCLUDED`, повторный POST не меняет TZ у существующей строки.
- **Файл:** `apps/webapp/src/infra/repos/pgBookingCatalog.ts` (`upsertBranch`).
- **Исправление:** добавить `timezone = EXCLUDED.timezone` (и согласовать с дефолтом для INSERT).

### Minor

**m1 — Seed по offset только для `branches`**

- **Файл:** `apps/webapp/migrations/058_branch_timezone_seed.sql`
- **Исправление:** при необходимости — зеркальный UPDATE для `booking_branches` / JOIN с `branches`.

**m2 — В `AGENT_EXECUTION_LOG.md` нет выполненных SQL-проверок post-migrate**

- **Исправление:** после миграций на целевой БД — `COUNT(*) WHERE timezone IS NULL`, `\d+ branches` / `booking_branches`, зафиксировать в логе.

**m3 — Нет теста на нечисловой `branchId` для `getBranchTimezone`**

- **Файл:** `apps/integrator/src/infra/db/branchTimezone.test.ts`
- **Исправление:** кейс вроде `getBranchTimezone('abc')` → `Europe/Moscow`, без лишнего query.

---

## Заметки

- Gate Stage 1 по схеме и CI близок к выполнению, но **единый источник правды для TZ между админкой и integrator** без доработки не гарантирован → **REWORK_REQUIRED**.
