# Stage 9: Перенос product appointments view в webapp — план для авто-агента

> **Режим:** только план. Реализацию выполняет младший агент в режиме авто по этому документу.
>
> **Источник:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), этап 9.

---

## Цель этапа 9

- Оставить `rubitime_records` / `rubitime_events` в integrator как raw provider storage.
- В webapp завести user-oriented appointment representation (таблицу и проекцию), не завязанную жёстко на RubiTime.
- Сделать projection из provider storage в product appointment model в webapp.
- Перевести doctor/patient reads на webapp-модель (через порты и при необходимости API для integrator).
- В integrator для запросов `booking.byExternalId` и `booking.activeByUser` добавить делегирование в webapp с fallback на текущее чтение из БД.

**Результат этапа:** patient/doctor product reads по appointments идут через webapp; provider-specific данные остаются в integrator; интегратор при наличии webapp может читать записи через webapp API с fallback на локальную БД.

---

## Meta-инструкция для агента

1. **Одна задача = один PR.** Следующий PR только после green CI предыдущего.
2. **Каждый шаг — атомарное изменение одного файла** (путь, что искать, на что заменить, верификация).
3. **Тесты — отдельный шаг после production-кода.** Не смешивать.
4. **В конце каждой задачи:** шаг верификации — `pnpm run ci` зелёный.
5. **Не редактировать документы-планы** (этот файл, DB_ZONES_RESTRUCTURE.md и др.) — read-only.
6. **Идентификаторы:** bigint-safe — в payload и API использовать строки для id (не `number`).

---

## Контекст кодовой базы

- **Integrator:** `rubitime_records` (rubitime_record_id, phone_normalized, record_at, status, payload_json, last_event, created_at, updated_at); `rubitime_events` — журнал событий. Запись: `writePort` `booking.upsert` → `upsertRecord` в `bookingRecords.ts`; `event.log` с eventStore=booking → `insertEvent`. Чтение: `readPort` `booking.byExternalId` → `getRecordByExternalId`, `booking.activeByUser` → `getActiveRecordsByPhone`.
- **Webapp:** `pgDoctorAppointments` читает из `rubitime_records` (только при `RUBITIME_IN_WEBAPP_DB=1`). `getUpcomingAppointments` — заглушка. Контракт: `BookingRecordForLinking`, `ActiveBookingRecord` в integrator; doctor UI ожидает список с id, clientUserId, time, status, link и т.д.
- **Projection:** как в Stage 7 — transactional outbox в integrator, событие `appointment.record.upserted`, webapp ingest в `handleIntegratorEvent`, запись в новую таблицу webapp.

---

## Затронутые файлы (сводка)

| Файл / зона | Задачи |
|-------------|--------|
| `apps/integrator/src/kernel/contracts/projectionEventTypes.ts` | T1 |
| `apps/webapp/migrations/` (новый файл) | T2 |
| `apps/webapp/src/infra/repos/pgAppointmentProjection.ts` (новый) | T3 |
| `apps/webapp/src/infra/repos/inMemoryAppointmentProjection.ts` (новый) | T3 |
| `apps/webapp/src/modules/integrator/events.ts` | T4 |
| `apps/webapp/src/app/api/integrator/events/route.ts` | T4 |
| `apps/integrator/src/infra/db/writePort.ts` | T5 |
| `apps/webapp/src/app/api/integrator/appointments/record/route.ts` (новый) | T6 |
| `apps/webapp/src/app/api/integrator/appointments/active-by-user/route.ts` (новый) | T6 |
| `apps/integrator/src/kernel/contracts/ports.ts` (AppointmentsReadsPort) | T7 |
| `apps/integrator/src/infra/adapters/appointmentsReadsPort.ts` (новый) | T7 |
| `apps/integrator/src/infra/db/readPort.ts` | T7 |
| `apps/integrator/src/app/di.ts` | T7 |
| `apps/webapp/src/infra/repos/pgDoctorAppointments.ts` | T8 |
| `apps/webapp/src/modules/appointments/service.ts` | T8 |
| `apps/webapp/src/app-layer/di/buildAppDeps.ts` | T8 |
| `apps/webapp/scripts/backfill-appointments-domain.mjs` (новый) | T9 |
| `apps/webapp/scripts/reconcile-appointments-domain.mjs` (новый) | T9 |
| Тесты (unit + e2e) | T10 |
| `scripts/stage9-release-gate.mjs` (новый) | T10 |

---

## Execution order

**T1** → **T2** → **T3** → **T4** → **T5** → **T6** → **T7** → **T8** → **T9** → **T10** (строго по порядку).

---

## T1 (P0): Контракт и словарь событий проекции appointments

**Цель:** зафиксировать тип проекционного события и форму payload для appointment record.

**Текущее состояние:** в `projectionEventTypes.ts` есть только типы для reminders и content access; для записей на приём отдельного типа нет.

**Решение:** добавить константу и тип для `appointment.record.upserted`; payload: `integratorRecordId`, `phoneNormalized`, `recordAt`, `status`, `payloadJson`, `lastEvent`, `updatedAt` (все строки/объект в стиле JSON, идентификаторы — строки).

### Шаг T1.1: Добавить тип события и экспорт

**Файл:** `apps/integrator/src/kernel/contracts/projectionEventTypes.ts`

**Найти:** конец файла (после `CONTENT_ACCESS_GRANTED` и типа `ReminderProjectionEventType`).

**Добавить после существующего типа:**

```ts
export const APPOINTMENT_RECORD_UPSERTED = 'appointment.record.upserted';

export type AppointmentProjectionEventType = typeof APPOINTMENT_RECORD_UPSERTED;
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** тип и константа экспортируются; типчек зелёный.

### Шаг T1.2: Экспорт из kernel/contracts/index

**Файл:** `apps/integrator/src/kernel/contracts/index.ts`

**Найти:** экспорт из `projectionEventTypes` (например `ReminderProjectionEventType`).

**Добавить:** экспорт `APPOINTMENT_RECORD_UPSERTED` и типа `AppointmentProjectionEventType` из `projectionEventTypes.js`.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** индекс экспортирует новые символы.

### Шаг T1.3: Верификация задачи T1

**Команда:** `pnpm run ci`

**DoD:** константа и тип события доступны; CI зелёный.

---

## T2 (P0): Миграция webapp — таблица product appointments

**Цель:** завести в webapp таблицу для user-oriented записей на приём (проекция из integrator).

**Решение:** одна миграция с таблицей `appointment_records`: ключ по `integrator_record_id` (unique), поля для отображения и связи с пользователем (phone_normalized, record_at, status, payload_json, last_event, created_at, updated_at; при необходимости platform_user_id для связи с platform_users).

### Шаг T2.1: Создать файл миграции

**Файл:** создать `apps/webapp/migrations/011_appointment_records.sql`

**Содержимое (образец):**

```sql
-- Stage 9: Product appointment records (projection from integrator rubitime_records).
-- Keyed by integrator_record_id for idempotency and reconciliation.

CREATE TABLE IF NOT EXISTS appointment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_record_id TEXT NOT NULL UNIQUE,
  phone_normalized TEXT NULL,
  record_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'updated', 'canceled')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_records_integrator_record_id
  ON appointment_records (integrator_record_id);
CREATE INDEX IF NOT EXISTS idx_appointment_records_phone_normalized
  ON appointment_records (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_records_record_at
  ON appointment_records (record_at) WHERE record_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_records_status
  ON appointment_records (status);
```

**Верификация:** файл на месте; при необходимости проверить порядок миграций в `run-migrations.mjs` (если миграции подключаются по списку).

**Критерий успеха:** миграция применяется без ошибок (можно проверить локально `node apps/webapp/scripts/run-migrations.mjs` при наличии DATABASE_URL).

### Шаг T2.2: Верификация задачи T2

**Команда:** `pnpm run ci`

**DoD:** миграция создана; CI зелёный.

---

## T3 (P0): Webapp — порт и репозиторий проекции appointments

**Цель:** порт для приёма проекции (upsert по событию) и чтения для API/doctor/patient; реализация PG и in-memory.

**Решение:** ввести `AppointmentProjectionPort` с методом `upsertRecordFromProjection(params)` и методами для чтения: `getRecordByIntegratorId(integratorRecordId)`, `listActiveByPhoneNormalized(phoneNormalized)`. Реализации: `pgAppointmentProjection.ts` (через getPool) и `inMemoryAppointmentProjection.ts`.

### Шаг T3.1: Тип порта и PG-реализация

**Файл:** создать `apps/webapp/src/infra/repos/pgAppointmentProjection.ts`

**Содержимое (кратко):**

- Тип `AppointmentProjectionPort` с методами:
  - `upsertRecordFromProjection(params: { integratorRecordId: string; phoneNormalized: string | null; recordAt: string | null; status: string; payloadJson: Record<string, unknown>; lastEvent: string; updatedAt: string }): Promise<void>`
  - `getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null>`
  - `listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]>`
- Тип `AppointmentRecordRow` с полями, соответствующими таблице (id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, created_at, updated_at).
- `createPgAppointmentProjectionPort(): AppointmentProjectionPort` — использование `getPool()`, INSERT ... ON CONFLICT для upsert, SELECT для get/list. Для list — фильтр по phone_normalized и status IN ('created','updated'), ORDER BY record_at.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** порт и PG-реализация есть; типчек проходит.

### Шаг T3.2: In-memory реализация

**Файл:** создать `apps/webapp/src/infra/repos/inMemoryAppointmentProjection.ts`

**Содержимое:** реализация того же `AppointmentProjectionPort` на in-memory структуре (Map по integrator_record_id; list — фильтр по phone_normalized и status). Формат строк/дат согласовать с PG (ISO строки).

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** in-memory порт реализован; типчек зелёный.

### Шаг T3.3: Тесты порта

**Файл:** создать (или дополнить) тесты, например `apps/webapp/src/infra/repos/pgAppointmentProjection.test.ts` и/или контракт-тесты для in-memory (upsert + get + list).

**Тесты:** (1) upsert затем get — возвращает те же данные; (2) upsert два с разным phone_normalized, list по одному phone — только один; (3) canceled не попадает в listActive.

**Верификация:** `pnpm --dir apps/webapp test -- appointment` (или по пути к новым тестам).

**Критерий успеха:** новые тесты зелёные.

### Шаг T3.4: Верификация задачи T3

**Команда:** `pnpm run ci`

**DoD:** порт и обе реализации работают; тесты и CI зелёные.

---

## T4 (P0): Webapp — приём события appointment.record.upserted

**Цель:** при POST от projection worker обрабатывать `appointment.record.upserted` и писать в проекционную таблицу через порт.

**Решение:** в `handleIntegratorEvent` добавить ветку для `appointment.record.upserted`; из payload извлечь поля (coerce строки/dates); вызвать `appointmentProjection.upsertRecordFromProjection`. В events route передать `appointmentProjection` в deps (из buildAppDeps).

### Шаг T4.1: Зависимость в buildAppDeps

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действие:** создать `appointmentProjectionPort` по аналогии с `reminderProjectionPort`: при `env.DATABASE_URL` — `createPgAppointmentProjectionPort()`, иначе in-memory. Добавить в возвращаемый объект `appointmentProjection: appointmentProjectionPort`.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** deps содержат `appointmentProjection`.

### Шаг T4.2: Обработчик в events.ts

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

**Действие:** (1) Расширить тип `IntegratorEventsDeps`: добавить поле `appointmentProjection?: AppointmentProjectionPort` (тип порта импортировать из pgAppointmentProjection или отдельного файла типов). (2) Добавить константу события, например `const APPOINTMENT_RECORD_UPSERTED = 'appointment.record.upserted'`. (3) В теле обработчика: если `deps.appointmentProjection` и `event.eventType === APPOINTMENT_RECORD_UPSERTED`, распарсить payload (integratorRecordId, phoneNormalized, recordAt, status, payloadJson, lastEvent, updatedAt); валидация обязательных полей (минимум integratorRecordId, status); вызвать `appointmentProjection.upsertRecordFromProjection(...)`; при успехе `return { accepted: true }`, при ошибке `return { accepted: false, reason: '...' }`.

**Верификация:** `pnpm --dir apps/webapp typecheck` и `pnpm --dir apps/webapp test -- events`.

**Критерий успеха:** типчек и тесты проходят.

### Шаг T4.3: Передача deps в events route

**Файл:** `apps/webapp/src/app/api/integrator/events/route.ts`

**Найти:** вызов `handleIntegratorEvent(eventBody, { diaries, users, preferences, supportCommunication, reminderProjection })`.

**Добавить в объект deps:** `appointmentProjection: deps.appointmentProjection`.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** событие appointment.record.upserted доходит до обработчика при наличии deps.

### Шаг T4.4: Тесты handleIntegratorEvent для appointment.record.upserted

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

**Тесты:** (1) принимает `appointment.record.upserted` с полным payload, ожидание `accepted: true`; (2) при отсутствии обязательных полей — `accepted: false` с причиной; (3) вызов `upsertRecordFromProjection` с ожидаемыми аргументами (мок порта + spy или in-memory + проверка состояния).

**Верификация:** `pnpm --dir apps/webapp test -- events.test`.

**Критерий успеха:** все новые и существующие тесты зелёные.

### Шаг T4.5: Верификация задачи T4

**Команда:** `pnpm run ci`

**DoD:** ingest реализован и покрыт тестами; CI зелёный.

---

## T5 (P0): Integrator — проекция в outbox при booking.upsert

**Цель:** при каждой записи/обновлении записи в rubitime_records ставить событие в projection outbox в той же транзакции.

**Решение:** в writePort обработчик `booking.upsert` обернуть в `db.tx`: внутри вызвать `upsertRecord`, затем `enqueueProjectionEvent` с типом `APPOINTMENT_RECORD_UPSERTED` и payload (integratorRecordId, phoneNormalized, recordAt, status, payloadJson, lastEvent, updatedAt). Idempotency key — детерминированный от типа и integratorRecordId + hash payload (как в projectionKeys для других событий).

### Шаг T5.1: Импорт и ключ идемпотентности

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Действие:** импортировать `APPOINTMENT_RECORD_UPSERTED` из kernel/contracts. Убедиться, что в `projectionKeys.js` есть (или добавить) функцию для ключа вида `appointment.record.upserted:{integratorRecordId}:{hash}`.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** импорт и ключ доступны.

### Шаг T5.2: Обернуть booking.upsert в tx и enqueue

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Найти:** блок `case 'booking.upsert': { ... await upsertRecord(db, {...}); return; }`.

**Заменить на:** выполнение в `db.tx(async (txDb) => { ... })`: сначала `upsertRecord(txDb, ...)` с теми же параметрами; затем формирование payload для проекции (все поля строки/объект); вызов `enqueueProjectionEvent(txDb, { eventType: APPOINTMENT_RECORD_UPSERTED, idempotencyKey: projectionIdempotencyKey('appointment.record.upserted', externalRecordId, hashPayload(payload)), occurredAt: new Date().toISOString(), payload })`. При отсутствии externalRecordId — не вызывать tx (оставить текущий early return с warn).

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm --dir apps/integrator test -- writePort`.

**Критерий успеха:** тесты writePort зелёные; при наличии теста на booking.upsert — проверка вызова enqueueProjectionEvent с нужным eventType.

### Шаг T5.3: Тесты writePort для booking.upsert + projection

**Файл:** `apps/integrator/src/infra/db/writePort*.ts` или отдельный тест (например для booking projection).

**Тест:** вызов writeDb с booking.upsert; проверка, что в одной транзакции вызываются upsertRecord и enqueueProjectionEvent с eventType `appointment.record.upserted` и payload, содержащим integratorRecordId, status и т.д.

**Верификация:** `pnpm --dir apps/integrator test -- writePort`.

**Критерий успеха:** тест добавлен и проходит.

### Шаг T5.4: Верификация задачи T5

**Команда:** `pnpm run ci`

**DoD:** booking.upsert пишет в outbox; тесты и CI зелёные.

---

## T6 (P0): Webapp API для чтения записей (integrator)

**Цель:** GET endpoints для integrator: запись по external id и список активных по phone_normalized (с проверкой подписи, как у reminders).

**Решение:** два маршрута под `apps/webapp/src/app/api/integrator/appointments/`: `record/route.ts` (query `integratorRecordId`) и `active-by-user/route.ts` (query `phoneNormalized`). Проверка заголовков `x-bersoncare-timestamp` и `x-bersoncare-signature` (verifyIntegratorGetSignature). Ответ: JSON с полями, соответствующими контракту integrator (getRecordByExternalId → один объект или null; getActiveRecordsByPhone → массив с rubitimeRecordId, recordAt, status, link).

### Шаг T6.1: GET record by integratorRecordId

**Файл:** создать `apps/webapp/src/app/api/integrator/appointments/record/route.ts`

**Логика:** проверка signature; обязательный query `integratorRecordId`; вызов `appointmentProjection.getRecordByIntegratorId(integratorRecordId)`; при отсутствии порта — 503; ответ `{ ok: true, record: {...} }` или `{ ok: true, record: null }`. Формат record: поля для linking (externalRecordId, phoneNormalized, recordAt, status, payloadJson и т.д. в виде, ожидаемом integrator).

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** маршрут создан; типчек проходит.

### Шаг T6.2: GET active-by-user по phoneNormalized

**Файл:** создать `apps/webapp/src/app/api/integrator/appointments/active-by-user/route.ts`

**Логика:** проверка signature; обязательный query `phoneNormalized`; вызов `appointmentProjection.listActiveByPhoneNormalized(phoneNormalized)`; при отсутствии порта — 503; ответ `{ ok: true, records: [...] }` с массивом элементов вида { rubitimeRecordId, recordAt, status, link } (как ActiveBookingRecord).

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** маршрут создан; типчек проходит.

### Шаг T6.3: Тесты маршрутов

**Файлы:** `apps/webapp/src/app/api/integrator/appointments/record/route.test.ts`, `apps/webapp/src/app/api/integrator/appointments/active-by-user/route.test.ts`

**Тесты:** без подписи — 400/401; без обязательного query — 400; при моке порта — 200 и ожидаемый JSON (record null/объект, records массив); при отсутствии порта — 503.

**Верификация:** `pnpm --dir apps/webapp test -- appointments`.

**Критерий успеха:** тесты API зелёные.

### Шаг T6.4: Верификация задачи T6

**Команда:** `pnpm run ci`

**DoD:** оба endpoint работают и покрыты тестами; CI зелёный.

---

## T7 (P0): Integrator — AppointmentsReadsPort и делегирование readPort

**Цель:** ввести порт чтения записей из webapp и делегировать ему `booking.byExternalId` и `booking.activeByUser` при наличии порта (fallback на текущее чтение из БД).

**Решение:** тип `AppointmentsReadsPort` с методами `getRecordByExternalId(externalRecordId)` и `getActiveRecordsByPhone(phoneNormalized)` (или listActiveByUser), возвращающие типы, совместимые с текущими возвратами readPort. Адаптер — HTTP GET к webapp с подписью. В readPort: для указанных типов запросов при наличии `appointmentsReadsPort` вызывать порт, иначе — текущую реализацию через bookingRecords.

### Шаг T7.1: Контракт AppointmentsReadsPort

**Файл:** `apps/integrator/src/kernel/contracts/ports.ts`

**Действие:** добавить тип `AppointmentsReadsPort` с методами, возвращающими `Promise<BookingRecordForLinking | null>` и `Promise<ActiveBookingRecord[]>` (типы из bookingRecords или продублировать в contracts). Экспортировать тип.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** тип порта определён и экспортируется.

### Шаг T7.2: Адаптер appointmentsReadsPort

**Файл:** создать `apps/integrator/src/infra/adapters/appointmentsReadsPort.ts`

**Действие:** по аналогии с remindersReadsPort — подпись GET (timestamp + canonical path+query), fetch к `APP_BASE_URL/api/integrator/appointments/record?integratorRecordId=...` и `.../active-by-user?phoneNormalized=...`. При ошибке/не ok — возвращать null или []. Маппинг ответа в BookingRecordForLinking и ActiveBookingRecord.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** адаптер создан; типчек проходит.

### Шаг T7.3: readPort — опциональный appointmentsReadsPort и делегирование

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Действие:** в `createDbReadPort` добавить опциональный параметр `appointmentsReadsPort?: AppointmentsReadsPort`. В case `booking.byExternalId`: при наличии порта вызывать `appointmentsReadsPort.getRecordByExternalId(recordId)` и возвращать результат; иначе — текущий вызов `getRecordByExternalId(db, recordId)`. В case `booking.activeByUser`: при наличии порта — вызов порта (list active by phone), иначе — текущий вызов `getActiveRecordsByPhone(db, userId)`.

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm --dir apps/integrator test -- readPort`.

**Критерий успеха:** тесты readPort проходят; при передаче порта вызывается он, без порта — БД.

### Шаг T7.4: DI — создание и передача порта

**Файл:** `apps/integrator/src/app/di.ts`

**Действие:** по аналогии с remindersReadsPort создавать `appointmentsReadsPort` при наличии `env.APP_BASE_URL` и webhook secret (и при необходимости флага); передавать его в `createDbReadPort({ ..., appointmentsReadsPort })`.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** в проде при настроенном webapp порт передаётся в readPort.

### Шаг T7.5: Тесты readPort и адаптера

**Файлы:** `apps/integrator/src/infra/db/readPort.test.ts`, `apps/integrator/src/infra/adapters/appointmentsReadsPort.test.ts`

**Тесты readPort:** (1) при переданном appointmentsReadsPort запрос booking.byExternalId вызывает порт и не вызывает db.query для booking; (2) при переданном порте booking.activeByUser вызывает порт; (3) при отсутствии порта оба запроса идут в БД (как сейчас). Тесты адаптера: мок fetch, проверка URL и заголовков подписи, маппинг ответа.

**Верификация:** `pnpm --dir apps/integrator test -- readPort appointmentsReadsPort`.

**Критерий успеха:** все тесты зелёные.

### Шаг T7.6: Верификация задачи T7

**Команда:** `pnpm run ci`

**DoD:** делегирование и fallback работают; тесты и CI зелёные.

---

## T8 (P1): Webapp — перевод doctor/patient reads на проекционную таблицу

**Цель:** pgDoctorAppointments и getUpcomingAppointments читают из appointment_records (webapp), а не из rubitime_records.

**Решение:** pgDoctorAppointments переписать запросы с `rubitime_records` на `appointment_records` (те же поля по смыслу: integrator_record_id как id, phone_normalized, record_at, status, payload_json, record_at для времени). Для getUpcomingAppointments — получать данные из порта проекции по userId (нужна связь userId → phone или platform_user_id; при наличии platform_users.phone_normalized по userId можно брать listActiveByPhoneNormalized). buildAppDeps: всегда использовать PG doctor appointments при DATABASE_URL (убрать зависимость от RUBITIME_IN_WEBAPP_DB для выбора порта, если вся логика переехала в webapp).

### Шаг T8.1: pgDoctorAppointments — чтение из appointment_records

**Файл:** `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`

**Действие:** заменить таблицу в SQL с `rubitime_records` на `appointment_records`; заменить имя колонки `rubitime_record_id` на `integrator_record_id` в SELECT и в маппинге id; оставить JOIN с platform_users по phone_normalized. Адаптировать имена колонок под новую таблицу (record_at, payload_json, status и т.д. уже есть в 011).

**Верификация:** `pnpm --dir apps/webapp typecheck` и `pnpm --dir apps/webapp test -- doctor-appointments pgDoctorAppointments`.

**Критерий успеха:** типчек и тесты проходят.

### Шаг T8.2: getUpcomingAppointments из порта

**Файл:** `apps/webapp/src/modules/appointments/service.ts`

**Действие:** заменить заглушку на вызов порта. Для этого в buildAppDeps передать в patientCabinet (и куда ещё нужен getUpcomingAppointments) функцию, которая по userId получает phone (например через userByPhonePort или platform_users) и вызывает appointmentProjection.listActiveByPhoneNormalized(phone), затем маппит в AppointmentSummary (id, label, link). Либо ввести getUpcomingAppointmentsForUser(userId) в порте/сервисе, использующем appointment projection и user resolution.

**Верификация:** `pnpm --dir apps/webapp typecheck` и тесты appointments/patient-cabinet.

**Критерий успеха:** getUpcomingAppointments возвращает данные из проекции; тесты зелёные.

### Шаг T8.3: buildAppDeps — использование PG doctor appointments

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действие:** условие для `doctorAppointmentsPort`: при `env.DATABASE_URL` использовать `createPgDoctorAppointmentsPort()` без проверки `RUBITIME_IN_WEBAPP_DB` (так как источник данных теперь appointment_records в webapp). Комментарий обновить.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** doctor UI при DATABASE_URL читает из webapp БД (appointment_records).

### Шаг T8.4: Верификация задачи T8

**Команда:** `pnpm run ci`

**DoD:** doctor и patient читают записи из webapp; CI зелёный.

---

## T9 (P1): Backfill и reconciliation

**Цель:** скрипт переноса существующих rubitime_records в webapp appointment_records и скрипт сравнения для проверки консистентности.

**Решение:** backfill: подключение к INTEGRATOR_DATABASE_URL и DATABASE_URL, SELECT из rubitime_records, INSERT в appointment_records ON CONFLICT DO UPDATE по integrator_record_id. Reconcile: сравнение количества и при необходимости списка id между rubitime_records и appointment_records (по integrator_record_id / rubitime_record_id).

### Шаг T9.1: Backfill script

**Файл:** создать `apps/webapp/scripts/backfill-appointments-domain.mjs`

**Логика:** чтение из integrator `rubitime_records` (rubitime_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at); запись в webapp `appointment_records` (integrator_record_id, ...). Режимы --dry-run и --commit; опционально --limit=N. Использовать pg.Client для обоих БД.

**Верификация:** запуск с --dry-run не падает; при наличии двух БД и --commit строки появляются в webapp (проверка вручную или тест с тестовой БД).

**Критерий успеха:** скрипт корректен; не ломает CI (если вызывается только вручную).

### Шаг T9.2: Reconcile script

**Файл:** создать `apps/webapp/scripts/reconcile-appointments-domain.mjs`

**Логика:** подсчёт строк в rubitime_records (integrator) и в appointment_records (webapp); сравнение множеств id; вывод отчёта; при превышении порога mismatch (например --max-mismatch-percent=N) exit(1). Переменные DATABASE_URL и INTEGRATOR_DATABASE_URL.

**Верификация:** запуск с пустыми/совпадающими данными — exit 0; при расхождении выше порога — exit 1.

**Критерий успеха:** скрипты готовы к запуску в среде с двумя БД.

### Шаг T9.3: Верификация задачи T9

**Команда:** `pnpm run ci`

**DoD:** скрипты созданы; CI зелёный.

---

## T10 (P1): Тесты (unit + e2e) и gate

**Цель:** полное покрытие новых и изменённых путей unit-тестами; минимум один e2e сценарий проекции + чтения; release gate для этапа 9.

**Решение:** убедиться, что все новые модули (порты, ingest, writePort, readPort, API routes) покрыты; добавить e2e: создание записи в integrator (writePort или через webhook rubitime), доставка проекции в webapp (реальный worker или симуляция POST события), чтение через webapp API или через integrator readPort с портом. Gate: projection-health + reconcile-appointments-domain (если окружение с БД).

### Шаг T10.1: Сводка unit-тестов

**Проверить наличие/добавить тесты:**

- Webapp: pgAppointmentProjection / inMemory (T3), events.test.ts appointment.record.upserted (T4), API appointments/record и active-by-user (T6).
- Integrator: writePort booking.upsert + enqueue (T5), readPort booking + appointmentsReadsPort (T7), appointmentsReadsPort adapter (T7).

**Верификация:** `pnpm run ci` включает все перечисленные тесты.

**Критерий успеха:** все релевантные unit-тесты есть и зелёные.

### Шаг T10.2: E2E сценарий

**Файл:** добавить сценарий в существующие e2e (integrator или webapp), например: создание записи через writePort (booking.upsert); симуляция доставки события в webapp (POST /api/integrator/events с appointment.record.upserted); запрос GET /api/integrator/appointments/record?integratorRecordId=... с подписью — ожидание 200 и record не null. Либо: integrator e2e с переданным appointmentsReadsPort (мок webapp), проверка что readPort возвращает данные после "проекции" (мок отвечает).

**Верификация:** `pnpm test:e2e` или соответствующий скрипт e2e для выбранного сценария.

**Критерий успеха:** хотя бы один e2e покрывает путь проекции или чтения через webapp.

### Шаг T10.3: Release gate stage9

**Файл:** создать `scripts/stage9-release-gate.mjs`

**Логика:** по аналогии со stage7-gate: запуск projection-health (integrator), при наличии DATABASE_URL и INTEGRATOR_DATABASE_URL — запуск reconcile-appointments-domain. Exit 0 только если все проверки прошли.

**Верификация:** без БД gate может падать на reconcile (допустимо); при наличии БД после backfill — gate зелёный.

**Критерий успеха:** gate создан; добавлен в package.json scripts при необходимости (например `stage9-gate`).

### Шаг T10.4: Финальная верификация этапа 9

**Команда:** `pnpm run ci`

**DoD этапа 9:**

- Контракт и событие проекции введены (T1).
- Таблица appointment_records в webapp (T2).
- Порт и репозитории проекции (T3), ingest в webapp (T4), проекция из writePort (T5).
- API для integrator (T6), AppointmentsReadsPort и делегирование в readPort (T7).
- Doctor/patient читают из webapp (T8); backfill и reconcile (T9).
- Unit- и e2e-тесты и gate (T10); CI зелёный.

---

## Ссылки на guardrails (DB_ZONES_RESTRUCTURE.md)

- Projection delivery durable: outbox в той же транзакции с domain write (T5).
- Idempotency key детерминированный от бизнес-события (T5).
- User identity bigint-safe: в payload и API — строки (T1, T4, T6).
- Handlers в webapp устойчивы к out-of-order (идемпотентный upsert по integrator_record_id) (T3, T4).
- Reconciliation — часть cutover (T9, T10).

---

## НЕ ДЕЛАТЬ

- Не удалять и не менять схему таблиц `rubitime_records` и `rubitime_events` в integrator.
- Не удалять запись в rubitime_events (event.log с eventStore=booking) и не менять её логику в рамках этапа 9.
- Не менять контракт существующих API webapp для doctor/patient (формат ответов страниц) без отдельной задачи.
- Не редактировать документы-планы и roadmap.
- Не делать appointmentsReadsPort обязательным при старте integrator (оставить опциональным с fallback на БД до Stage 10).
