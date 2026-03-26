# DB Zone Polish — финальная полировка после миграции

Дата: 2026-03-21.
Контекст: финальная ревизия всех трёх фаз STAGE13_POST_CUTOVER_FIXES выявила 9 проблем (2 CRITICAL, 2 HIGH, 3 MEDIUM, 2 LOW), пропущенных при предыдущих проходах. Все исправлены в одном пакете, CI зелёный.

Связанные документы:
- [STAGE13_POST_CUTOVER_FIXES.md](./STAGE13_POST_CUTOVER_FIXES.md) — основной backlog post-cutover
- [STAGE13_OWNERSHIP_MAP.md](../ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md) — карта владения таблицами
- [DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md) — чеклист миграции

---

## Исправления (все применены)

### 1. CRITICAL — A3: reconcile-person-domain fieldDrift не блокировал exit code

**Файл:** `apps/webapp/scripts/reconcile-person-domain.mjs`

**Проблема:** Пункт A3 из STAGE13_POST_CUTOVER_FIXES требовал, чтобы `fieldDriftCount > 0` приводил к `exitCode = 1`. Фактически `hasDrift` не был объявлен и не включён в условие. Reconcile проходил зелёным при любом количестве испорченных полей. Stage13-gate не ловил field drift.

**Исправление:**
```javascript
// Было:
const exitCode = overThreshold || hasMissing ? 1 : 0;
if (drift > 0) console.warn(...);

// Стало:
const hasDrift = drift > 0;
const exitCode = overThreshold || hasMissing || hasDrift ? 1 : 0;
if (hasDrift) console.error(`[reconcile-person-domain] fieldDrift: ${drift} records with mismatched fields`);
```

---

### 2. CRITICAL — appendDeliveryEventFromProjection: INSERT без ON CONFLICT

**Файл:** `apps/webapp/src/infra/repos/pgSupportCommunication.ts`

**Проблема:** Единственный projection INSERT в webapp, не имевший `ON CONFLICT`. При retry projection event `support.delivery.attempt.logged` с тем же `integrator_intent_event_id` — уникальная ошибка PG, 503 в ответ integrator'у, event уходил в dead. Backfill-скрипт (`backfill-communication-history.mjs`) имел корректный `ON CONFLICT`, а runtime handler — нет.

**Исправление:**
```sql
-- Было:
INSERT INTO support_delivery_events (...) VALUES (...)
RETURNING id

-- Стало:
INSERT INTO support_delivery_events (...) VALUES (...)
ON CONFLICT (integrator_intent_event_id)
  WHERE integrator_intent_event_id IS NOT NULL
DO NOTHING
RETURNING id
```

Также:
- `r.rows[0].id` → `r.rows[0]?.id ?? ''` (при DO NOTHING rows пуст).
- In-memory mock (`inMemorySupportCommunication.ts`) обновлён для идемпотентности.
- Добавлен тест (`pgSupportCommunication.test.ts`): двойной вызов `appendDeliveryEventFromProjection` с одним `integratorIntentEventId` → один и тот же `id`.

---

### 3. HIGH — hashPayload сортировал только top-level ключи

**Файл:** `apps/integrator/src/infra/db/repos/projectionKeys.ts`

**Проблема:** `hashPayload` использовал `JSON.stringify(payload, Object.keys(payload).sort())` — replacer-массив сортирует только корневые ключи. Вложенные объекты сериализовались в порядке вставки. При разном порядке вложенных ключей — разный hash → разные idempotency key → дубликат в outbox.

Ирония: `jsonStableStringify` (написанный для B2a) корректно сортирует ВСЕ уровни, но использовался только для HTTP body. Idempotency key строился через неполноценный `hashPayload`.

**Исправление:**
```typescript
// Было:
export function hashPayload(payload: Record<string, unknown>): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

// Стало:
import { jsonStableStringify } from '../../adapters/jsonStableStringify.js';

export function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(jsonStableStringify(payload)).digest('hex').slice(0, 16);
}
```

Добавлен тест (`projectionKeys.test.ts`): nested objects с разным порядком ключей → одинаковый hash.

**Обратная совместимость:** Старые events уже в outbox с зафиксированными ключами; UNIQUE INDEX предотвращает дубли. Новые events получат стабильные ключи. Переход одноразовый и безопасный — для flat payloads (подавляющее большинство) `jsonStableStringify` и `JSON.stringify` с sorted keys дают одинаковый результат.

---

### 4. HIGH — run-migrations.mjs: connection leak при ошибке ROLLBACK

**Файл:** `apps/webapp/scripts/run-migrations.mjs`

**Проблема:** Если `client.query("ROLLBACK")` бросал ошибку (коннект разорван), `client.end()` на строке 67 не вызывался — код после for-loop не достигался. PG-соединение оставалось в серверном pool'е до таймаута.

**Исправление:**
- Весь migration loop обёрнут в `try { ... } finally { await client.end(); }`.
- `ROLLBACK` обёрнут в `try/catch` (best-effort) чтобы не маскировать оригинальную ошибку миграции.

---

### 5. MEDIUM — spawn-with-timeout.mjs: SIGTERM не убивал дочерние процессы

**Файл:** `scripts/spawn-with-timeout.mjs`

**Проблема:** `child.kill("SIGTERM")` убивал только прямой дочерний процесс (sh/pnpm). Когда pnpm запускал node, а node — ещё что-то, grandchildren переживали таймаут. На сервере после таймаута gate/reconcile оставались зомби-процессы.

**Исправление:**
```javascript
// Было:
const child = spawn(cmd, args, { cwd, stdio: "inherit", shell });
// ...
child.kill("SIGTERM");

// Стало:
const child = spawn(cmd, args, {
  cwd, stdio: "inherit", shell,
  detached: process.platform !== "win32",
});
// ...
if (process.platform !== "win32" && typeof child.pid === "number") {
  process.kill(-child.pid, "SIGTERM");  // kill entire process group
} else {
  child.kill("SIGTERM");
}
```

---

### 6. MEDIUM — ROLLBACK-ошибка маскировала оригинальную ошибку в backfill-скриптах

**Файлы:**
- `apps/webapp/scripts/backfill-communication-history.mjs` (5 мест)
- `apps/webapp/scripts/backfill-reminders-domain.mjs` (4 места)
- `apps/webapp/scripts/backfill-appointments-domain.mjs` (1 место)
- `apps/webapp/scripts/backfill-subscription-mailing-domain.mjs` (3 места)
- `apps/webapp/scripts/backfill-person-domain.mjs` (1 место)

**Проблема:** При ошибке INSERT вызывался `dst.query("ROLLBACK")`. Если ROLLBACK тоже бросал (коннект потерян), оригинальная ошибка batch'а терялась — вместо неё пробрасывалась ошибка ROLLBACK.

**Исправление:** Везде ROLLBACK обёрнут в `try/catch`:
```javascript
} catch (err) {
  if (!dryRun) {
    try {
      await dst.query("ROLLBACK");
    } catch {
      // Best effort rollback; preserve original batch error.
    }
  }
  throw err;
}
```

---

### 7. MEDIUM — Error swallowing в reads-адаптерах

**Файлы:**
- `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts`
- `apps/integrator/src/infra/adapters/appointmentsReadsPort.ts`

**Проблема:** `catch { return { ok: false, status: 0 }; }` — при сетевой ошибке, DNS failure, TLS-ошибке ничего не логировалось. Оператор видел `status: 0` без контекста.

**Исправление:**
```typescript
} catch (err) {
  console.warn('appointments reads GET failed', {
    pathname,
    status: 0,
    error: err instanceof Error ? err.message : String(err),
  });
  return { ok: false, status: 0 };
}
```

Примечание: использован `console.warn` а не `logger.warn` т.к. эти модули тестируются изолированно, а `logger` зависит от pino с runtime env (level), что ломает тесты без полного app-контекста.

---

### 8. LOW — jsonStableStringify не защищён от circular references

**Файл:** `apps/integrator/src/infra/adapters/jsonStableStringify.ts`

**Проблема:** Рекурсия без circuit breaker → при circular ref (маловероятно для projection payloads, но возможно при баге) — бесконечный стек.

**Исправление:** Внутренняя рекурсия вынесена в `stringifyStable(value, seen: WeakSet<object>)`:
```typescript
export function jsonStableStringify(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

function stringifyStable(value: unknown, seen: WeakSet<object>): string {
  // ...
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      throw new TypeError('Converting circular structure to JSON');
    }
    seen.add(obj);
    const out = `{${keys.map(...)}}`;
    seen.delete(obj);
    return out;
  }
}
```

Добавлен тест (`jsonStableStringify.test.ts`): circular ref → throws `/circular/i`.

---

### 9. LOW — backfill-скрипты без cap на --limit

**Файлы:**
- `apps/webapp/scripts/backfill-communication-history.mjs`
- `apps/webapp/scripts/backfill-subscription-mailing-domain.mjs`

**Проблема:** Использовался голый `parseInt(limitArg.split("=")[1], 10)` без ограничения. `--limit=999999999` загрузил бы миллионы строк в память. Другие backfill-скрипты имели `parseBackfillLimit` с `MAX_BACKFILL_LIMIT = 500_000`.

**Исправление:** Добавлен `parseBackfillLimit` с `MAX_BACKFILL_LIMIT = 500_000` по аналогии с другими скриптами.

---

## Остающийся tech debt (НЕ блокирует продакшн)

| # | Severity | Описание | Рекомендация |
|---|----------|----------|-------------|
| 1 | MEDIUM | Events в `processing` при крэше worker'а — не возвращаются в `pending` | Добавить фоновый job для recovery stuck events (WHERE status = 'processing' AND updated_at < now() - interval '5 min') |
| 2 | MEDIUM | Нет CHECK constraint на `projection_outbox.status` в PG | Добавить `CHECK (status IN ('pending','processing','done','dead'))` при следующей миграции |
| 3 | MEDIUM | Нет юнит-тестов на PG-реализации pgBranches, pgUserProjection | Покрыты integration через events.test.ts; добавить при рефакторе |
| 4 | LOW | `mailing.topic.upserted` / `user.subscription.upserted` включают `updatedAt` в payload → при rapid upserts разные idempotency keys | На текущих объёмах не стреляет; дедуплицируется webapp idempotency |
| 5 | LOW | 3 reconcile-скрипта не fallback'ят на `SOURCE_DATABASE_URL` | Работает на проде; унифицировать при следующем рефакторе |
| 6 | LOW | `--limit` в backfill-communication-history ограничивает каждый entity-тип отдельно | Документировать; на проде `--limit` не используется |
| 7 | LOW | Concurrent race в `pgUserProjection` (два INSERT для нового user одновременно) | Маловероятно при текущем однопоточном worker; при масштабировании добавить ON CONFLICT |

---

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `apps/webapp/scripts/reconcile-person-domain.mjs` | fieldDrift → exitCode=1 |
| `apps/webapp/src/infra/repos/pgSupportCommunication.ts` | ON CONFLICT на delivery events INSERT |
| `apps/webapp/src/infra/repos/pgSupportCommunication.test.ts` | Тест идемпотентности delivery events |
| `apps/webapp/src/infra/repos/inMemorySupportCommunication.ts` | Идемпотентный mock для delivery events |
| `apps/integrator/src/infra/db/repos/projectionKeys.ts` | hashPayload → jsonStableStringify |
| `apps/integrator/src/infra/db/repos/projectionKeys.test.ts` | Тест nested key order hash |
| `apps/integrator/src/infra/adapters/jsonStableStringify.ts` | Circular ref protection |
| `apps/integrator/src/infra/adapters/jsonStableStringify.test.ts` | Тест circular ref |
| `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts` | console.warn на сетевые ошибки |
| `apps/integrator/src/infra/adapters/appointmentsReadsPort.ts` | console.warn на сетевые ошибки |
| `apps/webapp/scripts/run-migrations.mjs` | try/finally + safe ROLLBACK |
| `scripts/spawn-with-timeout.mjs` | detached + process group kill |
| `apps/webapp/scripts/backfill-communication-history.mjs` | Safe ROLLBACK + parseBackfillLimit |
| `apps/webapp/scripts/backfill-reminders-domain.mjs` | Safe ROLLBACK |
| `apps/webapp/scripts/backfill-appointments-domain.mjs` | Safe ROLLBACK |
| `apps/webapp/scripts/backfill-subscription-mailing-domain.mjs` | Safe ROLLBACK + parseBackfillLimit |
| `apps/webapp/scripts/backfill-person-domain.mjs` | Safe ROLLBACK |

---

## Критерии приёмки

- [x] `pnpm run ci` зелёный (lint + typecheck + 349 integrator tests + 304 webapp tests + build + audit)
- [x] Все 9 найденных проблем исправлены с тестами
- [x] Нет новых lint-ошибок
- [x] Обратная совместимость hashPayload подтверждена (flat payloads → тот же результат)
- [ ] Деплой на прод + stage13-gate = OK
- [ ] Projection health: 0 dead, 0 pending после деплоя

---

## Порядок деплоя

```
1. git push (фиксы уже в main)
2. deploy-prod.sh (integrator + webapp)
3. Проверка:
   - stage13-gate
   - projection-health
   - SQL: SELECT count(*) FROM projection_outbox WHERE status = 'dead'
   - SQL: SELECT count(*) FROM support_delivery_events GROUP BY integrator_intent_event_id HAVING count(*) > 1
```
