# Stage 2 Remediation: Atomic Tasks for Auto-Agent

> **Этот документ** — декомпозиция `STAGE2_REMEDIATION_PLAN.md` в последовательные маленькие задачи,
> каждая из которых может быть выполнена авто-агентом (Cursor agent mode) без ручного вмешательства.

---

## Meta-инструкция для планирующих агентов

> **Кому:** GPT-5/4/Claude или любой LLM, создающий implementation plan для авто-агента.
>
> При создании плана реализации следуй этим правилам:
>
> 1. **Одна задача = один PR.** Не объединять несвязанные изменения. Следующий PR только после green CI предыдущего.
> 2. **Каждый шаг внутри задачи — атомарное изменение одного файла.** Описывай: (a) полный путь к файлу, (b) что искать (`search pattern`), (c) на что заменить, (d) что ожидать после замены.
> 3. **Никакого "разберись сам".** Если шаг зависит от знания кодовой базы — включи это знание в описание шага прямо в текст.
> 4. **Порядок шагов строго последователен.** Шаг N+1 зависит от шага N. Не менять порядок.
> 5. **Тесты — отдельный шаг.** Не смешивать написание тестов с изменением production-кода.
> 6. **Верификация в конце каждой задачи.** Финальный шаг: `pnpm run ci` должен быть зелёным.
> 7. **Не редактировать файлы документации.** Документы-планы (этот файл, `DB_ZONES_RESTRUCTURE.md`, `STAGE2_REMEDIATION_PLAN.md`) — read-only для авто-агента.
> 8. **Безопасность:** не удалять существующие функции, не переименовывать экспорты без обновления всех импортов, не менять API-контракт без обновления обеих сторон в одном PR.
> 9. **Тип-безопасность:** после каждого изменения типов проверять `pnpm typecheck` для затронутого приложения.
> 10. **Не трогать несвязанный код.** Если в файле есть другие мутации/обработчики — не менять их.

---

## Контекст кодовой базы (read-only справка для агента)

### Ключевые факты

- **Монорепо**: `apps/integrator` (Fastify) и `apps/webapp` (Next.js), общий PostgreSQL.
- **DbPort** (`apps/integrator/src/kernel/contracts/ports.ts`):
  ```
  type DbPort = {
    query<T>(sql, params?): Promise<DbQueryResult<T>>;
    tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T>;   // ← транзакции!
  };
  ```
  Метод `db.tx(fn)` оборачивает `fn` в `BEGIN`/`COMMIT` на одном клиенте, с `ROLLBACK` при ошибке. **Использовать для transactional outbox.**
- **Existing job queue**: таблица `rubitime_create_retry_jobs` с `kind`, `payload_json`, `status` (pending/processing/done/dead), `max_attempts`, worker в `apps/integrator/src/infra/runtime/worker/main.ts`. Не переиспользуем для projection — у projection другой lifecycle и executor.
- **Webapp idempotency cache** (`apps/webapp/src/infra/idempotency/pgStore.ts`): кэширует **и успешные, и неуспешные** ответы. При retry с тем же `requestHash` кэш перезаписывается (условие `WHERE ... request_hash = EXCLUDED.request_hash`). Это значит: когда T1+T4 починят доставку и out-of-order, повторная отправка с тем же body автоматически перезапишет ранее закэшированный 503 на 202. **Отдельно чинить кэш не надо.**
- **`webappEventsClient.ts`** строка 72: если `event.idempotencyKey` не задан, генерируется fallback `evt-${Date.now()}-${random}`. После T1 (outbox) все события должны иметь ключ из writePort, и fallback не будет использоваться. Но для безопасности fallback тоже нужно сделать детерминированным в T2.

### Файлы, которые будут затронуты

| Файл | Задачи |
|---|---|
| `apps/integrator/src/infra/db/writePort.ts` | T1, T2, T3 |
| `apps/integrator/src/infra/db/repos/projectionOutbox.ts` | T1 (новый) |
| `apps/integrator/src/infra/runtime/worker/projectionWorker.ts` | T1 (новый) |
| `apps/integrator/src/infra/runtime/worker/main.ts` | T1 |
| `apps/integrator/src/infra/adapters/webappEventsClient.ts` | T2 |
| `apps/integrator/src/app/di.ts` | T1 |
| `apps/integrator/src/kernel/contracts/ports.ts` | T3 |
| `apps/webapp/src/modules/integrator/events.ts` | T3, T4 |
| `apps/webapp/src/infra/repos/pgUserProjection.ts` | T3, T4 |
| Миграция integrator | T1 (новый SQL) |
| Тесты integrator/webapp | T1–T4 |

---

## Общий execution order

1. **T1** → T2 → T3 → T4 (P0 блок, строго последовательно).
2. **T5** → T6 (P1 блок, после стабилизации P0).
3. После T6: readiness review перед read-switch person-domain.

---

## T1 (P0): Durable projection outbox in integrator

**Цель:** исключить потерю projection-событий при сетевых/временных сбоях webapp.

**Текущее состояние (что сломано):**
- `writePort.ts` строка ~141: `user.upserted` — emit через `.catch()`, fire-and-forget. При ошибке сети событие теряется.
- `writePort.ts` строка ~171: `contact.linked` — **detached async IIFE** `(async () => { ... })()`, ещё хуже `.catch()`: ошибка не отслеживается вообще, unhandled rejection при крэше.
- `writePort.ts` строка ~336: `notifications.update` — тоже detached async IIFE.
- Ни одна из этих записей не находится в одной транзакции с domain write.

**Решение: transactional outbox pattern.**
Вместо прямой отправки в webapp, записываем projection-событие в таблицу `projection_outbox` **в той же транзакции** что и domain write (используя `db.tx`). Отдельный worker вычитывает и доставляет.

### Шаг T1.1: Миграция — создать таблицу `projection_outbox`

**Файл:** создать `apps/integrator/src/integrations/rubitime/db/migrations/YYYYMMDD_XXXX_add_projection_outbox.sql` (подставить текущую дату в имя, сохранить порядок сортировки с другими файлами в папке).

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS projection_outbox (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT        NOT NULL,
  idempotency_key TEXT      NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'pending',
  attempts_done INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 5,
  next_try_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projection_outbox_due
  ON projection_outbox (status, next_try_at)
  WHERE status = 'pending';
```

**Верификация:** после создания файла убедиться, что `ls apps/integrator/src/integrations/rubitime/db/migrations/` показывает файл отсортированным после последнего существующего.

### Шаг T1.2: Создать outbox-репозиторий

**Файл:** создать `apps/integrator/src/infra/db/repos/projectionOutbox.ts`

**Экспортируемые функции:**

```typescript
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';

export type ProjectionOutboxRow = {
  id: number;
  eventType: string;
  idempotencyKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  attemptsDone: number;
  maxAttempts: number;
};

export async function enqueueProjectionEvent(
  db: DbPort,
  input: {
    eventType: string;
    idempotencyKey: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO projection_outbox (event_type, idempotency_key, occurred_at, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.eventType, input.idempotencyKey, input.occurredAt, JSON.stringify(input.payload)],
  );
}

export async function claimDueProjectionEvents(
  db: DbPort,
  limit: number,
): Promise<ProjectionOutboxRow[]> {
  const res = await db.query<ProjectionOutboxRow>(
    `WITH due AS (
       SELECT id FROM projection_outbox
       WHERE status = 'pending' AND next_try_at <= now()
       ORDER BY next_try_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE projection_outbox o
     SET status = 'processing', updated_at = now()
     FROM due WHERE o.id = due.id
     RETURNING
       o.id,
       o.event_type AS "eventType",
       o.idempotency_key AS "idempotencyKey",
       o.occurred_at::text AS "occurredAt",
       o.payload,
       o.attempts_done AS "attemptsDone",
       o.max_attempts AS "maxAttempts"`,
    [Math.max(1, Math.trunc(limit))],
  );
  return res.rows;
}

export async function completeProjectionEvent(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE projection_outbox SET status = 'done', updated_at = now() WHERE id = $1`,
    [id],
  );
}

export async function failProjectionEvent(db: DbPort, id: number, lastError: string): Promise<void> {
  await db.query(
    `UPDATE projection_outbox SET status = 'dead', last_error = $2, updated_at = now() WHERE id = $1`,
    [id, lastError],
  );
}

export async function rescheduleProjectionEvent(
  db: DbPort,
  id: number,
  attemptsDone: number,
  retryDelaySeconds: number,
): Promise<void> {
  await db.query(
    `UPDATE projection_outbox
     SET status = 'pending',
         attempts_done = $2,
         next_try_at = now() + (($3::text || ' seconds')::interval),
         updated_at = now()
     WHERE id = $1`,
    [id, Math.max(0, attemptsDone), Math.max(1, retryDelaySeconds)],
  );
}
```

**Контракт:** функция `enqueueProjectionEvent` принимает `db: DbPort`. Когда вызывается внутри `db.tx(fn)`, запись гарантированно в той же транзакции. Когда вызывается вне `tx` — отдельная запись (допустимо, если domain write уже завершился).

### Шаг T1.3: Рефакторинг `writePort.ts` — `user.upsert` мутация

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Что найти:** блок `case 'user.upsert':` (примерно строка 120–153).

**Что изменить:**
1. Добавить импорт в начале файла: `import { enqueueProjectionEvent } from './repos/projectionOutbox.js';`
2. Заменить прямой `webappEventsPort.emit(...)` на транзакционную запись в outbox.

**Было (строки ~133–152):**
```typescript
await upsertUser(db, {
  id: Math.trunc(parsedId),
  ...(username ? { username } : {}),
  ...(firstName ? { first_name: firstName } : {}),
  ...(lastName ? { last_name: lastName } : {}),
});
if (webappEventsPort) {
  const idKey = `user.upserted:${Math.trunc(parsedId)}:${Date.now()}`;
  webappEventsPort.emit({
    eventType: 'user.upserted',
    idempotencyKey: idKey,
    occurredAt: new Date().toISOString(),
    payload: {
      integratorUserId: Math.trunc(parsedId),
      channelCode: resource,
      externalId,
      displayName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    },
  }).catch(err => logger.warn({ err, eventType: 'user.upserted' }, 'projection emit failed'));
}
```

**Стало:**
```typescript
const userPayload = {
  id: Math.trunc(parsedId),
  ...(username ? { username } : {}),
  ...(firstName ? { first_name: firstName } : {}),
  ...(lastName ? { last_name: lastName } : {}),
};
const projectionPayload = {
  integratorUserId: Math.trunc(parsedId),
  channelCode: resource,
  externalId,
  displayName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
};
await db.tx(async (txDb) => {
  await upsertUser(txDb, userPayload);
  await enqueueProjectionEvent(txDb, {
    eventType: 'user.upserted',
    idempotencyKey: `user.upserted:${Math.trunc(parsedId)}:${Date.now()}`,
    occurredAt: new Date().toISOString(),
    payload: projectionPayload,
  });
});
```

**НЕ ДЕЛАТЬ:** не удалять `webappEventsPort` из сигнатуры `createDbWritePort` — он будет использоваться projection worker'ом. Не менять другие case-блоки.

### Шаг T1.4: Рефакторинг `writePort.ts` — `user.phone.link` мутация

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Что найти:** блок `case 'user.phone.link':` (примерно строка 163–191).

**Текущая проблема:** detached async IIFE `(async () => { ... })()` — результат не awaited, ошибки не обработаны, нет гарантии доставки. Дополнительно: для получения `integratorUserId` делается отдельный read через `readPort.readDb({ type: 'user.byIdentity', ... })`.

**Стало:**
```typescript
case 'user.phone.link': {
  const resource = readResource(mutation.params);
  if (resource !== 'telegram') return;
  const channelUserId = readChannelUserId(mutation.params);
  const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
  if (!channelUserId || !phoneNormalized) return;
  await db.tx(async (txDb) => {
    await setUserPhone(txDb, channelUserId, phoneNormalized);
    if (readPort) {
      const link = await readPort.readDb<{ userId?: string } | null>({
        type: 'user.byIdentity',
        params: { resource, externalId: channelUserId },
      });
      const uid = link && typeof link === 'object' && typeof link.userId === 'string'
        ? link.userId : null;
      if (uid) {
        await enqueueProjectionEvent(txDb, {
          eventType: 'contact.linked',
          idempotencyKey: `contact.linked:${uid}:${phoneNormalized}`,
          occurredAt: new Date().toISOString(),
          payload: { integratorUserId: Number(uid), phoneNormalized },
        });
      }
    }
  });
  return;
}
```

**Ключевое отличие:** `enqueueProjectionEvent(txDb, ...)` внутри `db.tx` — атомарно с `setUserPhone`. `readPort.readDb` может читать из пула (не из tx-клиента), это допустимо т.к. `readPort` не является частью текущей транзакции.

**НЕ ДЕЛАТЬ:** не удалять `readPort` из сигнатуры. Не менять логику readPort.readDb — она корректна.

### Шаг T1.5: Рефакторинг `writePort.ts` — `notifications.update` мутация

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Что найти:** блок `case 'notifications.update':` (примерно строка 323–365).

**Текущая проблема:** точно та же проблема: detached async IIFE.

**Стало:** аналогичный паттерн — обернуть `updateNotificationSettings` + `enqueueProjectionEvent` в `db.tx`:
```typescript
case 'notifications.update': {
  const resource = readResource(mutation.params);
  if (resource !== 'telegram') return;
  const channelUserId = asFiniteNumber(mutation.params.channelUserId ?? mutation.params.channelId);
  if (channelUserId === null) return;
  const settings: Record<string, boolean> = {};
  if (typeof mutation.params.notify_spb === 'boolean') settings.notify_spb = mutation.params.notify_spb;
  if (typeof mutation.params.notify_msk === 'boolean') settings.notify_msk = mutation.params.notify_msk;
  if (typeof mutation.params.notify_online === 'boolean') settings.notify_online = mutation.params.notify_online;
  if (typeof mutation.params.notify_bookings === 'boolean') settings.notify_bookings = mutation.params.notify_bookings;
  if (Object.keys(settings).length === 0) return;
  await db.tx(async (txDb) => {
    await updateNotificationSettings(txDb, channelUserId, settings);
    if (readPort) {
      const link = await readPort.readDb<{ userId?: string } | null>({
        type: 'user.byIdentity',
        params: { resource, externalId: String(channelUserId) },
      });
      const uid = link && typeof link === 'object' && typeof link.userId === 'string'
        ? link.userId : null;
      if (uid) {
        const topicMap: Record<string, string> = {
          notify_spb: 'booking_spb', notify_msk: 'booking_msk',
          notify_online: 'booking_online', notify_bookings: 'bookings',
        };
        const topics = Object.entries(settings)
          .filter(([k]) => k in topicMap)
          .map(([k, v]) => ({ topicCode: topicMap[k], isEnabled: v }));
        if (topics.length > 0) {
          await enqueueProjectionEvent(txDb, {
            eventType: 'preferences.updated',
            idempotencyKey: `preferences.updated:${uid}:${Date.now()}`,
            occurredAt: new Date().toISOString(),
            payload: { integratorUserId: Number(uid), topics },
          });
        }
      }
    }
  });
  return;
}
```

### Шаг T1.6: Создать projection outbox worker

**Файл:** создать `apps/integrator/src/infra/runtime/worker/projectionWorker.ts`

**Логика:**
1. Вычитать пачку due-событий из `projection_outbox` через `claimDueProjectionEvents`.
2. Для каждого: вызвать `webappEventsPort.emit(...)`.
3. Если `emit` вернул `ok: true` — `completeProjectionEvent`.
4. Если `emit` вернул ошибку и `attemptsDone + 1 < maxAttempts` — `rescheduleProjectionEvent`.
5. Если лимит попыток исчерпан — `failProjectionEvent` (DLQ).

```typescript
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { WebappEventsPort } from '../../../kernel/contracts/index.js';
import {
  claimDueProjectionEvents,
  completeProjectionEvent,
  failProjectionEvent,
  rescheduleProjectionEvent,
} from '../../db/repos/projectionOutbox.js';
import { logger } from '../../observability/logger.js';

const RETRY_BASE_SECONDS = 30;

export async function runProjectionWorkerTick(
  db: DbPort,
  webappEventsPort: WebappEventsPort,
  batchSize = 10,
): Promise<number> {
  const events = await claimDueProjectionEvents(db, batchSize);
  let processed = 0;
  for (const ev of events) {
    const attempt = ev.attemptsDone + 1;
    try {
      const result = await webappEventsPort.emit({
        eventType: ev.eventType,
        idempotencyKey: ev.idempotencyKey,
        occurredAt: ev.occurredAt,
        payload: ev.payload,
      });
      if (result.ok) {
        await completeProjectionEvent(db, ev.id);
      } else if (attempt >= ev.maxAttempts) {
        await failProjectionEvent(db, ev.id, result.error ?? `HTTP ${result.status}`);
        logger.warn({ eventId: ev.id, eventType: ev.eventType, attempt }, 'projection event moved to DLQ');
      } else {
        const delay = RETRY_BASE_SECONDS * Math.pow(2, attempt - 1);
        await rescheduleProjectionEvent(db, ev.id, attempt, delay);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= ev.maxAttempts) {
        await failProjectionEvent(db, ev.id, msg);
        logger.warn({ eventId: ev.id, err }, 'projection event moved to DLQ after exception');
      } else {
        const delay = RETRY_BASE_SECONDS * Math.pow(2, attempt - 1);
        await rescheduleProjectionEvent(db, ev.id, attempt, delay);
      }
    }
    processed++;
  }
  return processed;
}
```

### Шаг T1.7: Интегрировать projection worker в main loop

**Файл:** `apps/integrator/src/infra/runtime/worker/main.ts`

**Что добавить:**
1. Импорт: `import { runProjectionWorkerTick } from './projectionWorker.js';`
2. Импорт: `import { createWebappEventsPort } from '../../adapters/webappEventsClient.js';`
3. В `startWorker`, после обработки delivery jobs (существующий `while (true) { ... jobs ... }`), добавить:
```typescript
// Projection outbox delivery
try {
  const projectionDb = createDbPort();
  const webappEvents = createWebappEventsPort();
  await runProjectionWorkerTick(projectionDb, webappEvents);
} catch (err) {
  logger.error({ err }, 'Projection worker tick failed');
}
```

**Важно:** projection worker tick добавляется **внутри** основного `while (true)` цикла, после delivery jobs и перед `sleep`. Это обеспечивает poll с тем же интервалом.

**Альтернатива (если хотите изоляцию):** можно запустить отдельный `setInterval` для projection. Но для простоты — в общем цикле.

### Шаг T1.8: Добавить тесты

**Файл:** создать `apps/integrator/src/infra/db/repos/projectionOutbox.test.ts`

**Тесты:**
- `enqueueProjectionEvent` → запись с `status = 'pending'` (mock db.query, проверить SQL + параметры).
- `claimDueProjectionEvents` → SELECT ... FOR UPDATE SKIP LOCKED + UPDATE status = 'processing'.
- `completeProjectionEvent` → UPDATE status = 'done'.
- `failProjectionEvent` → UPDATE status = 'dead' + last_error.
- `rescheduleProjectionEvent` → UPDATE status = 'pending' + attempts_done + next_try_at.

**Файл:** создать `apps/integrator/src/infra/runtime/worker/projectionWorker.test.ts`

**Тесты:**
- при `emit` возвращающем `ok: true` → вызывает `completeProjectionEvent`.
- при `emit` возвращающем `ok: false` и `attemptsDone < maxAttempts - 1` → вызывает `rescheduleProjectionEvent`.
- при `emit` возвращающем `ok: false` и `attemptsDone >= maxAttempts - 1` → вызывает `failProjectionEvent`.
- при `emit` бросающем exception → аналогичная retry/DLQ логика.

### Шаг T1.9: Верификация

```bash
pnpm run ci
```

**DoD:**
- При недоступном webapp события не теряются, остаются в outbox с `status = 'pending'`.
- После восстановления webapp события доставляются автоматически (worker retries).
- После превышения `max_attempts` событие переходит в DLQ (`status = 'dead'`).
- Domain write и outbox enqueue атомарны (в одной транзакции через `db.tx`).
- CI зелёный.

---

## T2 (P0): Deterministic idempotency keys

**Цель:** retries не создают дубликаты и дедуплицируются стабильно.

**Текущее состояние (что сломано):**
- `writePort.ts` строка ~140: `user.upserted` — ключ `user.upserted:${id}:${Date.now()}` — **не детерминирован**. Каждый retry получает новый ключ → дубликаты в idempotency cache, повторная обработка.
- `writePort.ts` строка ~354: `preferences.updated` — ключ `preferences.updated:${uid}:${Date.now()}` — **не детерминирован**.
- `writePort.ts` строка ~181: `contact.linked` — ключ `contact.linked:${uid}:${phoneNormalized}` — **уже детерминирован** ✓, менять не надо.
- `webappEventsClient.ts` строка 72: fallback ключ `evt-${Date.now()}-${random}` — не детерминирован.

**Решение:** детерминированные ключи, основанные на бизнес-состоянии.

### Шаг T2.1: Создать helper для детерминированных ключей

**Файл:** создать `apps/integrator/src/infra/db/repos/projectionKeys.ts`

```typescript
import { createHash } from 'node:crypto';

export function projectionIdempotencyKey(
  eventType: string,
  stableIdentifier: string,
  payloadFingerprint?: string,
): string {
  const base = payloadFingerprint
    ? `${eventType}:${stableIdentifier}:${payloadFingerprint}`
    : `${eventType}:${stableIdentifier}`;
  if (base.length <= 200) return base;
  return `${eventType}:${createHash('sha256').update(base).digest('hex').slice(0, 32)}`;
}

export function hashPayload(payload: Record<string, unknown>): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}
```

### Шаг T2.2: Заменить ключ `user.upserted` в `writePort.ts`

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Добавить импорт:** `import { projectionIdempotencyKey, hashPayload } from './repos/projectionKeys.js';`

**Что найти внутри `case 'user.upsert':` (после T1.3):**
```
idempotencyKey: `user.upserted:${Math.trunc(parsedId)}:${Date.now()}`,
```

**Заменить на:**
```typescript
idempotencyKey: projectionIdempotencyKey(
  'user.upserted',
  String(Math.trunc(parsedId)),
  hashPayload(projectionPayload),
),
```

**Почему `hashPayload`, а не просто ID:** один и тот же пользователь может обновить displayName — это легитимное новое событие, которое не должно дедуплицироваться с предыдущим upsert. Hash payload-а включает все поля, поэтому разные данные → разный ключ.

### Шаг T2.3: Заменить ключ `preferences.updated` в `writePort.ts`

**Что найти внутри `case 'notifications.update':` (после T1.5):**
```
idempotencyKey: `preferences.updated:${uid}:${Date.now()}`,
```

**Заменить на:**
```typescript
idempotencyKey: projectionIdempotencyKey(
  'preferences.updated',
  String(uid),
  hashPayload({ topics }),
),
```

### Шаг T2.4: Сделать fallback в `webappEventsClient.ts` детерминированным

**Файл:** `apps/integrator/src/infra/adapters/webappEventsClient.ts`

**Что найти (строка ~72):**
```typescript
const idempotencyKey = event.idempotencyKey ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
```

**Заменить на:**
```typescript
const idempotencyKey = event.idempotencyKey ?? `evt-fallback:${event.eventType}:${createHash('sha256').update(body).digest('hex').slice(0, 24)}`;
```

**Добавить импорт в начало файла:** `import { createHash } from 'node:crypto';` (уже импортирован `createHmac` из `'node:crypto'` — объединить в один import).

### Шаг T2.5: Не менять `contact.linked`

`contact.linked` уже использует детерминированный ключ `contact.linked:${uid}:${phoneNormalized}`. **Не трогать.**

### Шаг T2.6: Добавить тесты

**Файл:** создать `apps/integrator/src/infra/db/repos/projectionKeys.test.ts`

**Тесты:**
- `projectionIdempotencyKey` с одинаковыми аргументами → одинаковый результат.
- `projectionIdempotencyKey` с разным `payloadFingerprint` → разные ключи.
- `hashPayload` — порядок ключей объекта не влияет на результат (сортировка).
- Длинный ключ (> 200 символов) → усекается через sha256.

### Шаг T2.7: Верификация

```bash
pnpm run ci
```

**DoD:**
- Одинаковое бизнес-событие даёт одинаковый idempotency key.
- Разные бизнес-данные (другой displayName, другие topics) дают разный key.
- `contact.linked` не затронут.
- CI зелёный.

---

## T3 (P0): Bigint-safe user ID contract

**Цель:** убрать риск потери точности `BIGINT/BIGSERIAL` ID между сервисами.

**Текущее состояние:**
- `writePort.ts` строка ~146: `integratorUserId: Math.trunc(parsedId)` → отправляет как `number`.
- `writePort.ts` строка ~183: `integratorUserId: Number(uid)` → конвертирует `string` → `number`.
- `writePort.ts` строка ~356: `integratorUserId: Number(uid)` → то же самое.
- `events.ts` строка ~184: `typeof payload.integratorUserId === "number"` → принимает только number.
- `pgUserProjection.ts` тип `integratorUserId: number` в сигнатурах.

**Реальный риск:** сейчас user IDs в пределах JS `Number.MAX_SAFE_INTEGER`. Но архитектурно правильно не закладываться на это. Контракт должен быть bigint-safe.

**Решение:** передавать `integratorUserId` как `string` в payload между сервисами. В БД столбец `BIGINT` принимает строки без проблем.

### Шаг T3.1: Изменить emission в `writePort.ts`

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Найти все 3 места, где формируется `integratorUserId` в payload outbox-событий (после T1.3–T1.5):**

1. В `user.upsert`: `integratorUserId: Math.trunc(parsedId)` → заменить на `integratorUserId: String(Math.trunc(parsedId))`
2. В `user.phone.link`: `integratorUserId: Number(uid)` → заменить на `integratorUserId: uid` (uid уже `string`)
3. В `notifications.update`: `integratorUserId: Number(uid)` → заменить на `integratorUserId: uid`

### Шаг T3.2: Изменить webapp обработчики

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

**Заменить проверку типа (3 места):**

1. В `user.upserted` (строка ~184):
   - **Было:** `typeof payload.integratorUserId === "number" ? payload.integratorUserId : null`
   - **Стало:** `typeof payload.integratorUserId === "string" ? payload.integratorUserId : (typeof payload.integratorUserId === "number" ? String(payload.integratorUserId) : null)`

2. В `contact.linked` (строка ~208):
   - **Было:** `typeof payload.integratorUserId === "number" ? payload.integratorUserId : null`
   - **Стало:** аналогично п.1

3. В `preferences.updated` (строка ~231):
   - **Было:** `typeof payload.integratorUserId === "number" ? payload.integratorUserId : null`
   - **Стало:** аналогично п.1

### Шаг T3.3: Изменить тип в `pgUserProjection.ts`

**Файл:** `apps/webapp/src/infra/repos/pgUserProjection.ts`

1. В типе `UserProjectionPort`, заменить `integratorUserId: number` на `integratorUserId: string` (в `upsertFromProjection` params).
2. В `findByIntegratorId`: заменить `integratorUserId: number` на `integratorUserId: string`.
3. В `inMemoryUserProjectionPort` — аналогичные изменения типов.

**SQL-запросы** в `pgUserProjectionPort` менять не надо: PostgreSQL автоматически кастит строку в BIGINT при передаче через `$1`.

### Шаг T3.4: Обновить типы в `events.ts` IntegratorEventsDeps

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

В типе `IntegratorEventsDeps.users`:
- `upsertFromProjection: (params: { integratorUserId: number; ... })` → `integratorUserId: string`
- `findByIntegratorId: (integratorUserId: number)` → `(integratorUserId: string)`

В типе `IntegratorEventsDeps.preferences`:
- Не содержит `integratorUserId`, не менять.

### Шаг T3.5: Обновить тесты

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

Добавить тест:
```typescript
it("accepts user.upserted with string integratorUserId", async () => {
  const deps = buildAppDeps();
  const result = await handleIntegratorEvent(
    {
      eventType: "user.upserted",
      payload: { integratorUserId: "12345678901234" },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  expect(result.accepted).toBe(true);
});

it("accepts user.upserted with number integratorUserId (backward compat)", async () => {
  const deps = buildAppDeps();
  const result = await handleIntegratorEvent(
    {
      eventType: "user.upserted",
      payload: { integratorUserId: 999 },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  expect(result.accepted).toBe(true);
});
```

### Шаг T3.6: Верификация

```bash
pnpm run ci
```

**DoD:**
- Передача и обработка `BIGINT` значений без потери точности.
- Backward compatibility: если payload содержит `number`, он конвертируется в `string`.
- Typecheck обоих приложений проходит.
- CI зелёный.

---

## T4 (P0): Out-of-order safe handlers in webapp

**Цель:** `contact.linked` и `preferences.updated` не фейлятся при отсутствии `user.upserted`.

**Текущее состояние (что сломано):**
- `events.ts` строка ~217–219: `contact.linked` вызывает `findByIntegratorId` → если null → `return { accepted: false, reason: "platform user not found" }`. Ответ 503 кэшируется в idempotency cache. При retry с тем же ключом кэш возвращает 503.
- `events.ts` строка ~249–251: `preferences.updated` — аналогично.

**Решение:** заменить `findByIntegratorId` + hard fail на `upsertFromProjection` — он создаёт "skeleton" пользователя если не найден. Создание skeleton-пользователя — штатная временная ситуация.

### Шаг T4.1: Рефакторинг `contact.linked` handler

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

**Найти блок `if (event.eventType === "contact.linked")` (строки ~206–227).**

**Было:**
```typescript
try {
  const user = await deps.users.findByIntegratorId(integratorUserId);
  if (!user) {
    return { accepted: false, reason: "contact.linked: platform user not found for integratorUserId" };
  }
  await deps.users.updatePhone(user.platformUserId, phoneNormalized);
  return { accepted: true };
}
```

**Стало:**
```typescript
try {
  const { platformUserId } = await deps.users.upsertFromProjection({
    integratorUserId,
    phoneNormalized,
  });
  await deps.users.updatePhone(platformUserId, phoneNormalized);
  return { accepted: true };
}
```

**Что происходит:** `upsertFromProjection` найдёт существующего пользователя по `integratorUserId` или `phoneNormalized`, или создаст skeleton. Затем `updatePhone` безопасно устанавливает телефон.

### Шаг T4.2: Рефакторинг `preferences.updated` handler

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

**Найти блок `if (event.eventType === "preferences.updated")` (строки ~229–262).**

**Было:**
```typescript
try {
  const user = await deps.users.findByIntegratorId(integratorUserId);
  if (!user) {
    return { accepted: false, reason: "preferences.updated: platform user not found" };
  }
  await deps.preferences.upsertNotificationTopics({
    platformUserId: user.platformUserId,
    topics: validTopics,
  });
  return { accepted: true };
}
```

**Стало:**
```typescript
try {
  const { platformUserId } = await deps.users.upsertFromProjection({
    integratorUserId,
  });
  await deps.preferences.upsertNotificationTopics({
    platformUserId,
    topics: validTopics,
  });
  return { accepted: true };
}
```

### Шаг T4.3: Добавить тесты на out-of-order

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

**Добавить тесты:**

```typescript
it("contact.linked creates skeleton user if user.upserted not received yet", async () => {
  const deps = buildAppDeps();
  const result = await handleIntegratorEvent(
    {
      eventType: "contact.linked",
      payload: { integratorUserId: "77777", phoneNormalized: "+70001112233" },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  expect(result.accepted).toBe(true);
});

it("preferences.updated creates skeleton user if user.upserted not received yet", async () => {
  const deps = buildAppDeps();
  const result = await handleIntegratorEvent(
    {
      eventType: "preferences.updated",
      payload: {
        integratorUserId: "88888",
        topics: [{ topicCode: "booking_spb", isEnabled: true }],
      },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  expect(result.accepted).toBe(true);
});

it("contact.linked then user.upserted produces consistent state", async () => {
  const deps = buildAppDeps();
  await handleIntegratorEvent(
    {
      eventType: "contact.linked",
      payload: { integratorUserId: "99999", phoneNormalized: "+70009998877" },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  const result = await handleIntegratorEvent(
    {
      eventType: "user.upserted",
      payload: {
        integratorUserId: "99999",
        displayName: "Test User",
        channelCode: "telegram",
        externalId: "tg99999",
      },
    },
    { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
  );
  expect(result.accepted).toBe(true);
});
```

### Шаг T4.4: Верификация

```bash
pnpm run ci
```

**DoD:**
- Последовательности `contact → user` и `preferences → user` завершаются консистентным состоянием.
- Handler не возвращает `accepted: false` для штатной out-of-order ситуации.
- Тесты на обе последовательности зелёные.
- CI зелёный.

---

## T5 (P1): Backfill script for existing person-domain data

**Цель:** перенести исторические записи из `integrator` в `webapp` до read-switch.

**Scope:**
- Добавить одноразовый backfill script:
  - source: `integrator.users` + `identities` + `contacts` + `telegram_state`;
  - target: `webapp.platform_users`, `user_channel_bindings`, `user_notification_topics`.
- Сделать `dry-run` mode (только подсчёт и отчёт) и `commit` mode (реальная запись).
- Скрипт идемпотентный: повторный запуск не создаёт дубликатов (upsert по `integrator_user_id`).

### Шаг T5.1: Создать backfill-скрипт

**Файл:** создать `apps/webapp/scripts/backfill-person-domain.mjs`

**Логика:**
1. Подключиться к БД (та же `DATABASE_URL` что и webapp).
2. Прочитать `users` из integrator-таблиц (те же таблицы, та же БД, разные схемы не используются — логически разные, физически одна).
3. Для каждого user:
   - `INSERT INTO platform_users (integrator_user_id, phone_normalized, display_name) VALUES (...) ON CONFLICT (integrator_user_id) DO UPDATE SET ...`
   - Если есть identity → `INSERT INTO user_channel_bindings ... ON CONFLICT DO UPDATE`
   - Если есть telegram_state notify flags → `INSERT INTO user_notification_topics ... ON CONFLICT DO UPDATE`
4. В dry-run mode: SELECT counts, log mismatches, don't write.
5. CLI: `node scripts/backfill-person-domain.mjs --dry-run` / `node scripts/backfill-person-domain.mjs --commit`

### Шаг T5.2: Документация запуска

**Файл:** создать `docs/RUNBOOK_BACKFILL_PERSON_DOMAIN.md`

Описать: prerequisites, dry-run, commit, rollback (delete from platform_users where integrator_user_id is not null + truncate user_notification_topics).

### Шаг T5.3: Верификация

```bash
pnpm run ci
```

**DoD:**
- Backfill идемпотентный.
- Есть dry-run отчёт (counts + mismatches).
- Повторный запуск не создаёт дубликатов.
- CI зелёный (скрипт не ломает typecheck/lint).

---

## T6 (P1): Reconciliation + operability gates

**Цель:** объективные критерии перед read-switch.

**Scope:**
- Реализовать reconciliation script/report:
  - counts: `integrator.users` vs `webapp.platform_users` where `integrator_user_id IS NOT NULL`;
  - sampled record matching: случайная выборка 100 записей, проверка полей;
  - mismatch classes: missing, extra, field drift.
- Добавить projection health SQL-запросы:
  - `SELECT count(*) FROM projection_outbox WHERE status = 'pending'` — queue depth;
  - `SELECT count(*) FROM projection_outbox WHERE status = 'dead'` — DLQ size;
  - `SELECT min(created_at) FROM projection_outbox WHERE status = 'pending'` — oldest event (lag).
- Описать release gate: read-switch запрещён если DLQ > 0 или lag > 5 min или mismatch > 1%.

### Шаг T6.1: Создать reconciliation скрипт

**Файл:** создать `apps/webapp/scripts/reconcile-person-domain.mjs`

**Логика:**
1. SELECT count from integrator users table.
2. SELECT count from webapp platform_users WHERE integrator_user_id IS NOT NULL.
3. Sampled matching: join on integrator_user_id, compare phone, display_name.
4. Output: JSON report с counts, matches, mismatches.

### Шаг T6.2: Создать health check SQL

**Файл:** создать `apps/integrator/scripts/projection-health.sql` (или `.mjs`)

Запросы к `projection_outbox`: queue depth, DLQ size, oldest pending, retry distribution.

### Шаг T6.3: Документировать release gate

**Файл:** создать `docs/RELEASE_GATE_PERSON_DOMAIN.md`

Зафиксировать: пороги, процедуру проверки, кто подтверждает, что делать при нарушении.

### Шаг T6.4: Верификация

```bash
pnpm run ci
```

**DoD:**
- Перед read-switch есть формальный reconciliation report.
- Операционные пороги зафиксированы.
- CI зелёный.

---

## Definition of ready for person-domain read-switch

Read-switch разрешается только когда **все** условия выполнены:

- T1..T4 завершены и в проде стабильно отработали в течение agreed soak period (мин. 72 часа);
- Backfill (T5) выполнен, reconciliation (T6) показывает mismatch ≤ 1%;
- DLQ пуст или residual set задокументирован и принят;
- Projection lag < 5 мин (median за последние 24 часа);
- Команда подтвердила rollback plan для окна switch.

---

## Связанные документы

- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) — маршрут верхнего уровня
- [STAGE2_REMEDIATION_PLAN.md](./STAGE2_REMEDIATION_PLAN.md) — план исправлений
- [DB_MIGRATION_STAGE2_PATIENT_MASTER.md](./DB_MIGRATION_STAGE2_PATIENT_MASTER.md) — оригинальный план Stage 2
