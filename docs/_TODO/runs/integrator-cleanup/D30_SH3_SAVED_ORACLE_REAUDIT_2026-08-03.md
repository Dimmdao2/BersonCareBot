# D30 Ш3 — повторный аудит по сохранённым oracle

Final candidate: `4deeb99be639ef701c9fa47de833c8940eca29a5` (`ae89f61b1`, `aae3a4917`,
fix `1f9b2f22f`, sync/final migration number `4deeb99be`). Исходный независимый FAIL и два
сохранённых oracle: audit commit `6d2c159fde`.

Owner gate: `D30_SCHEDULER_REVERSAL_PLAN.md` Ш3 — при одновременных producer/cron остаются одна stable
queue identity и одна внешняя отправка; после успешной доставки `reminder_sent_at` применяется один раз.

## Verdict: **PASS по сохранённым oracle**

Оба достижимых разрыва `6d2c159fde` закрыты:

1. Generic specialist transport сначала выполняет provider dispatch и durable `queueMarkSent`. Product receipt
   и messenger bot-marker выполняются после terminal transport state; отдельный sent-row retry повторяет только
   bookkeeping и не вызывает provider.
2. Producer записывает fingerprint канонических task/binding/preferences/topic/subscription/settings. Delivery
   role перед provider dispatch вызывает exact claim-time capability; recipient rebind и topic disable переводят
   stale processing row в `failed_retryable`, после чего producer заменяет ту же stable `event_id`.

## Поведенческие проверки

```text
pnpm --dir apps/integrator exec vitest run \
  src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts
→ 1 file / 13 passed

pnpm --dir apps/webapp exec vitest run \
  src/modules/specialist-tasks/prepareReminderDeliveries.test.ts
→ 1 file / 3 passed

pnpm --dir apps/integrator run check:d30-outgoing-delivery-claim-concurrency
→ pieces 4a–4f PASS
```

Fresh disposable PostgreSQL piece `4e` доказал: locked delivery role не имеет прямого task DML; exact sent
outcome применяет queue `sent_at`, повтор идемпотентен, cross-tenant outcome отклонён, незавершённые product и
bot-marker receipts не удаляются retention. Piece `4f` доказал: rebind и topic disable внутри пятисекундного
worker window отклоняются до provider; два конкурентных producer оставляют одну строку с тем же `event_id`.

## Независимые fault injections

- Bot-marker cleanup временно возвращён внутрь transport `try` до `queueMarkSent`. Точная команда с oracle
  `-t "does not repeat an external specialist reminder when bot-marker bookkeeping fails after send"`
  покраснела: expected `markedSent=1`, received `0`. Поломка восстановлена.
- `app.revalidate_specialist_task_reminder_materialization` временно заменён на безусловный `RETURN true` после
  claim. Disposable piece `4f` покраснел точной причиной `a recipient rebind inside one 5s worker window must
  fail closed`. Поломка восстановлена.

После восстановления полный worker test снова `13/13`, рабочее product-tree чистое до audit artifacts.

## Migration / boundaries

- `apps/webapp/db/drizzle-migrations/0333_d30_specialist_task_delivery_outcome_capability_local.sql` существует;
  temporary `9998...` отсутствует.
- `_journal.json`: `idx=331`, `when=1793539230037`, tag
  `0333_d30_specialist_task_delivery_outcome_capability_local`.
- Board `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` резервирует `0333` за D30 Ш3 и открывает `0334+`.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` → OK;
  `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` → exit 0.
- `node scripts/check-no-new-raw-sql.mjs` → OK, production debt `0`;
  `node scripts/check-db-chokepoint.mjs` и `node scripts/check-queue-port-boundary.mjs` → OK.
- C4 overlay и runtime readiness дают delivery worker только EXECUTE двух exact specialist capabilities;
  disposable role probe подтвердил запрет прямого `UPDATE public.specialist_tasks`.
- Integrator и webapp typecheck, package-scoped ESLint и `git diff --check` → PASS.

DEV, TEST, PROD, land и product branch не изменялись. Для закрытия полного owner gate Ш3 ещё обязателен
записанный в плане live DEV прогон после штатного land/apply; этот audit разрешает candidate к этому шагу.
