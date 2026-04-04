# Stage 6 — безопасный apply-plan (maintenance window)

## Preconditions

- Завершены Stage 1–5 в проде; cutoff согласован (ISO UTC).
- Применена миграция integrator `20260405_0001_integration_data_quality_stage6_backfill.sql` (новые `error_reason` / `status`).
- Свежий **backup** обеих БД (integrator + webapp), либо единого кластера — согласно вашей топологии.
- `DATABASE_URL` / `WEBAPP_DATABASE_URL` проверены на **read-only** dry-run с теми же URL.

## Order of operations

1. Заморозить или снизить нагрузку на запись (окно обслуживания).
2. Сохранить вывод dry-run в тикет (включая построчный список `unresolved`):
   ```bash
   pnpm --dir apps/integrator run timezone:stage6-backfill -- \
     --cutoff-iso=<CUTOFF> \
     --dry-run \
     --unresolved-out=/tmp/stage6-unresolved-dry-run.jsonl \
     > /tmp/stage6-dry-run.json
   ```
3. Вручную сверить `counts` и `samples` (первые строки каждой таблицы).
4. Apply:
   ```bash
   pnpm --dir apps/integrator run timezone:stage6-backfill -- \
     --cutoff-iso=<CUTOFF> \
     --apply \
     --unresolved-out=/tmp/stage6-unresolved.jsonl
   ```
5. Post-check (из `STAGE_6_BACKFILL_HISTORICAL_TIMES.md`):
   - Контрольные SELECT из `DIAGNOSTICS.sql` — для исправленных `diff_min_vs_branch` → 0.
   - Выборка из UI/бота по 2–3 контрольным записям.
   - Файл `stage6-unresolved.jsonl` + строки в `integration_data_quality_incidents` для операционного разбора.

## Риски

- Две БД: транзакции **независимы**. Если COMMIT на integrator прошёл, а webapp упал — восстановление из backup или повторный целевой прогон только webapp-части после анализа (не автоматизировано).
- `--no-require-utc-match` может затронуть строки вне класса «naive как UTC» — использовать только с отдельным SQL-аудитом.

## Rollback

- Точечный откат: восстановление из backup на момент перед apply — основной способ.
- Логический откат без backup не предусмотрен скриптом.
