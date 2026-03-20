# Stage 11: Subscription/mailing stack и channel analytics — план для авто-агента

> **Режим:** только план. Реализацию выполняет младший агент в режиме авто по этому документу.
>
> **Источник:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), этап 11.

---

## Цель этапа 11

Объединённый этап для двух связанных доменов:

**Subscription/mailing stack:**
- `mailing_topics` (product-level категории подписок) и `user_subscriptions` (выбор пользователя) — перенести в webapp как product/preferences; проекция из integrator.
- `mailings` — runtime queue → **остаётся в integrator** (не трогать).
- `mailing_logs` — audit → проекция в webapp.

**Channel analytics и SMS delivery accounting:**
- Журнал отправок (delivery attempt logs) уже проецируется в webapp через `support.delivery.attempt.logged` и таблицу `support_delivery_events` (миграция 009). Этап 11: убедиться, что данных достаточно для отчётности; при необходимости добавить API или агрегаты для специалиста/админки.

**Результат:** product-level подписки (topics, user_subscriptions) и аудит рассылок (mailing_logs) управляются/читаются через webapp; delivery-аналитика опирается на webapp; runtime queues и transport facts остаются в integrator.

---

## Meta-инструкция для агента

1. **Одна задача = один логический блок с финальной верификацией.** Следующий блок только после green CI предыдущего.
2. **Каждый шаг — атомарное изменение одного файла.** Путь к файлу, что искать, на что заменить, что проверить.
3. **Тесты — отдельный шаг после production-кода.** Не смешивать.
4. **В конце каждой задачи:** шаг верификации — `pnpm run ci` зелёный.
5. **Не редактировать документы-планы** (этот файл, `DB_ZONES_RESTRUCTURE.md` и др.) — read-only.
6. **Идентификаторы:** bigint-safe — в payload и API использовать строки для id (не `number`).
7. **НЕ ДЕЛАТЬ:** не удалять таблицы/миграции integrator; не переносить `mailings` в webapp; не менять контракт `subscriptions.forUser` в contextQueryPort (это про channel bindings, не про mailing topics); не удалять репозитории `subscriptions.ts` и `topics.ts` из integrator в рамках этапа 11 (Stage 12 может убрать legacy reads).

---

## Контекст кодовой базы

- **Integrator:** таблицы `mailing_topics`, `user_subscriptions`, `mailings`, `mailing_logs` (schema: `docs/ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql`). Репозитории: `apps/integrator/src/infra/db/repos/topics.ts` (listActiveTopics, getTopicByKey), `apps/integrator/src/infra/db/repos/subscriptions.ts` (getUserSubscriptions, upsertUserSubscription, toggleUserSubscription). Сейчас они **не** подключены к readPort/writePort; вызываются только из тестов.
- **Webapp:** миграция 009 уже ввела `support_delivery_events` (projection из `delivery_attempt_logs` через `support.delivery.attempt.logged`). Отдельных таблиц для mailing_topics, user_subscriptions, mailing_logs в webapp пока нет.
- **Projection:** по образцу Stage 7/9 — transactional outbox в integrator, события проекции, webapp ingest в `handleIntegratorEvent`.
- **Guardrails:** idempotency key детерминированный; reconciliation обязательна; bigint-safe идентификаторы.

---

## Затронутые файлы (сводка)

| Файл / зона | Задачи |
|-------------|--------|
| `apps/integrator/src/kernel/contracts/projectionEventTypes.ts` | T1 |
| `apps/integrator/src/kernel/contracts/index.ts` | T1 |
| `apps/webapp/migrations/012_subscription_mailing.sql` (новый) | T2 |
| `apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts` (новый) | T3 |
| `apps/webapp/src/infra/repos/inMemorySubscriptionMailingProjection.ts` (новый) | T3 |
| `apps/webapp/src/modules/integrator/events.ts` | T4 |
| `apps/webapp/src/app/api/integrator/events/route.ts` | T4 |
| `apps/integrator/src/infra/db/writePort.ts` | T5 |
| `apps/webapp/src/app/api/integrator/subscriptions/topics/route.ts` (новый) | T6 |
| `apps/webapp/src/app/api/integrator/subscriptions/for-user/route.ts` (новый) | T6 |
| `apps/webapp/src/app/api/integrator/subscriptions/mailing-logs/route.ts` (новый, опционально) | T6 |
| `apps/integrator/src/kernel/contracts/ports.ts` (SubscriptionMailingReadsPort) | T7 |
| `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts` (новый) | T7 |
| `apps/integrator/src/infra/db/readPort.ts` | T7 |
| `apps/integrator/src/app/di.ts` | T7 |
| `apps/webapp/src/app-layer/di/buildAppDeps.ts` | T6, T8 |
| `apps/webapp/scripts/backfill-subscription-mailing-domain.mjs` (новый) | T9 |
| `apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs` (новый) | T9 |
| Тесты (unit + API route + ingest) | T10 |
| `scripts/stage11-release-gate.mjs` (новый) | T10 |

---

## Execution order

**T1** → **T2** → **T3** → **T4** → **T5** → **T6** → **T7** → **T8** → **T9** → **T10** (строго по порядку).

---

## T1 (P0): Контракт событий проекции subscription/mailing

**Цель:** зафиксировать типы проекционных событий и форму payload для mailing topics, user subscriptions и mailing logs.

**Текущее состояние:** в `projectionEventTypes.ts` нет типов для subscription/mailing.

**Решение:** добавить константы и типы: `mailing.topic.upserted`, `user.subscription.upserted`, `mailing.log.sent`. Payload — строковые id и нужные поля (см. шаги).

### Шаг T1.1: Добавить типы событий и экспорт

**Файл:** `apps/integrator/src/kernel/contracts/projectionEventTypes.ts`

**Найти:** конец файла (после `APPOINTMENT_RECORD_UPSERTED` и типа `AppointmentProjectionEventType`).

**Добавить:**

```ts
export const MAILING_TOPIC_UPSERTED = 'mailing.topic.upserted';
export const USER_SUBSCRIPTION_UPSERTED = 'user.subscription.upserted';
export const MAILING_LOG_SENT = 'mailing.log.sent';

export type SubscriptionMailingProjectionEventType =
  | typeof MAILING_TOPIC_UPSERTED
  | typeof USER_SUBSCRIPTION_UPSERTED
  | typeof MAILING_LOG_SENT;
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** константы и тип экспортируются; типчек зелёный.

### Шаг T1.2: Экспорт из kernel/contracts/index

**Файл:** `apps/integrator/src/kernel/contracts/index.ts`

**Действие:** добавить экспорт `MAILING_TOPIC_UPSERTED`, `USER_SUBSCRIPTION_UPSERTED`, `MAILING_LOG_SENT` и типа `SubscriptionMailingProjectionEventType` из `projectionEventTypes.js`.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** индекс экспортирует новые символы.

### Шаг T1.3: Верификация задачи T1

**Команда:** `pnpm run ci`

**DoD:** константы и тип событий доступны; CI зелёный.

---

## T2 (P0): Миграция webapp — таблицы subscription/mailing

**Цель:** завести в webapp таблицы для mailing_topics (product), user_subscriptions (product), mailing_logs (audit projection). Ключи по integrator id для идемпотентности и reconciliation.

**Решение:** одна миграция `012_subscription_mailing.sql`.

### Шаг T2.1: Создать файл миграции

**Файл:** создать `apps/webapp/migrations/012_subscription_mailing.sql`

**Содержимое (образец; колонки согласовать с integrator schema):**

```sql
-- Stage 11: Subscription/mailing product and audit (projection from integrator).
-- mailing_topics: product-level категории подписок.
-- user_subscriptions: выбор пользователя по topic.
-- mailing_logs_webapp: audit рассылок (projection из integrator.mailing_logs).

CREATE TABLE IF NOT EXISTS mailing_topics_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_topic_id BIGINT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailing_topics_webapp_integrator_id
  ON mailing_topics_webapp (integrator_topic_id);
CREATE INDEX IF NOT EXISTS idx_mailing_topics_webapp_key ON mailing_topics_webapp (key);

CREATE TABLE IF NOT EXISTS user_subscriptions_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_user_id BIGINT NOT NULL,
  integrator_topic_id BIGINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integrator_user_id, integrator_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_webapp_user
  ON user_subscriptions_webapp (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_webapp_topic
  ON user_subscriptions_webapp (integrator_topic_id);

CREATE TABLE IF NOT EXISTS mailing_logs_webapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_user_id BIGINT NOT NULL,
  integrator_mailing_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integrator_user_id, integrator_mailing_id)
);

CREATE INDEX IF NOT EXISTS idx_mailing_logs_webapp_user ON mailing_logs_webapp (integrator_user_id);
CREATE INDEX IF NOT EXISTS idx_mailing_logs_webapp_mailing ON mailing_logs_webapp (integrator_mailing_id);
```

**Верификация:** файл создан; при необходимости скорректировать типы под существующий integrator (bigint в integrator → в webapp хранить как BIGINT или TEXT по guardrails bigint-safe; в API отдавать строки).

**Критерий успеха:** миграция синтаксически корректна; в run-migrations не ломает (проверить при наличии DATABASE_URL).

### Шаг T2.2: Верификация задачи T2

**Команда:** `pnpm run ci`

**DoD:** миграция добавлена; CI зелёный.

---

## T3 (P0): Webapp — порт проекции и репозитории (pg + inMemory)

**Цель:** определить порт проекции subscription/mailing и реализовать его для pg и in-memory (тесты, отсутствие БД).

**Текущее состояние:** порта и репозиториев для приёма событий mailing.topic.upserted, user.subscription.upserted, mailing.log.sent нет.

**Решение:** ввести тип `SubscriptionMailingProjectionPort` с методами `upsertTopicFromProjection`, `upsertUserSubscriptionFromProjection`, `appendMailingLogFromProjection`; реализовать в `pgSubscriptionMailingProjection.ts` и `inMemorySubscriptionMailingProjection.ts`.

### Шаг T3.1: Тип порта и pg-реализация

**Файл:** создать `apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts`

**Содержимое (сокращённый каркас):**
- Тип `SubscriptionMailingProjectionPort` с методами:
  - `upsertTopicFromProjection(params: { integratorTopicId: number; code: string; title: string; key: string; isActive: boolean; updatedAt: string }) => Promise<void>`
  - `upsertUserSubscriptionFromProjection(params: { integratorUserId: number; integratorTopicId: number; isActive: boolean; updatedAt: string }) => Promise<void>`
  - `appendMailingLogFromProjection(params: { integratorUserId: number; integratorMailingId: number; status: string; sentAt: string; errorText: string | null }) => Promise<void>`
- `createPgSubscriptionMailingProjectionPort(): SubscriptionMailingProjectionPort` — INSERT ... ON CONFLICT DO UPDATE для каждой таблицы; id везде bigint-safe (в БД BIGINT, в аргументах — number для простоты, при API отдавать строки).

**Верификация:** `pnpm --dir apps/webapp typecheck` — без ошибок.

**Критерий успеха:** тип и pg-порт определены; типчек зелёный.

### Шаг T3.2: In-memory реализация

**Файл:** создать `apps/webapp/src/infra/repos/inMemorySubscriptionMailingProjection.ts`

**Содержимое:** объект, реализующий `SubscriptionMailingProjectionPort`, хранящий данные в массивах/Map; экспорт `inMemorySubscriptionMailingProjectionPort`.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** in-memory порт реализован; типчек зелёный.

### Шаг T3.3: Тесты репозиториев

**Файл:** создать `apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.test.ts` (и при необходимости тесты in-memory в том же файле или отдельно). Тесты: upsertTopic идемпотентен по integrator_topic_id; upsertUserSubscription идемпотентен по (integrator_user_id, integrator_topic_id); appendMailingLog не дублирует по (integrator_user_id, integrator_mailing_id).

**Верификация:** `pnpm --dir apps/webapp test -- pgSubscriptionMailingProjection` (и inMemory при наличии).

**Критерий успеха:** тесты зелёные.

### Шаг T3.4: Верификация задачи T3

**Команда:** `pnpm run ci`

**DoD:** порт определён; pg и in-memory реализации есть; тесты проходят; CI зелёный.

---

## T4 (P0): Webapp — ingest событий проекции в handleIntegratorEvent

**Цель:** при приёме событий `mailing.topic.upserted`, `user.subscription.upserted`, `mailing.log.sent` вызывать соответствующий метод порта проекции; валидация payload; при отсутствии порта — не падать (как для appointmentProjection).

**Решение:** в `events.ts` добавить ветки для трёх типов событий; в `events/route.ts` передавать `subscriptionMailingProjection` из deps.

### Шаг T4.1: Обработчики в events.ts

**Файл:** `apps/webapp/src/modules/integrator/events.ts`

**Действие:** добавить константы для типов событий; после обработки `appointment.record.upserted` (и перед `return { accepted: false, reason: 'durable ingest is not implemented' }`) добавить блоки:
- если `deps.subscriptionMailingProjection` и `event.eventType === 'mailing.topic.upserted'`: извлечь из payload integratorTopicId, code, title, key, isActive, updatedAt (все строки или число для id — bigint-safe); вызвать `upsertTopicFromProjection`; при ошибке — `return { accepted: false, reason: '...' }`.
- аналогично для `user.subscription.upserted` (integratorUserId, integratorTopicId, isActive, updatedAt) и `mailing.log.sent` (integratorUserId, integratorMailingId, status, sentAt, errorText).

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** обработчики добавлены; валидация обязательных полей; типчек зелёный.

### Шаг T4.2: Передача порта в route

**Файл:** `apps/webapp/src/app/api/integrator/events/route.ts`

**Действие:** передать в вызов handleIntegratorEvent зависимость `subscriptionMailingProjection: deps.subscriptionMailingProjection` (и добавить её в тип deps, если используется).

**Верификация:** `pnpm --dir apps/webapp typecheck`.

**Критерий успеха:** route передаёт порт; типчек зелёный.

### Шаг T4.3: Тесты ingest

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

**Действие:** добавить тесты: accepts mailing.topic.upserted; rejects без обязательных полей; calls upsertTopicFromProjection with payload when mailing.topic.upserted. Аналогично для user.subscription.upserted и mailing.log.sent (accepts, rejects, calls ... with payload).

**Верификация:** `pnpm --dir apps/webapp test -- events.test.ts`.

**Критерий успеха:** новые тесты зелёные; существующие не сломаны.

### Шаг T4.4: Верификация задачи T4

**Команда:** `pnpm run ci`

**DoD:** ingest трёх типов событий реализован и покрыт тестами; CI зелёный.

---

## T5 (P0): Integrator — writePort: запись и проекция для subscription/mailing

**Цель:** при изменении в integrator данных mailing_topics, user_subscriptions или mailing_logs записывать событие проекции в outbox в той же транзакции (как в Stage 7/9).

**Текущее состояние:** записи в эти таблицы в коде приложения могут отсутствовать (только репозитории в repos/). Необходимо: (1) добавить в writePort мутации типа `mailing.topic.upsert`, `user.subscription.upsert`, `mailing.log.append` (или использовать существующие пути, если они есть); (2) при выполнении мутации — писать в projection_outbox соответствующее событие в той же tx.

**Решение:** ввести в writePort обработку мутаций (или один общий путь), который пишет в таблицы integrator и в projection_outbox. Если текущий код не пишет в mailing_logs/mailing_topics/user_subscriptions через writePort — сначала добавить вызовы репозиториев из writePort при соответствующих мутациях; затем добавление записи в outbox. Idempotency key: детерминированный от бизнес-данных (например `mailing.topic.upserted:${integratorTopicId}`).

### Шаг T5.1: Мутации и репозитории

**Файл:** `apps/integrator/src/kernel/contracts/ports.ts`

**Действие:** добавить в `DbWriteMutationType` типы `'mailing.topic.upsert'`, `'user.subscription.upsert'`, `'mailing.log.append'` (если их ещё нет).

**Верификация:** `pnpm --dir apps/integrator typecheck`.

### Шаг T5.2: writePort — обработка мутаций и outbox

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Действие:** в switch по mutation.type добавить case для `mailing.topic.upsert`: вызвать репозиторий (insert/update mailing_topics), в той же tx вставить в projection_outbox событие `mailing.topic.upserted` с payload. Аналогично для `user.subscription.upsert` (репозиторий subscriptions) и `mailing.log.append` (insert в mailing_logs + outbox `mailing.log.sent`). Использовать `enqueueProjectionEvent` или аналог; idempotency key — детерминированный.

**Верификация:** `pnpm --dir apps/integrator typecheck` и тесты writePort.

**Критерий успеха:** мутации выполняют запись и enqueue в одной tx; типчек и тесты зелёные.

### Шаг T5.3: Тесты writePort для subscription/mailing

**Файл:** создать или дополнить `apps/integrator/src/infra/db/writePort.subscriptionMailing.test.ts`

**Действие:** тесты: mailing.topic.upsert enqueues mailing.topic.upserted; user.subscription.upsert enqueues user.subscription.upserted; mailing.log.append enqueues mailing.log.sent. Проверка payload и idempotency key.

**Верификация:** `pnpm --dir apps/integrator test -- writePort.subscriptionMailing`.

**Критерий успеха:** тесты зелёные.

### Шаг T5.4: Верификация задачи T5

**Команда:** `pnpm run ci`

**DoD:** writePort обновлён; проекция enqueue в той же tx; тесты проходят; CI зелёный.

---

## T6 (P0): Webapp — API для subscriptions (topics, for-user, при необходимости mailing-logs)

**Цель:** предоставить API для integrator и внутреннего использования: список тем подписок, подписки пользователя по integrator user id; при необходимости — лог рассылок. Защита подписью integrator (как в appointments/reminders).

**Решение:** маршруты GET с проверкой подписи; при отсутствии порта проекции — 503.

### Шаг T6.1: GET /api/integrator/subscriptions/topics

**Файл:** создать `apps/webapp/src/app/api/integrator/subscriptions/topics/route.ts`

**Действие:** проверка заголовков x-bersoncare-timestamp, x-bersoncare-signature; canonical GET; verifyIntegratorGetSignature; из deps порт проекции (или репозиторий, читающий из mailing_topics_webapp); вернуть список тем (id как строка, bigint-safe). При отсутствии порта/репозитория — 503.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

### Шаг T6.2: GET /api/integrator/subscriptions/for-user

**Файл:** создать `apps/webapp/src/app/api/integrator/subscriptions/for-user/route.ts`

**Действие:** query param `integratorUserId` (обязателен); проверка подписи; вернуть список активных подписок пользователя (topic_id или topic code). При отсутствии порта — 503.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

### Шаг T6.3: Подключение порта в buildAppDeps

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действие:** создать subscriptionMailingProjectionPort (pg при DATABASE_URL, иначе in-memory); передать в объект deps для API (и в handleIntegratorEvent). Экспортировать в deps для route handlers.

**Верификация:** `pnpm --dir apps/webapp typecheck`.

### Шаг T6.4: Тесты API routes

**Файл:** создать `apps/webapp/src/app/api/integrator/subscriptions/topics/route.test.ts` и `for-user/route.test.ts`. Тесты: 400 при отсутствии заголовков; 401 при неверной подписи; 503 при отсутствии порта; 200 с телом при успехе (мок порта).

**Верификация:** `pnpm --dir apps/webapp test -- subscriptions`.

**Критерий успеха:** тесты зелёные.

### Шаг T6.5: Верификация задачи T6

**Команда:** `pnpm run ci`

**DoD:** API topics и for-user работают; тесты и типчек зелёные; CI зелёный.

---

## T7 (P0): Integrator — SubscriptionMailingReadsPort и делегирование в readPort

**Цель:** читать список тем и подписки пользователя из webapp через адаптер; в readPort при наличии порта делегировать запросы к нему, при отсутствии — fallback на текущее чтение из БД (repos).

**Решение:** ввести тип запроса readPort (например `mailing.topics.list`, `subscriptions.byUser`) и тип `SubscriptionMailingReadsPort`; адаптер вызывает GET webapp с подписью; readPort в соответствующих case вызывает порт или getTopics/getUserSubscriptions.

### Шаг T7.1: Контракт порта и типы запросов

**Файл:** `apps/integrator/src/kernel/contracts/ports.ts`

**Действие:** добавить в `DbReadQueryType` типы `'mailing.topics.list'` и `'subscriptions.byUser'`. Определить тип `SubscriptionMailingReadsPort` с методами `listTopics(): Promise<...>`, `getSubscriptionsByUserId(integratorUserId: string): Promise<...>`. Типы ответа — массивы с полями в строковом виде (bigint-safe).

**Верификация:** `pnpm --dir apps/integrator typecheck`.

### Шаг T7.2: Адаптер subscriptionMailingReadsPort

**Файл:** создать `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts`

**Действие:** по образцу appointmentsReadsPort: функция подписи GET; вызов fetch к APP_BASE_URL + /api/integrator/subscriptions/topics и /api/integrator/subscriptions/for-user; маппинг ответа в формат порта; при ошибке/!ok возвращать [] или null.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

### Шаг T7.3: readPort — делегирование

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Действие:** добавить в createDbReadPort опциональный параметр `subscriptionMailingReadsPort`. В switch: case `mailing.topics.list` — если порт задан, вызвать порт.listTopics(), иначе — listActiveTopics(db). Case `subscriptions.byUser` — если порт задан, вызвать порт.getSubscriptionsByUserId(userId), иначе — getUserSubscriptions(db, userId) и преобразовать Set в массив для консистентности типа.

**Верификация:** `pnpm --dir apps/integrator typecheck`. Импорты: добавить listActiveTopics, getUserSubscriptions из repos при fallback.

### Шаг T7.4: di.ts — создание порта

**Файл:** `apps/integrator/src/app/di.ts`

**Действие:** при наличии APP_BASE_URL и integratorWebhookSecret создавать createSubscriptionMailingReadsPort() и передавать в createDbReadPort; иначе не передавать (fallback на БД).

**Верификация:** `pnpm --dir apps/integrator typecheck`.

### Шаг T7.5: Тесты readPort и адаптера

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts` — добавить тесты: mailing.topics.list делегирует порту при наличии; fallback на DB при отсутствии. subscriptions.byUser — аналогично. Файл `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.test.ts` — мок fetch; проверка URL и заголовков; маппинг ответа; при ошибке — пустой массив.

**Верификация:** `pnpm --dir apps/integrator test -- readPort subscriptionMailingReadsPort`.

**Критерий успеха:** тесты зелёные.

### Шаг T7.6: Верификация задачи T7

**Команда:** `pnpm run ci`

**DoD:** SubscriptionMailingReadsPort и делегирование в readPort работают; тесты и CI зелёные.

---

## T8 (P1): Channel analytics — подтверждение и при необходимости API

**Цель:** убедиться, что delivery-аналитика доступна в webapp для отчётности. Таблица `support_delivery_events` уже есть (009); ingest через `support.delivery.attempt.logged`. При необходимости добавить GET API для админки (например список последних delivery events по каналу или по пользователю).

**Решение:** если в продукте уже есть чтение delivery данных из support_conversations/delivery — ограничиться тестом или сценарием; иначе добавить минимальный GET /api/integrator/delivery-events или документировать использование существующих support API. Задача — проверка, а не обязательное новое API.

### Шаг T8.1: Проверка существующих путей чтения delivery

**Файл:** обзор `apps/webapp/src/infra/repos/pgSupportCommunication.ts` и API support/conversations.

**Действие:** убедиться, что delivery events доступны для чтения (например через существующие методы). Если да — задачу T8 считать выполненной (документировать в плане). Если нет — добавить метод или API и тест.

**Верификация:** `pnpm run ci`

**Критерий успеха:** специалист/админка могут опереться на webapp для delivery-данных; CI зелёный.

---

## T9 (P0): Backfill и reconcile скрипты

**Цель:** однократный перенос данных из integrator в webapp (backfill) и скрипт сравнения для проверки (reconcile).

**Решение:** backfill-subscription-mailing-domain.mjs читает из integrator mailing_topics, user_subscriptions, mailing_logs и upsert в webapp таблицы. reconcile-subscription-mailing-domain.mjs сравнивает количество и при необходимости выборки; exit 0 при пороге несовпадения в пределах N%.

### Шаг T9.1: Backfill скрипт

**Файл:** создать `apps/webapp/scripts/backfill-subscription-mailing-domain.mjs`

**Действие:** подключение к INTEGRATOR_DATABASE_URL и DATABASE_URL; SELECT из mailing_topics, user_subscriptions, mailing_logs; INSERT в mailing_topics_webapp, user_subscriptions_webapp, mailing_logs_webapp с ON CONFLICT DO UPDATE. Параметры --dry-run, --limit. Идентификаторы передавать bigint-safe (числа в запросах допустимы, в API — строки).

**Верификация:** при наличии БД скрипт выполняется без ошибок; без БД — не ломает CI.

### Шаг T9.2: Reconcile скрипт

**Файл:** создать `apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs`

**Действие:** сравнить количество записей (и при необходимости выборку) между integrator и webapp по трём парам таблиц; вывести отчёт; exit 1 если расхождение выше порога (--max-mismatch-percent).

**Верификация:** скрипт запускается; при идентичных данных — exit 0.

### Шаг T9.3: npm scripts

**Файл:** `apps/webapp/package.json`

**Действие:** добавить в scripts: `"backfill-subscription-mailing-domain": "node scripts/backfill-subscription-mailing-domain.mjs"`, `"reconcile-subscription-mailing-domain": "node scripts/reconcile-subscription-mailing-domain.mjs"`.

**Верификация:** `pnpm --dir apps/webapp run backfill-subscription-mailing-domain -- --dry-run` (или без БД — ожидаем сообщение об ошибке подключения).

### Шаг T9.4: Верификация задачи T9

**Команда:** `pnpm run ci`

**DoD:** backfill и reconcile скрипты добавлены; CI зелёный.

---

## T10 (P0): Тесты и e2e-проверка, stage11-gate

**Цель:** полное покрытие новых и изменённых функций тестами; e2e-проверка через gate (reconcile + при необходимости projection-health).

### Шаг T10.1: Сводный прогон тестов

**Команды:** `pnpm --dir apps/integrator test`; `pnpm --dir apps/webapp test`. Убедиться, что все тесты, касающиеся subscription/mailing, ingest, API, readPort, адаптера, проходят.

**Верификация:** все указанные тесты зелёные.

**Критерий успеха:** нет регрессий; новые кейсы покрыты.

### Шаг T10.2: E2e-сценарий (описание)

**Действие:** описать e2e-сценарий для этапа 11 (без обязательного внедрения Playwright): (1) integrator выполняет mailing.topic.upsert или user.subscription.upsert; (2) worker доставляет событие в webapp; (3) webapp возвращает список topics или for-user через API; (4) вызов reconcile завершается с кодом 0. Либо зафиксировать: e2e = запуск reconcile при наличии двух БД.

**Критерий успеха:** сценарий зафиксирован; при наличии БД reconcile выполним.

### Шаг T10.3: Stage 11 gate скрипт

**Файл:** создать `scripts/stage11-release-gate.mjs`

**Действие:** по образцу stage9-release-gate: последовательный запуск projection-health (integrator) и reconcile-subscription-mailing-domain (webapp); exit 0 только если оба успешны; при отсутствии DATABASE_URL/INTEGRATOR_DATABASE_URL — exit 0 с предупреждением (или 1 — на усмотрение плана).

**Верификация:** `pnpm run stage11-gate` при настроенных БД — exit 0; без БД — по документированному поведению.

### Шаг T10.4: Финальная верификация этапа 11

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный.

**DoD этапа 11:**
- Контракт событий проекции subscription/mailing добавлен (T1).
- Миграция webapp 012 создана (T2).
- Порт проекции и pg/inMemory реализации с тестами (T3).
- Ingest трёх типов событий в handleIntegratorEvent и тесты (T4).
- WritePort пишет в integrator и outbox в одной tx (T5).
- API subscriptions (topics, for-user) и тесты (T6).
- SubscriptionMailingReadsPort и делегирование в readPort с fallback (T7).
- Channel analytics проверены или дополнены (T8).
- Backfill и reconcile скрипты и stage11-gate (T9, T10).
- Product-level подписки и аудит рассылок обслуживаются через webapp; runtime (mailings) остаётся в integrator.

---

## Ссылки на guardrails (DB_ZONES_RESTRUCTURE.md)

- Idempotency key детерминированный от бизнес-события.
- Reconciliation обязательна как часть cutover.
- Идентификаторы между сервисами — bigint-safe (строка или decimal string).
- Projection delivery durable: outbox + retry/backoff.

---

## НЕ ДЕЛАТЬ (жёсткие ограничения)

- Не редактировать документы-планы и DB_ZONES_RESTRUCTURE.md.
- Не удалять и не переименовывать таблицы integrator (mailing_topics, user_subscriptions, mailings, mailing_logs).
- Не переносить таблицу `mailings` в webapp (runtime queue остаётся в integrator).
- Не менять семантику `subscriptions.forUser` в contextQueryPort (channel bindings по phone), не ломать существующие вызовы.
- Не удалять репозитории `subscriptions.ts` и `topics.ts` из integrator в рамках этапа 11 (Stage 12 уберёт legacy reads).
- Не добавлять обязательную зависимость от subscriptionMailingReadsPort при старте integrator (оставить опциональной при наличии APP_BASE_URL и webhook secret).
- Не использовать недетерминированные idempotency keys (Date.now(), random) для событий проекции.
