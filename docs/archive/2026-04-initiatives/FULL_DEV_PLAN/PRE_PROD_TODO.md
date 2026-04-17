# PRE_PROD_TODO — Задачи до продакшена

Дата: 2026-03-25  
Статус: **обязательно перед релизом**  
Связь: `POST_PROD_TODO.md` — задачи после стабилизации prod.

---

## 1. Перенос ключей интеграций из env в admin/DB

### 1.1 Текущее состояние (as-is)

Все ключи и URI интеграций читаются из env при старте:

- **Webapp** (`apps/webapp/src/config/env.ts`):
  - `INTEGRATOR_SHARED_SECRET`, `INTEGRATOR_WEBAPP_ENTRY_SECRET`, `INTEGRATOR_WEBHOOK_SECRET`
  - `INTEGRATOR_API_URL`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`
  - `YANDEX_OAUTH_CLIENT_ID`, `YANDEX_OAUTH_CLIENT_SECRET`, `YANDEX_OAUTH_REDIRECT_URI`
  - `MEDIA_TEST_VIDEO_URL`, `MEDIA_STORAGE_DIR`

- **Integrator** (`apps/integrator/src/config/env.ts`):
  - `INTEGRATOR_SHARED_SECRET`, `INTEGRATOR_WEBAPP_ENTRY_SECRET`, `INTEGRATOR_WEBHOOK_SECRET`
  - `BOOKING_URL`, `CONTENT_SERVICE_BASE_URL`, `CONTENT_ACCESS_HMAC_SECRET`, `APP_BASE_URL`
  - `GOOGLE_CALENDAR_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`, `GOOGLE_REFRESH_TOKEN`

В БД (`system_settings`, scope=admin) уже есть:
- `dev_mode`, `debug_forward_to_admin`, `sms_fallback_enabled`, `important_fallback_delay_minutes`, `integration_test_ids`
- API: `PATCH /api/admin/settings` с role=admin guard и audit log

### 1.2 Целевая модель

| Тип настройки | Источник истины | Fallback |
|---------------|----------------|----------|
| **Non-secret runtime** (URI, флаги, лимиты) | `system_settings` в БД, scope=admin | env (для bootstrap) |
| **Whitelist IDs** (п. 2) | `system_settings` в БД, scope=admin | env (для bootstrap) |
| **Secrets** (токены, HMAC-ключи, OAuth-секреты) | env / secret-store | нет fallback |

Секреты **остаются в env** (или переедут в secret-store позже). В админку переезжают **non-secret настройки и URI**.

### 1.3 План реализации

#### Шаг 1: Расширить system_settings (миграция)

- Добавить новые ключи в `ALLOWED_KEYS` (`system_settings/types.ts`):
  - `integrator_api_url`
  - `booking_url`
  - `content_service_base_url`
  - `telegram_bot_username`
  - `google_calendar_enabled`
  - `google_calendar_id`
  - `google_redirect_uri`
  - `yandex_oauth_client_id`
  - `yandex_oauth_redirect_uri`
- SQL миграция: seed начальных значений из текущего env (для каждого нового ключа).
- Scope: `admin`.

#### Шаг 2: Адаптер dual-read для runtime

- Создать `modules/system-settings/configAdapter.ts`:
  - `getConfigValue(key, scope)`: сначала БД, fallback в env если значение null/empty.
  - In-memory TTL-кэш (60 сек) для горячих путей (не ходить в БД на каждый запрос).
  - Инвалидация кэша при PATCH /api/admin/settings.
- Интегрировать адаптер в те места, где сейчас прямой `env.XXX`:
  - `relayOutbound.ts` → `INTEGRATOR_API_URL`
  - `notifyIntegrator.ts` → `INTEGRATOR_API_URL`
  - `channelLink.ts` → `TELEGRAM_BOT_USERNAME`
  - и др.

#### Шаг 3: Расширить admin API

- Добавить новые ключи в `ADMIN_SCOPE_KEYS` в `apps/webapp/src/app/api/admin/settings/route.ts`.
- UI: секция "Интеграции" в Admin Settings: поля для URI, флагов, имени бота.
- Маскирование: не показывать секреты; для non-secret показывать текущее значение.

#### Шаг 4: Аналогичный адаптер для integrator

- Integrator не имеет прямого доступа к webapp DB.
- Вариант A: integrator делает HTTP запрос к webapp `GET /api/integrator/config` (подписанный HMAC) для получения non-secret настроек.
- Вариант B: integrator читает из своей копии, а webapp при изменении шлёт push-нотификацию.
- **Рекомендация**: вариант A (проще, HTTP-first подход). Кэш на стороне integrator с TTL.
- Секреты (HMAC, OAuth tokens) остаются в env integrator.

#### Шаг 5: Тесты

- Unit: configAdapter dual-read, кэш, инвалидация.
- Integration: admin API PATCH → configAdapter возвращает новое значение.
- E2E: изменить `integrator_api_url` в админке → relay-outbound использует новый URL.

#### Шаг 6: Runbook (cutover)

1. Деплой миграции → seed из текущих env значений.
2. Верифицировать: значения в БД совпадают с env.
3. Включить dual-read (DB-first, env-fallback).
4. Убрать устаревшие non-secret ключи из `.env` (опционально, после стабилизации).

---

## 2. Перенос whitelist ID в admin/DB

### 2.1 Текущее состояние (as-is)

Whitelist ID хранятся в env webapp:
- `ALLOWED_TELEGRAM_IDS` — кто может входить через Telegram
- `ALLOWED_MAX_IDS` — кто может входить через Max
- `ADMIN_MAX_IDS`, `DOCTOR_MAX_IDS` — роли по Max ID
- `ADMIN_TELEGRAM_ID`, `DOCTOR_TELEGRAM_IDS` — роли по Telegram ID
- `ADMIN_PHONES`, `DOCTOR_PHONES`, `ALLOWED_PHONES` — роли и whitelist по телефону

Используются в `apps/webapp/src/modules/auth/service.ts` для:
- Определения роли (admin/doctor/patient) при входе через мессенджер.
- Whitelist проверки (разрешён ли вход для данного ID/телефона).

### 2.2 Целевая модель

Все whitelist/role-map хранятся в `system_settings` (scope=admin) как JSON-массивы:
- `allowed_telegram_ids`: `string[]`
- `allowed_max_ids`: `string[]`
- `admin_telegram_ids`: `string[]`
- `doctor_telegram_ids`: `string[]`
- `admin_max_ids`: `string[]`
- `doctor_max_ids`: `string[]`
- `admin_phones`: `string[]`
- `doctor_phones`: `string[]`
- `allowed_phones`: `string[]`

### 2.3 План реализации

#### Шаг 1: Миграция + seed

- Добавить ключи в `ALLOWED_KEYS`.
- SQL seed: парсинг текущих env-значений в JSON-массивы (или пустые массивы — заполнить при первом запуске admin).

#### Шаг 2: Адаптер для auth service

- В `modules/auth/service.ts` заменить прямые `env.ALLOWED_TELEGRAM_IDS.split(',')` на вызов `configAdapter.getConfigValue('allowed_telegram_ids', 'admin')`.
- Кэш с TTL (60 сек) — допустимо для whitelist (изменения не мгновенные, но в пределах минуты).
- Env fallback если БД пуста.

#### Шаг 3: Admin UI

- Секция "Whitelist и роли" в Admin Settings.
- Поля: textarea с ID через запятую или chip-input.
- Валидация: непустые строки, уникальность.

#### Шаг 4: Тесты

- Unit: auth service с whitelist из configAdapter.
- Integration: PATCH whitelist → auth отдаёт новую роль.
- E2E: добавить ID в whitelist через admin → пользователь может войти.

---

## 3. Завершить durable dispatch для важных сообщений

### 3.1 Текущее состояние (as-is)

**Что работает:**

1. **Integrator scheduler** (`infra/runtime/scheduler/main.ts`) — цикл `schedule.tick` → `reminders.dispatchDue`:
   - Читает `reminders.occurrences.due` из БД.
   - Помечает occurrences как `queued`.
   - Строит `OutgoingIntent` → **только Telegram** (`delivery.channels: ['telegram']`, `recipient: { chatId }`).
   - Dispatch через `dispatchPort.dispatchOutgoing` → Telegram adapter.

2. **Channel adapters** в integrator:
   - `createTelegramDeliveryAdapter` — отправка в Telegram
   - `createMaxDeliveryAdapter` — отправка в Max (если enabled)
   - `createSmscDeliveryAdapter` — отправка SMS через SMSC

3. **Relay-outbound** (webapp → integrator):
   - `relayOutbound.ts` (webapp) → `POST /api/bersoncare/relay-outbound` (integrator)
   - HMAC-подписанный, с idempotency, с retry (4 попытки)
   - Работает для: doctor messages → patient (telegram, max, sms)
   - Email — не реализован (возвращает null intent)

4. **Delivery targets API**:
   - `getDeliveryTargetsForUser(userId, bindings, preferencesPort)` — фильтрует каналы по предпочтениям
   - `channelBindingsToTargets` (integrator) — конвертирует bindings → targets

5. **Webapp handleReminderDispatch** — **STUB**, `accepted: false`.

6. **Policy в system_settings**:
   - `important_fallback_delay_minutes` — уже есть в БД, управляется из admin API
   - `sms_fallback_enabled` — уже есть
   - `dev_mode` + `integration_test_ids` — guard

**Что НЕ работает (gap):**

- `reminders.dispatchDue` отправляет **только в Telegram**, не использует `channelBindings`
- Нет multi-channel fan-out для important категории
- Нет read-confirmation tracking (open/click webhook)
- Нет SMS fallback после таймаута
- `handleReminderDispatch` в webapp — stub
- Нет delivery history / status tracking per channel per occurrence

### 3.2 Архитектура решения

```
┌──────────────┐    schedule.tick    ┌─────────────────────┐
│  Scheduler   │ ──────────────────> │ reminders.dispatchDue│
│  (integrator)│                     │   (handler)          │
└──────────────┘                     └────────┬────────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │ Delivery Policy     │
                                    │ Engine              │
                                    │ (по категории)      │
                                    └─────────┬──────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          │                   │                   │
                   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
                   │ Telegram    │    │ Max         │    │ Email       │
                   │ adapter     │    │ adapter     │    │ adapter     │
                   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
                          │                   │                   │
                   ┌──────▼───────────────────▼───────────────────▼─────┐
                   │          delivery_log (per channel per occ)        │
                   └──────────────────────┬────────────────────────────┘
                                          │
                                  ┌───────▼────────┐
                                  │ SMS Fallback   │
                                  │ Worker         │
                                  │ (after delay)  │
                                  └────────────────┘
```

**Ключевое решение**: dispatch целиком живёт в **integrator** (там уже есть scheduler, adapters, worker). Webapp не нужен в dispatch-цепочке для reminders.

### 3.3 План реализации (для декомпозиции агентом)

#### Шаг 1: Delivery policy engine

**Файл**: `apps/integrator/src/kernel/domain/reminders/deliveryPolicy.ts`

Определить delivery-стратегию по категории:

| Категория | Каналы | SMS fallback | Confirmed-read |
|-----------|--------|-------------|----------------|
| `exercise` | telegram (primary) | нет | нет |
| `hydration` | telegram (primary) | нет | нет |
| `important` | все привязанные (telegram + max + email) | да, после delay | да |
| `posture` | telegram (primary) | нет | нет |

Интерфейс:
```typescript
type DeliveryStrategy = {
  channels: ('telegram' | 'max' | 'email' | 'sms')[];
  requireConfirmedRead: boolean;
  smsFallbackEnabled: boolean;
  smsFallbackDelayMinutes: number;
};

function getDeliveryStrategy(category: ReminderCategory, settings: SystemSettings): DeliveryStrategy;
```

`smsFallbackDelayMinutes` читать из `important_fallback_delay_minutes` (system_settings).

#### Шаг 2: Расширить reminders.dispatchDue для multi-channel

**Файл**: `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`

Текущий код (строит intent только для Telegram):
```typescript
intents.push({
  type: 'message.send',
  payload: {
    recipient: { chatId: occ.chatId },
    delivery: { channels: ['telegram'], maxAttempts: 1 },
  },
});
```

Изменить:
1. Для каждого occurrence — получить `channelBindings` пользователя (из DB или кэша).
2. Вызвать `getDeliveryStrategy(occ.category, settings)`.
3. Для каждого канала в strategy.channels — если есть binding — создать отдельный intent.
4. Записать в `delivery_log` запись per channel per occurrence.

Для получения channel bindings нужен новый read query:
```typescript
deps.readPort.readDb({ type: 'user.channelBindings', params: { userId: occ.userId } })
```

#### Шаг 3: Таблица delivery_log (миграция integrator)

```sql
CREATE TABLE IF NOT EXISTS reminder_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  channel       TEXT NOT NULL,        -- 'telegram' | 'max' | 'email' | 'sms'
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | delivered | read | failed
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rdl_occurrence ON reminder_delivery_log(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_rdl_pending_fallback ON reminder_delivery_log(status, created_at)
  WHERE status IN ('sent', 'delivered');
```

#### Шаг 4: SMS Fallback Worker

**Файл**: `apps/integrator/src/kernel/domain/reminders/smsFallbackWorker.ts`

Логика (выполняется периодически, как scheduler tick):
1. Найти записи в `reminder_delivery_log` где:
   - `status` IN ('sent', 'delivered') — отправлено, но не прочитано
   - `created_at` < now() - `smsFallbackDelayMinutes`
   - Категория occurrence = `important`
   - Для этого occurrence ещё не было SMS-попытки
2. Для каждой такой записи:
   - Получить телефон пользователя из `platform_users`
   - Создать SMS intent через `smsc` adapter
   - Записать в `delivery_log` запись channel=sms

Можно встроить как дополнительный action `reminders.smsFallback` в существующий scheduler-цикл.

#### Шаг 5: Read-confirmation webhook

Для отслеживания read/open нужен webhook от мессенджера:
- **Telegram**: бот не получает уведомлений о прочтении (ограничение API). Fallback: считать "доставлено" = Telegram API вернул ok.
- **Max**: проверить Max Bot API на наличие read receipts.
- **Email**: tracking pixel или click-through link.

**Прагматичный MVP**: считать `delivered` (adapter вернул ok) достаточным. SMS fallback срабатывает только если ни один канал не вернул ok после delay.

#### Шаг 6: Anti-spam / dedup / лимиты

**Файл**: `apps/integrator/src/kernel/domain/reminders/deliveryLimiter.ts`

- Лимит: max 20 уведомлений / день / пользователь.
- Dedup: idempotencyKey = `${occurrenceId}:${channel}` — уже есть паттерн в relay-outbound.
- Batch pause: если несколько occurrences для одного пользователя за < 30 сек — группировать.

Проверка лимита перед dispatch:
```typescript
const todayCount = await readPort.readDb({
  type: 'reminders.delivery.countToday',
  params: { userId },
});
if (todayCount >= 20) return skip;
```

#### Шаг 7: Убрать stub в webapp

- `handleReminderDispatch` → либо удалить (если webapp не участвует в dispatch-цепочке), либо переделать в lightweight status endpoint (integrator → webapp: "reminder delivered", webapp → обновить `reminder_seen_status`).
- Пересмотреть контракт `POST /api/integrator/reminders/dispatch` в `INTEGRATOR_CONTRACT.md`.

#### Шаг 8: Тесты

- Unit: `deliveryPolicy` — стратегия по категории.
- Unit: `deliveryLimiter` — лимиты, dedup.
- Integration: `reminders.dispatchDue` с multi-channel → проверить intents для каждого канала.
- Integration: SMS fallback worker — срабатывает после delay.
- Nock: adapter calls (telegram, max, smsc) — nock-покрытие.

#### Шаг 9: Обновление документации

- `INTEGRATOR_CONTRACT.md`: обновить секцию reminders dispatch.
- `POST_PROD_TODO.md`: пометить 3.1 как завершённый.

---

## 4. Карта пациента (Stage 17) — анализ готовности

### 4.1 Что есть в планах

**Из `RAW_PLAN.md`** (секция "Ещё не описано"):
- Заведение истории приема: анамнез, жалобы (симптомы), осмотр, предположение/диагноз, рекомендации
- Связь с динамикой дневников (из дневника и то что отметил специалист)
- Первичный/повторный приём, дата рождения, вес, рост, авто-расчёт ИМТ, анамнез заболеваний
- В записях — услуга, длительность, филиал
- Доктор может перенести/отменить запись из приложения (webhook в rubitime и календарь, уведомление клиенту)

**Из `RAW_PLAN.md`** (секция 7, «Клиенты»):
- ФИО и контакты (телефон — кнопка звонка, мессенджеры — кнопки перехода)
- Кнопка «Открыть карту клиента»
- Блок записей на приём + история записей
- «Создать из записи на прием» — подстановка данных из записи

**Из `ROADMAP.md`** (Stage 17):
- DB: `patient_cards`, `patient_visits`
- API: CRUD
- UI: карта пациента, история визитов, динамика симптомов
- UI: форма записи визита (тип, жалобы, осмотр, диагноз, рекомендации)

**Из `MASTER_PLAN_EXEC.md`**:
- Stage 17 не входил в execution pipeline A–G

### 4.2 Что уже есть в коде

- **`platform_users`** — базовые данные пользователей (ФИО, телефон, email, channel bindings)
- **`doctor_appointments`** — записи на приём (из rubitime webhook), статусы, история
- **Дневники** — `symptom_trackings`, `lfk_sessions` — динамика симптомов привязана к userId
- **Справочники** — `reference_categories`, `reference_items` (типы симптомов, регионы, диагнозы, стадии)
- **Модуль doctor-clients** — список клиентов, карточки подписчиков, фильтры

### 4.3 Чего НЕ ХВАТАЕТ для начала реализации

| # | Что нужно | Статус |
|---|-----------|--------|
| 1 | **Схема БД `patient_cards`** — точные поля, типы, constraints | Не определены. Нужно: id, user_id (FK → platform_users), date_of_birth, weight_kg, height_cm, bmi (computed), medical_history (text/jsonb), created_at, updated_at, created_by (FK → doctor) |
| 2 | **Схема БД `patient_visits`** — поля визита | Не определены. Нужно: id, card_id (FK → patient_cards), visit_date, visit_type (enum: первичный/повторный), complaint (text), examination (text), diagnosis_text, diagnosis_ref_id (FK → reference_items), stage_ref_id, recommendations (text), service_name, duration_minutes, branch, appointment_id (FK → doctor_appointments, nullable), created_by, created_at |
| 3 | **Связь card ↔ diary** — как динамика дневников привязывается к карте | Через `user_id`: карта → user_id → symptom_trackings/lfk_sessions. Нет дополнительной привязки к визитам (нужна?). **Решение владельца**: достаточно ли связи через user_id или нужна привязка конкретных записей дневника к конкретному визиту? |
| 4 | **Связь card ↔ appointments** — как записи из rubitime привязываются к визитам | Через `appointment_id` в `patient_visits` (nullable). Нужен ли маппинг 1:1 или визит может быть без записи из rubitime? **Решение владельца**: создавать визит автоматически из записи или вручную? |
| 5 | **UI wireframes** — точная компоновка полей | Не описана. Из плана: ФИО+контакты → кнопка «Открыть карту» → данные карты → визиты. Нужно решение: одностраничная карта с вкладками или отдельные экраны? |
| 6 | **Workflow визита** — статусы, жизненный цикл | Не описан. Draft → completed? Можно ли редактировать завершённый визит? |
| 7 | **Права доступа** — кто может создавать/редактировать карту | Подразумевается: только doctor/admin. Нужно подтверждение. |
| 8 | **Экспорт/печать** | Не упоминается в текущих планах, но типично для медкарт. **Решение владельца**: нужен ли на первом этапе? |

### 4.4 Что нужно от владельца перед стартом Stage 17

1. Подтвердить или дополнить поля `patient_cards` (п. 1 выше).
2. Подтвердить или дополнить поля `patient_visits` (п. 2 выше).
3. Решить по связи diary ↔ visits (п. 3).
4. Решить по автосозданию визитов из записей rubitime (п. 4).
5. Выбрать layout: вкладки vs отдельные экраны (п. 5).
6. Определить workflow визита (п. 6).
7. Подтвердить, что экспорт/печать не нужен на первом этапе (п. 8).

---

## Зависимости между пунктами

```
[1] Ключи → admin/DB ──┐
                        ├──→ [Stage 17] Карта пациента (post-prod)
[2] Whitelist → admin/DB┘

[3] Durable dispatch ────→ независим, можно параллельно с [1]+[2]
```

Пункты 1 и 2 можно объединить в один пакет реализации (общий configAdapter, одна миграция, один набор тестов).

Пункт 3 — отдельный пакет, параллелен с 1+2.

Stage 17 — следующий после 1+2, пока в статусе «ожидает решений владельца» (см. 4.4).
