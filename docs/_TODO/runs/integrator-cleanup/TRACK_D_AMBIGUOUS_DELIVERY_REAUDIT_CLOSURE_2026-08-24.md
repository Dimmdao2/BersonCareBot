# Track D #987 — закрытие focused re-audit `dispatching`

Основание: `TRACK_D_AMBIGUOUS_DELIVERY_REAUDIT_RESULT_2026-08-24.md`.

## Итог

- `D987-F2` закрыт: лестница каналов напоминания о записи теперь принимает строку после провайдерского
  барьера в состоянии `dispatching`, сохраняет настоящий отказ провайдера и переводит строку в
  `failed_retryable`/`dead` по прежней политике.
- `D987-F3` закрыт: fake-DB тест больше не изображает SQL восстановления и повторного захвата очереди.
  Он заявляет только то, что действительно наблюдает; поведение PostgreSQL доказано отдельно на именованной DEV.
- Новый объект не добавлен. Изменено тело существующей SECURITY DEFINER-функции
  `app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)`.

## Разбор прав изменённой функции

- Владелец statement и функции: `app_seam_reminder_appointment_owner`.
- Вызывающая runtime-роль: `app_operational_delivery_worker` через существующий accepted-context gate.
- Функция читает только `payload_json` выбранной строки и обновляет существующие колонки очереди.
  Первый живой прогон с `SELECT *` получил `permission denied for table outgoing_delivery_queue`; тело было
  сужено до реально нужной колонки, а права не расширялись.
- Существующая декларация уже содержит нужные поколоночные `SELECT`/`UPDATE`. Новых grant/revoke и изменений
  `declaration.ts` нет.

## Проверки

Фокусные тесты воркера:

```text
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts \
  src/infra/runtime/worker/outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts
→ 2 files, 7 tests passed
```

Расширенный контур воркера: `14 files, 71 tests passed`. Typecheck интегратора и целевой ESLint — exit `0`.

Полный статический контур прав после исправления marker'ов и тела:

```text
node --test deploy/postgres/privileges/*.test.mjs
→ tests 282; pass 162; fail 0; skipped 120
```

Owner-aware preflight на именованной DEV:

```text
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only
→ exit 0; pending=6; total=63; transaction ROLLBACK
```

Живой транзакционный вызов настоящей функции на `bcb_webapp_dev` после применения pending-миграций:

```text
audit-d987-fixed-dispatching|failed_retryable|max|1|AUDIT_PROVIDER_REJECTED|t
audit-d987-fixed-processing|processing|telegram|0||f
ROLLBACK
```

То есть `dispatching`-строка переключилась на резервный канал, сохранила реальную ошибку и получила время
ретрая; контрольная `processing`-строка не была ошибочно принята новым guard'ом. Все изменения DEV-пробы
откачены той же транзакцией.

## Решение по повторному аудиту

Поверхность не расширялась за пределы двух точных findings: исправлено найденное состояние guard'а и удалена
ложная заявка fake-DB теста. Применён kill-set уже выполненного независимого focused-аудита плюс живой
PostgreSQL acceptance; новый слепой круг по той же поверхности не запускается по §24.5/§10 strong reuse.
