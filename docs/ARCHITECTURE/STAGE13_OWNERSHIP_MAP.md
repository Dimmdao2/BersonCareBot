# Stage 13 ownership map (integrator vs webapp)

После Stage 13 зафиксировано, какие данные и пути остаются в integrator, а какие окончательно принадлежат webapp. Не менять roadmap-планы; только явная фиксация статусов.

## Легенда статусов

| Статус | Описание |
|--------|----------|
| **keep raw** | Ingress/raw данные; integrator остаётся источником; не трогать. |
| **keep runtime** | Runtime/scheduling/operational; нужен для работы движков; не трогать. |
| **shadow only** | Копия/кэш для операционных нужд; product owner — webapp. |
| **frozen legacy** | Запись запрещена (DB trigger); чтение разрешено для reconcile/audit. |
| **cleanup pending** | Legacy product path убран из кода; таблицы/репо могут оставаться для rollback до Stage 14. |

## По доменам

### person

| Table / path | Статус | Примечание |
|--------------|--------|------------|
| users, identities, contacts, telegram_state | **shadow only** | Product owner — webapp (platform_users, user_channel_bindings, user_notification_topics). Reconcile + backfill person-domain. |
| repos/userLookup.ts | **keep runtime** | Runtime lookup по telegram/phone. |
| repos/channelUsers.ts | **shadow only** | Keep. |

### communication

| Table / path | Статус | Примечание |
|--------------|--------|------------|
| message_threads, support_* | **keep runtime** | Ingest и runtime; product read — webapp. |
| readPort conversation.* | **cleanup pending** | Legacy product read убран (T3); webapp path используется. |

### reminders

| Table / path | Статус | Примечание |
|--------------|--------|------------|
| reminder_* tables, repos/reminders.ts | **keep runtime** | Scheduling и runtime; product rules read — webapp. |
| readPort reminders.rules.forUser | **cleanup pending** | Legacy product read убран; webapp path используется. |

### appointments

| Table / path | Статус | Примечание |
|--------------|--------|------------|
| booking_records / rubitime_* | **keep raw** | Ingress и raw; product owner — webapp. |
| readPort booking.* | **cleanup pending** | Legacy product read убран; webapp path используется. |

**bookings.forUser:** идентификатор, передаваемый в webapp API активных записей — `phone_normalized` (источник: context.phoneNormalized / queries.bookingRecord.record.phoneNormalized в контенте; GET /api/integrator/appointments/active-by-user?phoneNormalized=…).

### subscription_mailing

| Table / path | Статус | Примечание |
|--------------|--------|------------|
| mailing_topics | **frozen legacy** | INSERT/UPDATE/DELETE запрещены триггером; SELECT для reconcile. |
| user_subscriptions | **frozen legacy** | То же. |
| repos/topics.ts, repos/subscriptions.ts | **freeze** | WritePort больше не пишет; репо могут использоваться для read/reconcile. |
| mailing_logs | **shadow only** | Keep. |

### Channel analytics и SMS delivery accounting

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| webapp.message_log | **webapp** | Аудит сообщений врача (doctor-facing); уже в webapp. |
| integrator.delivery_attempt_logs | **integrator** | Transport/delivery попытки; проекция в webapp не реализована на этапах 1–13. |
| Агрегаты «доставлено/не доставлено», SMS-учёт по каналам | **Отложено** | После этапа 13: отчётность может опираться на message_log и при необходимости на отдельную проекцию delivery_attempt_logs (запланировать в Stage 14 или отдельной задачей). |

Итог: единый слой «channel analytics» в webapp на момент Stage 13 — message_log; интеграция delivery_attempt_logs и SMS-учёта — в плане Stage 14 или отдельного бэклога.

## Projection

- **projection_outbox** (integrator): операционная очередь доставки событий в webapp; не удалять; мониторинг через projection health (T6) и stage13-gate.

## Go/no-go

- **stage13-gate**: `pnpm run stage13-gate` — preflight (stage12-gate + все reconcile) + projection health; при `STAGE13_E2E=1` — e2e stage13.
- Ownership map обновляется при изменении матрицы в `legacyCleanupMatrix.ts` или при переходе к Stage 14.
