# Stage 6 — исторический backfill времени (артефакты)

Связанный план: `../STAGE_6_BACKFILL_HISTORICAL_TIMES.md`.

## S6.T01 — Диагностика

- SQL-шаблоны: `DIAGNOSTICS.sql` (замените `:cutoff` на литерал `timestamptz`).
- Скрипт печатает гистограмму `skipHistogram` и выборки `samples` при dry-run/apply.

## Критерии точечного backfill (целевая выборка)

Строка попадает в обновление только если одновременно:

1. `created_at < cutoff` — cutoff = согласованная граница «до деплоя нормализации» (ISO-8601, UTC).
2. В `payload_json` есть **наивная** стена времени в поле `record` или `datetime` (формат как в `NAIVE_WALL_CLOCK_REGEX` / Stage 2).
3. Для `record_at IS NOT NULL`: сохранённый instant **не** совпадает с нормализацией `tryNormalizeToUtcInstant(raw, branchTz)` (порог 1 с).
4. По умолчанию (`--require-utc-match`, рекомендовано): сохранённый instant **совпадает** с интерпретацией наивной строки в `Etc/UTC` (класс ошибки «PG `::timestamptz` при session UTC»). Флаг `--no-require-utc-match` расширяет выборку и требует ручной выборки SQL.

Источник IANA зоны:

- `appointment_records`: `branches.timezone` по `branch_id`, иначе `payload_json.branch_id` → `branches.integrator_branch_id`.
- `rubitime_records`: только `payload_json.branch_id` → `branches` (та же БД, что ожидает integrator для `getBranchTimezone`).

Ограничение: используется **текущая** строка `branches.timezone`, не исторический снимок на момент события.

## S6.T02–S6.T04 — Что обновляет скрипт

| Задача  | Таблица            | Условие |
|--------|---------------------|--------|
| S6.T02 | `rubitime_records` | см. критерии |
| S6.T03 | `appointment_records` | см. критерии |
| S6.T04 | `patient_bookings` | `source = 'rubitime_projection'` и есть план по `rubitime_id` из строк S6.T02/S6.T03 |

`patient_bookings.slot_end`: если в payload нет нормализуемого конца слота, сохраняется **длительность** старого интервала.

## S6.T05 — Dry-run

```bash
pnpm install --frozen-lockfile
export DATABASE_URL="postgresql://..."   # integrator DB
export WEBAPP_DATABASE_URL="postgresql://..."  # optional if differs
pnpm --dir apps/integrator run timezone:stage6-backfill -- \
  --cutoff-iso=2026-04-04T00:00:00.000Z \
  --dry-run
```

Две сессии: `BEGIN` → `UPDATE` → отчёт `rowsTouched` → `ROLLBACK` на обеих БД.

## S6.T06 — Apply (maintenance window)

Пошаговый чеклист: `APPLY_PLAN.md`.

## S6.T07 — `record_at IS NULL` и инциденты

- Если наивная стена в payload нормализуется — строка **восстанавливается** (входит в план `restore_null_record_at`).
- Если нормализация невозможна — строка попадает в JSONL (`--unresolved-out=...`) и при **`--apply`** пишется строка в `integration_data_quality_incidents` с `error_reason = backfill_unresolvable`, `status = unresolved` (после миграции `20260405_0001_integration_data_quality_stage6_backfill.sql`).

## Хост (после `pnpm --dir apps/integrator run build`)

```bash
node dist/infra/scripts/stage6-historical-time-backfill.js --cutoff-iso=... --dry-run
```
