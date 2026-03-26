# Stage 2: Patient Master Domain Migration

Первый реальный domain move — перенос ownership person/contact/bindings/preferences из `integrator` в `webapp`.

Связанные документы:
- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) — общий roadmap (Этапы 3–4).
- [DB_MIGRATION_PREPARATION_FOUNDATION.md](./DB_MIGRATION_PREPARATION_FOUNDATION.md) — Stage 1 артефакты.

---

## Цель

`webapp.platform_users` становится единственным product master для:
- person identity (кто этот пользователь);
- verified contacts (телефон);
- channel bindings (telegram / max / vk);
- notification topic preferences (города записи, общие уведомления).

`integrator` сохраняет `users` / `identities` / `telegram_state` как runtime/shadow, но перестаёт быть source of truth для продукта.

---

## Текущее состояние (findings из exploration)

### ID mapping challenge

| Сторона | Таблица | PK type |
|---------|---------|---------|
| integrator | `users` | `BIGSERIAL` (автоинкремент BIGINT) |
| webapp | `platform_users` | `UUID` (gen_random_uuid) |

**Bridge:** `phone_normalized` — общий ключ в `integrator.contacts` и `webapp.platform_users`.

### Identity model mismatch

| integrator `identities` | webapp `user_channel_bindings` |
|--------------------------|-------------------------------|
| `(resource TEXT, external_id TEXT)` — resource любая строка | `(channel_code TEXT, external_id TEXT)` — channel_code ∈ {'telegram','max','vk'} |
| FK → `users.id` (BIGINT) | FK → `platform_users.id` (UUID) |

### Notification flags mismatch

| integrator `telegram_state` | webapp `user_channel_preferences` |
|-----------------------------|-----------------------------------|
| `notify_spb`, `notify_msk`, `notify_online`, `notify_bookings` — topic booleans | `is_enabled_for_messages`, `is_enabled_for_notifications` — channel toggles |

Это **разные concerns**: topic preferences (какие города) vs channel delivery preferences (вкл/выкл канал). Нужна отдельная таблица для topic preferences в webapp.

### Existing event infrastructure

- `webappEventsClient.ts` → `POST /api/integrator/events` (HMAC, idempotency).
- `events.ts` обрабатывает только 4 diary event types; остальные → `durable ingest is not implemented`.
- `route.ts` вызывает `buildAppDeps()` и передаёт `{ diaries: deps.diaries }`.

### Existing diary issue (out of scope)

`diary.*.created` events передают `integrator.users.id` (BIGINT string) как `payload.userId`. Diary таблицы хранят его в `user_id TEXT` без FK на `platform_users`. После этой миграции diary entries потребуют remapping user_id — это отдельный follow-up.

---

## Workstreams

### WS-1: Webapp migration ledger (blocking prerequisite)

**Цель:** webapp migration runner отслеживает применённые миграции, не выполняет повторно.

**Файл:** `apps/webapp/scripts/run-migrations.mjs`

**Что сделать:**
1. В начале `main()`, перед циклом миграций: `CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
2. Перед выполнением каждого файла: `SELECT 1 FROM schema_migrations WHERE filename = $1`. Если есть — skip с логом `Skipping {file} (already applied)`.
3. Выполнение миграции обернуть в `BEGIN` / `COMMIT`. При ошибке `ROLLBACK`.
4. После успешного выполнения: `INSERT INTO schema_migrations (filename) VALUES ($1)`.

Это делает runner идемпотентным и безопасным для повторного запуска.

---

### WS-2: Schema extension

**Цель:** добавить mapping column и таблицу notification topics.

**Файл:** `apps/webapp/migrations/008_patient_master_extension.sql`

```sql
-- Add integrator user ID mapping to platform_users
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS integrator_user_id BIGINT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_platform_users_integrator_uid
  ON platform_users (integrator_user_id) WHERE integrator_user_id IS NOT NULL;

-- Notification topic preferences (city-specific booking notifications etc.)
CREATE TABLE IF NOT EXISTS user_notification_topics (
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  topic_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_code)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_topics_user
  ON user_notification_topics (user_id);
```

Topic codes: `booking_spb`, `booking_msk`, `booking_online`, `bookings` (маппинг из `notify_spb`, `notify_msk`, `notify_online`, `notify_bookings`).

---

### WS-3: Projection handlers (webapp)

**Цель:** webapp принимает и обрабатывает person-domain events от integrator.

#### 3.1 Новый repo: `apps/webapp/src/infra/repos/pgUserProjection.ts`

Функция `upsertFromIntegratorProjection(params)`:
1. Если `integrator_user_id` уже есть в `platform_users` → UPDATE `display_name`, `phone_normalized`.
2. Иначе если `phone_normalized` совпадает → UPDATE `integrator_user_id`, `display_name`.
3. Иначе → INSERT новый `platform_users` с `integrator_user_id`, `phone_normalized`, `display_name`.
4. Upsert `user_channel_bindings` если передан `channelCode` + `externalId`.
5. Return `{ platformUserId: string }`.

Функция `upsertNotificationTopics(params)`:
1. Для каждого `{ topicCode, isEnabled }` → `INSERT INTO user_notification_topics ... ON CONFLICT (user_id, topic_code) DO UPDATE SET is_enabled = $3, updated_at = now()`.

#### 3.2 Расширение `events.ts`

Добавить новые event handlers:

**`user.upserted`** — payload: `{ integratorUserId, phoneNormalized?, displayName?, channelCode?, externalId? }`
- Вызывает `deps.users.upsertFromProjection(...)`.
- Return `{ accepted: true }`.

**`contact.linked`** — payload: `{ integratorUserId, phoneNormalized }`
- Ищет `platform_users` по `integrator_user_id`.
- Обновляет `phone_normalized`.
- Return `{ accepted: true }`.

**`preferences.updated`** — payload: `{ integratorUserId, topics: { topicCode, isEnabled }[] }`
- Ищет `platform_users` по `integrator_user_id`.
- Вызывает `deps.preferences.upsertNotificationTopics(...)`.
- Return `{ accepted: true }`.

#### 3.3 Расширение deps

**`IntegratorEventsDeps`** в `events.ts`:
```typescript
users: {
  upsertFromProjection: (params: {
    integratorUserId: number;
    phoneNormalized?: string;
    displayName?: string;
    channelCode?: string;
    externalId?: string;
  }) => Promise<{ platformUserId: string }>;
  findByIntegratorId: (integratorUserId: number) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
};
preferences: {
  upsertNotificationTopics: (params: {
    platformUserId: string;
    topics: { topicCode: string; isEnabled: boolean }[];
  }) => Promise<void>;
};
```

**`route.ts`**: расширить вызов `handleIntegratorEvent(eventBody, { diaries: deps.diaries, users: deps.users, preferences: deps.preferences })`.

**`buildAppDeps.ts`**: добавить `users` и `preferences` (из нового repo) в deps объект, expose через returned object для route.

---

### WS-4: Projection emitters (integrator)

**Цель:** integrator автоматически проецирует person-domain writes в webapp.

#### 4.1 Расширение `createDbWritePort`

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

Добавить optional `webappEventsPort` в параметры:
```typescript
export function createDbWritePort(input: {
  db?: DbPort;
  webappEventsPort?: WebappEventsPort;
} = {}): DbWritePort {
```

#### 4.2 Emit после person-domain writes

После каждого успешного write, fire-and-forget emit (catch errors, log, не блокировать primary write):

**После `user.upsert`:**
```typescript
if (webappEventsPort) {
  const idKey = `user.upserted:${parsedId}:${Date.now()}`;
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

**После `user.phone.link`:**
```typescript
if (webappEventsPort) {
  // channelUserId is the telegram ID → resolve integrator user_id from identity
  const link = await readPort?.readDb?.({ type: 'user.byIdentity', params: { resource, externalId: channelUserId } });
  const integratorUserId = link?.userId;
  if (integratorUserId) {
    const idKey = `contact.linked:${integratorUserId}:${phoneNormalized}`;
    webappEventsPort.emit({
      eventType: 'contact.linked',
      idempotencyKey: idKey,
      occurredAt: new Date().toISOString(),
      payload: { integratorUserId: Number(integratorUserId), phoneNormalized },
    }).catch(err => logger.warn({ err, eventType: 'contact.linked' }, 'projection emit failed'));
  }
}
```

**После `notifications.update`:**
```typescript
if (webappEventsPort) {
  // channelUserId → integrator user_id
  const link = await readPort?.readDb?.({ type: 'user.byIdentity', params: { resource, externalId: String(channelUserId) } });
  const integratorUserId = link?.userId;
  if (integratorUserId) {
    const topicMap: Record<string, string> = {
      notify_spb: 'booking_spb', notify_msk: 'booking_msk',
      notify_online: 'booking_online', notify_bookings: 'bookings',
    };
    const topics = Object.entries(settings)
      .filter(([k]) => k in topicMap)
      .map(([k, v]) => ({ topicCode: topicMap[k], isEnabled: v }));
    if (topics.length > 0) {
      const idKey = `preferences.updated:${integratorUserId}:${Date.now()}`;
      webappEventsPort.emit({
        eventType: 'preferences.updated',
        idempotencyKey: idKey,
        occurredAt: new Date().toISOString(),
        payload: { integratorUserId: Number(integratorUserId), topics },
      }).catch(err => logger.warn({ err, eventType: 'preferences.updated' }, 'projection emit failed'));
    }
  }
}
```

#### 4.3 Wiring в DI

**Файл:** `apps/integrator/src/app/di.ts`

Передать `webappEventsPort` в `createDbWritePort`:
```typescript
const webappEventsPort = createWebappEventsPort();
const dbWritePort = input.dbWritePort ?? createDbWritePort({ db: dbPort, webappEventsPort });
```

Также нужен `readPort` внутри writePort для resolve user_id. Добавить `readPort` в параметры `createDbWritePort`:
```typescript
export function createDbWritePort(input: {
  db?: DbPort;
  webappEventsPort?: WebappEventsPort;
  readPort?: DbReadPort;
} = {}): DbWritePort {
```

И в `di.ts`:
```typescript
const dbReadPort = input.dbReadPort ?? createDbReadPort({ db: dbPort });
const dbWritePort = input.dbWritePort ?? createDbWritePort({ db: dbPort, webappEventsPort, readPort: dbReadPort });
```

---

### WS-5: Verification

**Цель:** подтвердить, что projection работает end-to-end.

Проверки:
1. `pnpm run ci` проходит без ошибок.
2. Новые event types зарегистрированы и обрабатываются в `events.ts`.
3. Webapp migration runner корректно skip'ает уже применённые миграции.
4. Schema extension миграция применяется идемпотентно.

---

## Out of scope (follow-up)

1. **Diary user_id remapping:** текущие diary entries хранят `integrator.users.id`; remapping к `platform_users.id` — отдельная задача после backfill.
2. **Backfill script:** одноразовый скрипт для существующих пользователей — отдельная задача, требует доступа к prod данным.
3. **Read-switch:** переключение product reads с integrator на webapp — после backfill и валидации.
4. **Reconciliation:** скрипт сравнения данных integrator vs webapp — после backfill.

---

## Definition of done (Stage 2 implementation)

- [ ] Webapp migration runner имеет `schema_migrations` ledger.
- [ ] `platform_users` имеет `integrator_user_id BIGINT UNIQUE` column.
- [ ] `user_notification_topics` таблица создана.
- [ ] Webapp `events.ts` обрабатывает `user.upserted`, `contact.linked`, `preferences.updated`.
- [ ] Integrator автоматически проецирует `user.upsert`, `user.phone.link`, `notifications.update` в webapp.
- [ ] `pnpm run ci` проходит.
