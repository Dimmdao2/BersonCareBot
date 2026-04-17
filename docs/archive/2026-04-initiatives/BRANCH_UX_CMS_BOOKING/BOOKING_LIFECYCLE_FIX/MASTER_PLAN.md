# MASTER PLAN: Booking Lifecycle Fix

**Дата:** 2026-04-02
**Корневая причина (RCA):** Сломанный жизненный цикл записей — `patient_bookings.rubitime_id` может быть `NULL` после создания, из-за чего вебхуки Rubitime (отмена, перенос) не матчатся с записью в webapp, и UI показывает устаревшие данные.

---

## Суть проблемы (для всех агентов)

1. `service.ts:createBooking` вызывает `markConfirmed(pending.id, sync.rubitimeId)` даже когда `sync.rubitimeId === null`
2. `pgPatientBookings.ts:upsertFromRubitime` ищет запись только по `rubitime_id` — если оно `NULL`, обновление не применяется
3. `bookingM2mApi.ts:postSigned` не имеет ретраев — единственный сбой сети = потерянная запись
4. `client.ts:postRubitimeApi2` (integrator → Rubitime API) не имеет ретраев
5. `recordM2mRoute.ts`: все уведомления отправляются с `maxAttempts: 1`
6. Нет fallback-матчинга вебхуков по `contact_phone + slot_start`

---

## Архитектура решения

### 3 агента, 3 стадии (последовательные)

```
AGENT A  [Auto-agent, EXEC]  — Stage 1: Core Lifecycle Fix + Retries
AGENT B  [Auto-agent, EXEC]  — Stage 2: Data Cleanup
AGENT C  [Composer,   AUDIT] — Stage 3: Аудит обоих стадий
```

**Принцип экономии:**
- Один `EXEC`-агент делает всю кодовую часть (webapp + integrator).
- Второй `EXEC`-агент пишет только SQL-чистку (параллельно или после Stage 1).
- Один `AUDIT`-агент проверяет оба результата.
- Нет раздутого количества стадий. Нет отдельных FIX-прогонов — если аудит найдет rework, тот же агент и чинит.

---

## Stage 1: Core Lifecycle Fix + Retries (Agent A)

### Scope (строго)

| # | Что | Файл | Суть изменения |
|---|-----|------|----------------|
| 1.1 | Retry для `postSigned` | `apps/webapp/src/modules/integrator/bookingM2mApi.ts` | Обернуть `postSigned()` в retry (3 попытки, exp backoff 1s/2s/4s, только 5xx и network errors). Не ретраить 4xx. |
| 1.2 | Lifecycle guard | `apps/webapp/src/modules/patient-booking/service.ts` | Если `sync.rubitimeId === null` после `createRecord` — вызывать `markFailedSync(pending.id)`, бросать `Error("rubitime_id_missing")`. Не вызывать `markConfirmed`. |
| 1.3 | Fallback matching | `apps/webapp/src/infra/repos/pgPatientBookings.ts` | В `upsertFromRubitime`: если строка по `rubitime_id` не найдена — попытаться найти по `contact_phone + slot_start` среди `source='native'` строк с `rubitime_id IS NULL` и `status IN ('creating','confirmed','failed_sync')`. Если нашли — обновить `rubitime_id` и применить апдейт. |
| 1.4 | Retry для Rubitime API | `apps/integrator/src/integrations/rubitime/client.ts` | Обернуть `postRubitimeApi2()` в retry (2 попытки, backoff 2s, только HTTP 5xx и network). |
| 1.5 | Увеличить maxAttempts | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` | `maxAttempts: 1` → `maxAttempts: 3` для всех TG/MAX сообщений в `sendLinkedChannelMessage` и `sendDoctorMessage`. |
| 1.6 | Тесты | `apps/webapp/src/modules/patient-booking/service.test.ts` и рядом | Тест: `rubitimeId=null` → `failed_sync`. Тест: retry postSigned. Тест: fallback matching по phone+slot. |
| 1.7 | CI | — | `pnpm run ci` должен быть зелёным. |

### Чего НЕ делать

- Не менять типы/статусы `PatientBookingStatus` (уже есть `creating`, `failed_sync`).
- Не менять архитектуру (outbox, saga, etc). Только точечные правки.
- Не трогать UI компоненты кабинета.
- Не добавлять новые миграции, если не требуется (fallback matching — чисто в коде).

---

## Stage 2: Data Cleanup (Agent B)

### Scope

| # | Что | Где | Суть |
|---|-----|-----|------|
| 2.1 | Диагностический SQL | `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_diagnostic.sql` | Считает: `confirmed` с `rubitime_id IS NULL`, `failed_sync`, `creating` старше 1 часа. Только `SELECT`, без мутаций. |
| 2.2 | Cleanup SQL | `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_fix.sql` | Переводит `confirmed` с `rubitime_id IS NULL` и `source='native'` в `failed_sync`. Переводит `creating` старше 1 часа в `failed_sync`. Обёрнуть в транзакцию с `ROLLBACK` по умолчанию (manual commit). |
| 2.3 | Reconcile-скрипт | `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_reconcile.sql` | Для каждого `failed_sync` native-записи: попробовать найти `rubitime_records` в интеграторе по `phone + slot_start`, записать `rubitime_id` обратно, перевести в `cancelled` если в rubitime запись отменена. DRY RUN по умолчанию. |

### Чего НЕ делать

- Не писать миграции — это одноразовые ручные скрипты.
- Не менять код приложения.

---

## Stage 3: Audit (Agent C)

Проверяет Stage 1 + Stage 2 вместе. Финальный gate.

---

## Промпты

### STAGE 1 — EXEC (Agent A)

```text
Выполни Stage 1: Core Lifecycle Fix + Retries.

## Контекст (RCA)

Записи в webapp не обновляются по вебхукам Rubitime, потому что:
- `service.ts:createBooking` вызывает `markConfirmed(pending.id, sync.rubitimeId)` даже когда `sync.rubitimeId === null`
- `upsertFromRubitime` ищет только по `rubitime_id` — если NULL, обновление теряется
- Нет ретраев ни на одном критическом вызове

## Задачи (последовательно)

### 1.1 — Retry для `postSigned`

Файл: `apps/webapp/src/modules/integrator/bookingM2mApi.ts`

Добавь приватную функцию `postSignedWithRetry` (или оберни существующую `postSigned`):
- 3 попытки, exponential backoff (1000ms, 2000ms, 4000ms)
- Ретрай ТОЛЬКО при: `status >= 500`, или `fetch` бросил network error (TypeError)
- При 4xx — НЕ ретраить, сразу возвращать
- Все вызовы `postSigned` в `createBookingSyncPort()` должны идти через retry-обёртку
- Не вводить внешних зависимостей — простая функция с `setTimeout`/`await`

### 1.2 — Lifecycle guard в createBooking

Файл: `apps/webapp/src/modules/patient-booking/service.ts`

В методе `createBooking`, после успешного `syncPort.createRecord`:
- Если `sync.rubitimeId === null` или пустая строка:
  - Вызвать `bookingsPort.markFailedSync(pending.id)`
  - Вызвать `invalidateSlotsCache()`
  - Бросить `new Error("rubitime_id_missing")`
- Если `sync.rubitimeId` есть — продолжить как сейчас (`markConfirmed`)

### 1.3 — Fallback matching в upsertFromRubitime

Файл: `apps/webapp/src/infra/repos/pgPatientBookings.ts`

В методе `upsertFromRubitime`, после `SELECT ... WHERE rubitime_id = $1`:
- Если `existingRow` не найден и `input.contactPhone` не пустой:
  - Сделать fallback-поиск:
    ```sql
    SELECT id, source, slot_start FROM patient_bookings
    WHERE rubitime_id IS NULL
      AND source = 'native'
      AND status IN ('creating', 'confirmed', 'failed_sync')
      AND contact_phone = $1
      AND slot_start = $2::timestamptz
    ORDER BY created_at DESC
    LIMIT 1
    ```
  - Если нашли: обновить `rubitime_id = input.rubitimeId` в этой строке, затем идти в существующий UPDATE path
  - Если не нашли: идти в существующий CREATE compat-row path

Важно:
- Нормализовать телефон перед сравнением (использовать `normalizeRuPhoneE164` из `@/shared/phone/normalizeRuPhoneE164`)
- Не ломать существующую логику для `source='rubitime_projection'` строк
- Fallback должен срабатывать ТОЛЬКО для `source='native'` строк

### 1.4 — Retry для Rubitime API (integrator)

Файл: `apps/integrator/src/integrations/rubitime/client.ts`

Добавь retry в `postRubitimeApi2`:
- 2 попытки (1 основная + 1 retry), backoff 2000ms
- Ретрай ТОЛЬКО при: `response.status >= 500` или network error
- НЕ ретраить бизнес-ошибки (parsed.status !== 'ok' при HTTP 200)
- Реализовать внутри функции, без внешних зависимостей

### 1.5 — Увеличить maxAttempts для уведомлений

Файл: `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`

Заменить `maxAttempts: 1` на `maxAttempts: 3` во всех вызовах `dispatchPort.dispatchOutgoing` внутри:
- `sendLinkedChannelMessage` (telegram + max)
- `sendDoctorMessage` (telegram + max)

Это 4 места в файле. Не менять `maxAttempts` в `scheduleBookingReminders` — там уже 2.

### 1.6 — Тесты

Написать или обновить:
1. `patient-booking/service.test.ts`:
   - Тест: `syncPort.createRecord` возвращает `rubitimeId: null` → статус `failed_sync`, бросает `rubitime_id_missing`
   - Тест: `syncPort.createRecord` возвращает `rubitimeId: "123"` → работает как раньше, `confirmed`

2. Тест для fallback matching (в существующем тестовом файле или новом):
   - `upsertFromRubitime` с `rubitimeId` которого нет в БД, но есть native строка с тем же `phone + slot_start` и `rubitime_id IS NULL` → строка обновляется, `rubitime_id` проставляется

3. Если есть тесты для `bookingM2mApi` — обновить для retry. Если нет — минимальный тест retry-логики.

### 1.7 — CI

Прогнать `pnpm run ci`. Должен быть зелёный. Если нет — починить.

## Ограничения

- НЕ менять `PatientBookingStatus` тип — все нужные статусы уже есть
- НЕ добавлять миграций
- НЕ менять UI
- НЕ вводить новых npm-зависимостей
- НЕ расширять scope за пределы перечисленных файлов

## Результат

Обнови `docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/AGENT_EXECUTION_LOG.md`:
- Секция: BOOKING_LIFECYCLE_FIX Stage 1
- Таблица: задача → файл → статус (done/blocked)
- CI evidence (green/red + дата)
```

---

### STAGE 2 — EXEC (Agent B)

```text
Напиши SQL-скрипты для чистки данных booking после lifecycle-бага.

## Контекст

В таблице `patient_bookings` (webapp DB, `bcb_webapp_dev` / `bcb_webapp_prod`) есть записи с проблемами:
- `status = 'confirmed'` но `rubitime_id IS NULL` (запись не подтверждена в Rubitime, но отображается как активная)
- `status = 'creating'` старше 1 часа (зависшие записи)
- Часть таких записей на самом деле уже отменена в Rubitime, но webapp об этом не знает

Таблица в интеграторе: `rubitime_records` (DB `bersoncarebot_dev` / `bersoncarebot_prod`).

## Задачи

### 2.1 — Диагностический скрипт

Файл: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_diagnostic.sql`

Только SELECT, без мутаций:
```sql
-- 1. Confirmed без rubitime_id (native)
SELECT id, contact_phone, contact_name, slot_start, slot_end, status, source, created_at
  FROM patient_bookings
 WHERE status = 'confirmed'
   AND rubitime_id IS NULL
   AND source = 'native';

-- 2. Creating старше 1 часа
SELECT id, contact_phone, contact_name, slot_start, slot_end, status, created_at
  FROM patient_bookings
 WHERE status = 'creating'
   AND created_at < now() - interval '1 hour';

-- 3. Failed sync
SELECT id, contact_phone, contact_name, slot_start, slot_end, rubitime_id, created_at
  FROM patient_bookings
 WHERE status = 'failed_sync';

-- 4. Общая статистика
SELECT status, source, count(*)
  FROM patient_bookings
 GROUP BY status, source
 ORDER BY status, source;
```

### 2.2 — Cleanup скрипт

Файл: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_fix.sql`

- `BEGIN;` в начале, `ROLLBACK;` в конце (оператор вручную заменит на `COMMIT;` после проверки).
- Перевести `confirmed` + `rubitime_id IS NULL` + `source='native'` → `status='failed_sync'`, `updated_at=now()`.
- Перевести `creating` + `created_at < now() - interval '1 hour'` → `status='failed_sync'`, `updated_at=now()`.
- Каждый UPDATE с `RETURNING id, contact_phone, slot_start` для контроля.

### 2.3 — Reconcile скрипт (cross-DB)

Файл: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_reconcile.sql`

Это инструкция для ручного запуска, не автомиграция.
Скрипт-план (пошаговый, ручной):

```
Шаг 1: Выгрузить из webapp DB все failed_sync native-записи:
  SELECT id, contact_phone, slot_start FROM patient_bookings
  WHERE status = 'failed_sync' AND source = 'native';

Шаг 2: Для каждой записи — проверить в integrator DB наличие rubitime_records:
  SELECT rubitime_record_id, status FROM rubitime_records
  WHERE phone_normalized = '<phone>' AND record_at = '<slot_start>';

Шаг 3: Если найдено:
  - Если rubitime_records.status IN ('canceled','deleted'):
    → UPDATE patient_bookings SET status='cancelled', rubitime_id=<rubitime_record_id>, cancelled_at=now(), cancel_reason='reconcile_rubitime_cancelled' WHERE id=<id>;
  - Если rubitime_records.status = 'created' или 'recorded':
    → UPDATE patient_bookings SET status='confirmed', rubitime_id=<rubitime_record_id> WHERE id=<id>;
  
Шаг 4: Если не найдено — оставить failed_sync (запись не дошла до Rubitime).
```

Добавь комментарии в каждом скрипте: что делает, когда запускать, какую DB.

## Ограничения

- Только SQL и инструкции. Никакого кода приложения.
- Все скрипты — dry run по умолчанию (ROLLBACK или SELECT).
- Не пиши миграции.
```

---

### STAGE 3 — AUDIT (Agent C)

```text
Проведи аудит Stage 1 (Core Lifecycle Fix + Retries) и Stage 2 (Data Cleanup).

## Обязательные проверки Stage 1

1. **Retry postSigned**: реализован внутри файла без внешних зависимостей; backoff корректен; 4xx не ретраятся; 5xx и network ретраятся; все вызовы проходят через retry.

2. **Lifecycle guard**: при `sync.rubitimeId === null` — вызывается `markFailedSync`, бросается ошибка, НЕ вызывается `markConfirmed`. При `sync.rubitimeId !== null` — поведение не изменилось.

3. **Fallback matching**: работает ТОЛЬКО для `source='native'` строк с `rubitime_id IS NULL`; нормализует телефон перед сравнением; при нахождении — проставляет `rubitime_id` и применяет обновление статуса; НЕ ломает compat-row path для `rubitime_projection`.

4. **Retry postRubitimeApi2**: аналогично п.1, корректен для integrator-стороны; бизнес-ошибки (status !== 'ok' при HTTP 200) НЕ ретраятся.

5. **maxAttempts**: все 4 места `maxAttempts: 1` в `sendLinkedChannelMessage` и `sendDoctorMessage` заменены на `maxAttempts: 3`.

6. **Тесты**:
   - Есть тест на `rubitimeId: null → failed_sync`
   - Есть тест на fallback matching по phone+slot
   - Нет тестовых регрессий (существующие тесты не сломаны)

7. **CI**: `pnpm run ci` зелёный.

## Обязательные проверки Stage 2

1. Диагностический SQL — только SELECT, без мутаций.
2. Cleanup SQL — обёрнут в транзакцию, ROLLBACK по умолчанию, с RETURNING.
3. Reconcile — инструкция понятна, шаги корректны, cross-DB логика описана.
4. SQL синтаксис корректен для PostgreSQL.

## Формат ответа

```
verdict: pass | rework
findings:
  - [critical|major|minor] описание → файл → как исправить
```

Если `rework`: дать конкретные инструкции для Agent A или Agent B.
```

---

## Порядок выполнения

```
1. Agent A: Stage 1 EXEC (можно начинать сразу)
2. Agent B: Stage 2 EXEC (можно начинать параллельно с Agent A)
3. Agent C: Stage 3 AUDIT (только после завершения Stage 1 + Stage 2)
4. Если rework → тот же Agent A/B чинит, Agent C ре-аудит
```

## Risk assessment

| Риск | Митигация |
|------|-----------|
| Retry создаёт дубли записей в Rubitime | `postSigned` ретраит только 5xx/network; Rubitime dedup по `branch+cooperator+datetime+phone` |
| Fallback matching по phone+slot матчит не ту запись | Ограничен `source='native'` + `rubitime_id IS NULL` + `status IN (creating, confirmed, failed_sync)` + `ORDER BY created_at DESC LIMIT 1` |
| Cleanup SQL портит данные | DRY RUN по умолчанию (ROLLBACK), с RETURNING для ручной проверки |
