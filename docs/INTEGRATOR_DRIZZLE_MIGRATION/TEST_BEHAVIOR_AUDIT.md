# Аудит: тесты и целостность данных по закрытым фазам Drizzle (P1–P4)

**Дата:** 2026-05-15 (**актуализация:** закрытие пробелов §3 того же дня — новые unit-тесты репозиториев)  
**Основание:** [`LOG.md`](./LOG.md) (этапы 1–4 и постаудиты).  
**Команда проверки:** из корня монорепозитория

```bash
pnpm --dir apps/integrator run test
```

**Результат прогона (после добавления unit-тестов §3):** `pnpm --dir apps/integrator run test` — зелёный; масштаб см. последнюю запись в [`LOG.md`](./LOG.md) (аудит тестов / hardening).

---

## 1. Вывод по «рабочести» и потере данных

| Критерий                                                      | Оценка                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Регрессии в покрытом unit/интеграционном слое интегратора** | Не выявлены: полный пакет тестов `apps/integrator` зелёный после прогона выше.                                                                                                                                                                                                                                     |
| **Доказательство отсутствия потери строк в проде**            | **Не выводится** из этого прогона: почти все сценарии P1–P4 опираются на **моки** `DbPort.query`, `getIntegratorDrizzleSession().execute`, цепочки Drizzle-builder и nock — это проверка **контрактов вызовов, ветвлений и фрагментов SQL**, а не побайтовое сравнение с живым PostgreSQL для каждого merge/claim. |
| **Критичные пути (merge, claim-очереди)**                     | Есть **целенаправленные** assert’ы на текст/структуру SQL (`FOR UPDATE SKIP LOCKED`, `ORDER BY`/`LIMIT`, отмена jobs) — см. матрицу ниже; это снижает риск **случайной** порчи запроса при рефакторе, но не заменяет staging-тест или контрактный тест против реальной БД.                                         |

**Итог:** для инициативы **закрытых** этапов P1–P4 текущий тестовый набор интегратора **согласован с кодом и не падает**; утверждение «данные в БД никогда не теряются» требует отдельного уровня (e2e/staging, снимки схемы, replay миграций) — **вне объёма этого файла**.

---

## 2. Матрица: что из LOG закрыто тестами

Легенда: **Прямой** — тест названия файла репозитория; **Косвенный** — сценарий через write/read port, fanout, маршрут или соседний модуль.

### Этап 1 (P1)

| Область LOG                                             | Тесты (файлы)                                                                                                                    | Что фактически проверяется                                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/subscriptions.ts`                                | `repos/subscriptions.test.ts`, `writePort.subscriptionMailing.test.ts`                                                           | Операции подписок/рассылок через порт и моки БД.                                                                                                                                                   |
| `topics` / `mailing` reads                              | `readPort.test.ts` (`mailing.topics.list`), `subscriptionMailingReadsPort.test.ts`                                               | Делегирование в webapp API и формирование URL; не полный SQL-трейс таблицы `mailing_topics` в интеграторе.                                                                                         |
| `bookingCalendarMap` + `public.patient_bookings`        | `repos/bookingCalendarMap.test.ts`, `writePort.appointments.test.ts`                                                             | Drizzle insert/onConflict/delete; **`runIntegratorSql`**: развёртка SQL содержит `public.patient_bookings`, `gcal_event_id`, для delete — `NULL`.                                                  |
| `mailingLogs` / `messageLogs` (`delivery_attempt_logs`) | `repos/mailingLogs.test.ts`, `repos/messageLogs.test.ts`; косвенно `writePort.communication.test.ts`, `projectionFanout.test.ts` | `insertMailingLog`: values + `onConflictDoUpdate.set`; `insertDeliveryAttemptLog` / `appendMessageLog`: отсев невалидных полей, insert при валидных данных, ошибка insert → catch + log без throw. |

### Этап 2 (P2) + постаудит cancel

| Область LOG                       | Тесты                                                                                | Поведение / данные                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `projectionOutbox.ts` (claim CTE) | `repos/projectionOutbox.test.ts`, `jobQueuePort.test.ts`, `projectionFanout.test.ts` | Assert на наличие **`FOR UPDATE SKIP LOCKED`** в `execute`; enqueue/onConflict; fanout после TX на root `db` со стабом. |
| `jobQueue.ts`                     | `repos/jobQueue.test.ts`, `jobQueuePort.test.ts`                                     | Claim-паттерн; **`cancelPendingBookingReminderJobsByBookingId`** (постаудит) — отдельный файл `jobQueue.test.ts`.       |
| `recordM2mRoute` + cancel         | `integrations/rubitime/recordM2mRoute.test.ts`                                       | Мок репозитория очереди с экспортом cancel; связь маршрута с отменой pending jobs.                                      |

### Этап 3 (P3)

| Область LOG                            | Тесты                                                                                                                    | Замечание                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repos/reminders.ts`                   | `writePort.reminders.test.ts`, `repos/reminders.staleMessenger.test.ts`, **`repos/reminders.projectionContext.test.ts`** | Сложный SQL — `queryChunks` / assert по тексту в stale-тестах; **`getReminderOccurrenceContextForProjection`** покрыт **отдельным** файлом (мок только `getIntegratorDrizzleSession`, без мока самой функции): `null`, `occurredAt` из `sent_at` / `failed_at`. В **`writePort.reminders.test.ts`** функция по-прежнему замокана — стабилен fanout на projection outbox. |
| `repos/bookingRecords.ts`              | `repos/bookingRecords.sql.test.ts`                                                                                       | `upsertRecord`: Drizzle `insert` + `onConflictDoUpdate`, проверка передачи ISO `recordAt` в values.                                                                                                                                                                                                                                                                      |
| `repos/publicAppointmentRecordSync.ts` | `writePort.appointments.test.ts` (`booking.upsert`)                                                                      | Drizzle insert в `appointment_records`; в TX ожидается SQL с **`public.patient_bookings`**; проверки `recordAt` ISO-Z и канонизации `payloadJson` (без «наивного» local time в SQL).                                                                                                                                                                                     |
| `bookingRecords` / appointment sync    | `writePort.appointments.test.ts`, `timezoneContract.stage8.test.ts` (захват `appointmentRecords`)                        | Upsert `appointment_records`, поля времени.                                                                                                                                                                                                                                                                                                                              |
| `readPort` + доменные чтения           | `readPort.test.ts`                                                                                                       | Fallback’и и моки `integratorDrizzle.execute` для путей после P4.                                                                                                                                                                                                                                                                                                        |

### Этап 4 (P4)

| Область LOG               | Тесты                                                         | Поведение / данные                                                                                                  |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `messageThreads.ts`       | `repos/messageThreads.test.ts`                                | Зафиксированы **`ORDER BY` / `LIMIT`** для открытого диалога и `listOpenConversations` (постаудит P4 в LOG).        |
| `channelUsers.ts`         | `repos/channelUsers.test.ts`                                  | Моки `runIntegratorSql` / execute для upsert/lookup.                                                                |
| `mergeIntegratorUsers.ts` | `repos/mergeIntegratorUsers.test.ts`                          | Последовательность SQL в merge-транзакции; политика outbox (`projectionOutboxMergePolicy.test.ts` рядом по смыслу). |
| `user.upsert` / state     | `writePort.userUpsert.test.ts`, `requestContactRoute.test.ts` | `attachExecuteToQuery`, TX с `integratorDrizzle` для маршрута контакта.                                             |

### Выравнивание после аудита (LOG)

| Область                             | Тесты                                                                 | Примечание                                           |
| ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `bookingCalendarMap` без `db.query` | `repos/bookingCalendarMap.test.ts` + `writePort.appointments.test.ts` | Прямой unit на `runIntegratorSql` + Drizzle цепочки. |

### Outgoing delivery worker (рассылки врача)

| Область                                              | Тесты                                                                 | Примечание                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `outgoingDeliveryWorker` / `doctor_broadcast_intent` | `outgoingDeliveryWorker.test.ts`, `doctorBroadcastIntentMenu.test.ts` | Успех/ошибки очереди, spy на `enrichDoctorBroadcastIntentIfNeeded` при `attachMenu`; без живой БД очереди. |

---

## 3. Пробелы и рекомендации

1. ~~**Нет изолированных тестов** на `mailingLogs`/`messageLogs`~~ — **закрыто:** `mailingLogs.test.ts`, `messageLogs.test.ts` (валидные/невалидные ветки, `delivery.attempt.log`, ошибка insert).
2. **Merge и claim** — покрытие на уровне строки SQL и порядка вызовов; для гарантии «нет потери строк при конкуренции» в проде по-прежнему полезен **интеграционный** тест на тестовой БД (два клиента, `SKIP LOCKED`) — вне текущего объёма.
3. ~~**Reminders + projection context**~~ — **частично закрыто:** `reminders.projectionContext.test.ts` проверяет реальную **`getReminderOccurrenceContextForProjection`** (Drizzle select+join) с моком сессии; мок в `writePort.reminders.test.ts` для fanout **сохранён намеренно**.

---

## 4. Связанные документы

- Журнал инициативы: [`LOG.md`](./LOG.md)
- Инвентаризация сырого SQL / Wave 2: [`RAW_SQL_INVENTORY.md`](./RAW_SQL_INVENTORY.md), [`DRIZZLE_TRANSITION_PLAN.md`](./DRIZZLE_TRANSITION_PLAN.md)
