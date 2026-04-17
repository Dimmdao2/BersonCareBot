# STAGE 1 Contracts: Reminders

Цель стадии: зафиксировать контрактные изменения по данным, API и бот-UX до реализации S2-S5.

Статус артефакта: contract-only (без применения миграций и без code changes в runtime-модулях в рамках S1). Кодовая реализация контрактов запланирована на S2/S3.

## Задача S1.T01: Расширить доменную модель `ReminderRule`

**Цель:** добавить объектную привязку напоминаний и поля для произвольного напоминания без ломки существующих категорий.

**Предусловия:**
- Текущий `ReminderRule` в `apps/webapp/src/modules/reminders/types.ts` содержит только категорийную модель.
- Таблица `reminder_rules` уже существует (`apps/webapp/migrations/010_reminders_content_access.sql`).

**Файлы для изменения:**
1. `apps/webapp/src/modules/reminders/types.ts` - расширение типа `ReminderRule`.
2. `apps/webapp/src/modules/reminders/ports.ts` - расширение контрактов порта чтения/CRUD.
3. `apps/webapp/src/modules/reminders/service.ts` - валидация матрицы полей объекта.

**Файлы для создания:**
1. `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` - текущая спецификация.

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Ввести новый enum доменной привязки:
   - `linkedObjectType`: `"lfk_complex" | "content_section" | "content_page" | "custom" | null`
2. Добавить новые поля в `ReminderRule`:
   - `linkedObjectType: ReminderLinkedObjectType`
   - `linkedObjectId: string | null`
   - `customTitle: string | null`
   - `customText: string | null`
3. Зафиксировать правила заполнения:
   - `lfk_complex` -> обязателен `linkedObjectId` (UUID комплекса ЛФК), `customTitle/customText = null`
   - `content_section` -> обязателен `linkedObjectId` (slug раздела, например `warmups`)
   - `content_page` -> обязателен `linkedObjectId` (slug страницы контента)
   - `custom` -> `linkedObjectId = null`, обязателен `customTitle`, `customText` опционален
   - `null` -> legacy-правило (текущие категорийные напоминания до миграции данных)
4. Совместимость:
   - поле `category` сохраняется как backward-compatible;
   - существующие категории (`appointment`, `lfk`, `chat`, `important`, `broadcast`) не удаляются.
5. Канонический контракт формы `ReminderRule` (для реализации в S2.T03):

```ts
type ReminderLinkedObjectType =
  | "lfk_complex"
  | "content_section"
  | "content_page"
  | "custom"
  | null;

type ReminderRule = {
  id: string;
  integratorUserId: string;
  category: "appointment" | "lfk" | "chat" | "important" | "broadcast";
  enabled: boolean;
  intervalMinutes: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  fallbackEnabled: boolean;
  linkedObjectType: ReminderLinkedObjectType;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  updatedAt: string;
};
```
6. Явное соответствие имен:
   - DB: `linked_object_type`, `linked_object_id`, `custom_title`, `custom_text`
   - API/TS: `linkedObjectType`, `linkedObjectId`, `customTitle`, `customText`

**Тесты:**
- [ ] Unit: валидация матрицы `linkedObjectType -> required fields`.
- [ ] Unit: legacy-правило (`linkedObjectType = null`) не ломает существующий UI.

**Критерии готовности:**
- [ ] Тип `ReminderRule` содержит 4 новых поля.
- [ ] Документирована матрица валидности полей.
- [ ] Совместимость с текущими категориями сохранена.

---

## Задача S1.T02: Спроектировать миграцию для `reminder_rules` и `reminder_journal`

**Цель:** расширить схему webapp для объектных/пользовательских напоминаний и журнала действий пользователя.

**Предусловия:**
- Существует `reminder_rules` и `reminder_occurrence_history`.
- `integrator_occurrence_id` в `reminder_occurrence_history` уникален.

**Файлы для изменения:**
1. `apps/webapp/migrations/` - добавить draft-миграцию расширения.

**Файлы для создания:**
1. `apps/webapp/migrations/050_reminder_rules_object_links_and_journal.sql` (draft SQL, не apply в рамках S1).

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Расширить `reminder_rules` полями объектной привязки и custom-текста.
2. Создать `reminder_journal` для фиксации пользовательских действий:
   - `done`, `skipped`, `snoozed`
3. Добавить индексы для чтения журнала по правилу, событию и времени.
4. Добавить check constraints на согласованность `action` и payload (`snooze_until`).

**SQL (draft):**

```sql
-- 050_reminder_rules_object_links_and_journal.sql

BEGIN;

ALTER TABLE reminder_rules
  ADD COLUMN IF NOT EXISTS linked_object_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_object_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_title TEXT,
  ADD COLUMN IF NOT EXISTS custom_text TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_linked_object_type'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_linked_object_type
      CHECK (
        linked_object_type IS NULL
        OR linked_object_type IN ('lfk_complex', 'content_section', 'content_page', 'custom')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_object_id_required'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_object_id_required
      CHECK (
        linked_object_type IS NULL
        OR linked_object_type = 'custom'
        OR (linked_object_id IS NOT NULL AND btrim(linked_object_id) <> '')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_custom_required'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_custom_required
      CHECK (
        linked_object_type IS DISTINCT FROM 'custom'
        OR (custom_title IS NOT NULL AND btrim(custom_title) <> '')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_custom_only_for_custom_type'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_custom_only_for_custom_type
      CHECK (
        linked_object_type = 'custom'
        OR (custom_title IS NULL AND custom_text IS NULL)
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_linked_object_type
  ON reminder_rules (linked_object_type)
  WHERE linked_object_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_linked_object
  ON reminder_rules (linked_object_type, linked_object_id)
  WHERE linked_object_type IS NOT NULL AND linked_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_platform_user_updated_at
  ON reminder_rules (platform_user_id, updated_at DESC)
  WHERE platform_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_integrator_user_updated_at
  ON reminder_rules (integrator_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reminder_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
  occurrence_id TEXT NULL REFERENCES reminder_occurrence_history(integrator_occurrence_id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('done', 'skipped', 'snoozed')),
  snooze_until TIMESTAMPTZ NULL,
  skip_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (action = 'snoozed' AND snooze_until IS NOT NULL)
    OR (action <> 'snoozed' AND snooze_until IS NULL)
  ),
  CHECK (skip_reason IS NULL OR length(skip_reason) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_reminder_journal_rule_created_at
  ON reminder_journal (rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_journal_occurrence_id
  ON reminder_journal (occurrence_id, created_at DESC)
  WHERE occurrence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_journal_action_created_at
  ON reminder_journal (action, created_at DESC);

-- Idempotency guards for callback retries / double taps.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_once_done_per_occurrence
  ON reminder_journal (occurrence_id, action)
  WHERE occurrence_id IS NOT NULL AND action = 'done';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_once_skipped_per_occurrence
  ON reminder_journal (occurrence_id, action)
  WHERE occurrence_id IS NOT NULL AND action = 'skipped';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_snooze_dedupe
  ON reminder_journal (occurrence_id, action, snooze_until)
  WHERE occurrence_id IS NOT NULL AND action = 'snoozed' AND snooze_until IS NOT NULL;

COMMIT;
```

Дополнительное требование на hot-path due-occurrence (integrator DB, не эта миграция):

```sql
-- Требуется в integrator schema до запуска S3/Scheduler фич:
CREATE INDEX IF NOT EXISTS idx_user_reminder_occurrences_due
  ON user_reminder_occurrences (status, planned_at)
  WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS idx_user_reminder_rules_enabled
  ON user_reminder_rules (is_enabled, id)
  WHERE is_enabled = true;
```

**Тесты:**
- [ ] Прогон миграции на существующей базе без ошибок.
- [ ] Проверка, что legacy-строки `reminder_rules` не падают на новых constraints.
- [ ] Проверка `reminder_journal` insert для `done/skipped/snoozed`.

**Критерии готовности:**
- [ ] Поля `linked_object_*`, `custom_*` добавлены в схему.
- [ ] Таблица `reminder_journal` создана с индексами и constraints.
- [ ] SQL полностью готов как draft-миграция.

---

## Задача S1.T03: Расширить `reminder_occurrence_history`

**Цель:** хранить последнюю информацию о snooze/skip на уровне occurrence, при детальной истории в `reminder_journal`.

**Предусловия:**
- Существует `reminder_occurrence_history`.
- Добавлен `seen_at` (`032_reminder_seen_status.sql`).

**Файлы для изменения:**
1. `apps/webapp/migrations/` - добавить draft ALTER-миграцию.

**Файлы для создания:**
1. `apps/webapp/migrations/051_reminder_occurrence_actions.sql` (draft SQL, не apply в рамках S1).

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Добавить поля:
   - `snoozed_at`
   - `snoozed_until`
   - `skipped_at`
   - `skip_reason`
2. Добавить constraints консистентности для snooze-пары.
3. Добавить индексы для быстрых выборок по snooze/skip.

**SQL (draft):**

```sql
-- 051_reminder_occurrence_actions.sql

BEGIN;

ALTER TABLE reminder_occurrence_history
  ADD COLUMN IF NOT EXISTS snoozed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_occurrence_snooze_pair'
  ) THEN
    ALTER TABLE reminder_occurrence_history
      ADD CONSTRAINT chk_reminder_occurrence_snooze_pair
      CHECK (
        (snoozed_at IS NULL AND snoozed_until IS NULL)
        OR (snoozed_at IS NOT NULL AND snoozed_until IS NOT NULL)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_occurrence_skip_reason_len'
  ) THEN
    ALTER TABLE reminder_occurrence_history
      ADD CONSTRAINT chk_reminder_occurrence_skip_reason_len
      CHECK (skip_reason IS NULL OR length(skip_reason) <= 500);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_snoozed_until
  ON reminder_occurrence_history (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_skipped_at
  ON reminder_occurrence_history (skipped_at DESC)
  WHERE skipped_at IS NOT NULL;

COMMIT;
```

**Тесты:**
- [ ] Прогон ALTER на базе с данными из `reminder_occurrence_history`.
- [ ] Проверка insert/update snooze и skip полей.

**Критерии готовности:**
- [ ] Поля snooze/skip добавлены.
- [ ] Есть индексы и ограничения консистентности.
- [ ] Draft SQL готов для ревью.

---

## Задача S1.T04: API-контракты для новых endpoint-ов

**Цель:** зафиксировать request/response схемы для CRUD и действий по напоминаниям до реализации route handlers.

**Предусловия:**
- Вышеописанные изменения модели/схемы согласованы.
- Доступ пациента проверяется через `requirePatientAccess`.

**Файлы для изменения:**
1. `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` - спецификация API.

**Файлы для создания:**
- Не требуются (в рамках S1 достаточно контракта).

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Новые endpoint-ы:
   - `POST /api/patient/reminders/create`
   - `PATCH /api/patient/reminders/:id`
   - `DELETE /api/patient/reminders/:id`
   - `GET /api/patient/reminders/list`
   - `POST /api/patient/reminders/:id/snooze`
   - `POST /api/patient/reminders/:id/skip`
2. Семантика `:id`:
   - для `PATCH/DELETE` -> `reminder_rule.integrator_rule_id`
   - для `snooze/skip` -> `integrator_occurrence_id`
3. Общие ошибки:
   - `401 unauthorized`
   - `403 forbidden`
   - `400 validation_error`
   - `404 not_found`
4. Инварианты авторизации/ownership (обязательны для всех patient endpoint-ов):
   - rule endpoint-ы (`PATCH/DELETE`) работают только если правило принадлежит `session.user.userId`
   - occurrence endpoint-ы (`snooze/skip`) работают только если occurrence принадлежит тому же пользователю
   - рекомендуемое поведение при попытке доступа к чужому ресурсу: `404 not_found` (чтобы не раскрывать существование ресурса)
   - любые write-actions должны быть idempotent-safe при повторах запроса/callback

**JSON schema (contract draft):**

### 1) `POST /api/patient/reminders/create`

Request:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["linkedObjectType", "schedule"],
  "properties": {
    "linkedObjectType": {
      "type": "string",
      "enum": ["lfk_complex", "content_section", "content_page", "custom"]
    },
    "linkedObjectId": { "type": ["string", "null"], "minLength": 1, "maxLength": 200 },
    "customTitle": { "type": ["string", "null"], "minLength": 1, "maxLength": 140 },
    "customText": { "type": ["string", "null"], "maxLength": 2000 },
    "enabled": { "type": "boolean", "default": true },
    "schedule": {
      "type": "object",
      "additionalProperties": false,
      "required": ["intervalMinutes", "windowStartMinute", "windowEndMinute", "daysMask"],
      "properties": {
        "intervalMinutes": { "type": "integer", "minimum": 1, "maximum": 1440 },
        "windowStartMinute": { "type": "integer", "minimum": 0, "maximum": 1439 },
        "windowEndMinute": { "type": "integer", "minimum": 1, "maximum": 1440 },
        "daysMask": { "type": "string", "pattern": "^[01]{7}$" }
      }
    }
  }
}
```

Response `201`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "reminder"],
  "properties": {
    "ok": { "const": true },
    "reminder": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "category",
        "enabled",
        "intervalMinutes",
        "windowStartMinute",
        "windowEndMinute",
        "daysMask",
        "linkedObjectType",
        "linkedObjectId",
        "customTitle",
        "customText",
        "updatedAt"
      ],
      "properties": {
        "id": { "type": "string" },
        "category": { "type": "string" },
        "enabled": { "type": "boolean" },
        "intervalMinutes": { "type": ["integer", "null"] },
        "windowStartMinute": { "type": "integer" },
        "windowEndMinute": { "type": "integer" },
        "daysMask": { "type": "string" },
        "linkedObjectType": { "type": ["string", "null"] },
        "linkedObjectId": { "type": ["string", "null"] },
        "customTitle": { "type": ["string", "null"] },
        "customText": { "type": ["string", "null"] },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### 2) `PATCH /api/patient/reminders/:id`

Request:
```json
{
  "type": "object",
  "additionalProperties": false,
  "minProperties": 1,
  "properties": {
    "enabled": { "type": "boolean" },
    "schedule": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "intervalMinutes": { "type": "integer", "minimum": 1, "maximum": 1440 },
        "windowStartMinute": { "type": "integer", "minimum": 0, "maximum": 1439 },
        "windowEndMinute": { "type": "integer", "minimum": 1, "maximum": 1440 },
        "daysMask": { "type": "string", "pattern": "^[01]{7}$" }
      }
    },
    "customTitle": { "type": ["string", "null"], "minLength": 1, "maxLength": 140 },
    "customText": { "type": ["string", "null"], "maxLength": 2000 }
  }
}
```

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "reminder"],
  "properties": {
    "ok": { "const": true },
    "reminder": { "$ref": "#/definitions/reminder" }
  },
  "definitions": {
    "reminder": {
      "type": "object",
      "required": ["id", "linkedObjectType", "enabled", "updatedAt"],
      "properties": {
        "id": { "type": "string" },
        "linkedObjectType": { "type": ["string", "null"] },
        "enabled": { "type": "boolean" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### 3) `DELETE /api/patient/reminders/:id`

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "deletedId"],
  "properties": {
    "ok": { "const": true },
    "deletedId": { "type": "string" }
  }
}
```

### 4) `GET /api/patient/reminders/list`

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "reminders"],
  "properties": {
    "ok": { "const": true },
    "reminders": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "enabled",
          "intervalMinutes",
          "windowStartMinute",
          "windowEndMinute",
          "daysMask",
          "linkedObjectType",
          "linkedObjectId",
          "customTitle",
          "customText",
          "updatedAt"
        ],
        "properties": {
          "id": { "type": "string" },
          "enabled": { "type": "boolean" },
          "intervalMinutes": { "type": ["integer", "null"] },
          "windowStartMinute": { "type": "integer" },
          "windowEndMinute": { "type": "integer" },
          "daysMask": { "type": "string" },
          "linkedObjectType": { "type": ["string", "null"] },
          "linkedObjectId": { "type": ["string", "null"] },
          "customTitle": { "type": ["string", "null"] },
          "customText": { "type": ["string", "null"] },
          "updatedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "stats30d": {
      "type": "object",
      "additionalProperties": false,
      "required": ["done", "skipped", "snoozed"],
      "properties": {
        "done": { "type": "integer", "minimum": 0 },
        "skipped": { "type": "integer", "minimum": 0 },
        "snoozed": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

### 5) `POST /api/patient/reminders/:id/snooze`

Request:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["minutes"],
  "properties": {
    "minutes": { "type": "integer", "enum": [30, 60, 120] }
  }
}
```

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "occurrenceId", "snoozedUntil"],
  "properties": {
    "ok": { "const": true },
    "occurrenceId": { "type": "string" },
    "snoozedUntil": { "type": "string", "format": "date-time" }
  }
}
```

### 6) `POST /api/patient/reminders/:id/skip`

Request:
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reason": { "type": ["string", "null"], "maxLength": 500 }
  }
}
```

### 7) `GET /api/patient/reminders/journal`

Назначение: список действий (`done/skipped/snoozed`) для patient-истории.

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "items"],
  "properties": {
    "ok": { "const": true },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "ruleId", "action", "createdAt"],
        "properties": {
          "id": { "type": "string" },
          "ruleId": { "type": "string" },
          "occurrenceId": { "type": ["string", "null"] },
          "action": { "type": "string", "enum": ["done", "skipped", "snoozed"] },
          "snoozeUntil": { "type": ["string", "null"], "format": "date-time" },
          "skipReason": { "type": ["string", "null"] },
          "createdAt": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

### 8) `GET /api/patient/reminders/journal/stats?days=30`

Назначение: агрегаты для UI "выполнено/пропущено/отложено".

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "stats"],
  "properties": {
    "ok": { "const": true },
    "stats": {
      "type": "object",
      "required": ["done", "skipped", "snoozed"],
      "properties": {
        "done": { "type": "integer", "minimum": 0 },
        "skipped": { "type": "integer", "minimum": 0 },
        "snoozed": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

Контракт происхождения действия `done`:
- `done` фиксируется не из текущей inline-клавиатуры напоминания (MVP S3), а из целевого action в webapp (например, отметка занятия ЛФК после перехода по deep link) через `reminder_journal(action='done')` с привязкой к `occurrenceId`, если он доступен.

Response `200`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "occurrenceId", "skippedAt"],
  "properties": {
    "ok": { "const": true },
    "occurrenceId": { "type": "string" },
    "skippedAt": { "type": "string", "format": "date-time" }
  }
}
```

**Тесты:**
- [ ] Route tests на валидацию schema и коды ответов.
- [ ] Service tests на create/update/delete/snooze/skip.

**Критерии готовности:**
- [ ] Все 6 endpoint-ов имеют зафиксированные schema.
- [ ] В контрактах нет неоднозначности по `:id`.
- [ ] Обработаны базовые коды ошибок.

---

## Задача S1.T05: Inline-keyboard layout и callback format

**Цель:** зафиксировать единый UX кнопок напоминаний для Telegram/MAX и исключить неоднозначность callback payload.

**Предусловия:**
- Текущий `reminders.ts` отправляет текст без inline-кнопок.
- MAX-адаптер уже умеет маппить Telegram `inline_keyboard` в MAX payload.

**Файлы для изменения:**
1. `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` - формирование `replyMarkup`.
2. `apps/integrator/src/integrations/telegram/mapIn.ts` - парсинг новых callback action.
3. `apps/integrator/src/integrations/max/deliveryAdapter.ts` - проверка совместимости callback payload.

**Файлы для создания:**
- Не требуются.

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Основной layout уведомления:

```text
┌─────────────────────────────────────────────┐
│ Напоминание                                │
│ [Открыть видео]                            │
│ [Отложить 30м] [Отложить 60м] [Отложить 120м] │
│ [Пропущу сегодня]                          │
└─────────────────────────────────────────────┘
```

2. Layout выбора причины skip:

```text
┌─────────────────────────────────────────────┐
│ Почему пропускаете?                        │
│ [Боль/дискомфорт] [Нет времени]            │
│ [Плохо себя чувствую] [Другая причина]     │
│ [Без комментария]                          │
└─────────────────────────────────────────────┘
```

3. Callback-data формат:
   - `rem_open:{ruleId}`
   - `rem_snooze:{occurrenceId}:{minutes}` (`minutes` in `30|60|120`)
   - `rem_skip:{occurrenceId}` (открыть выбор причины)
   - `rem_skip_r:{occurrenceId}:{reasonCode}` (`pain|time|fatigue|none|other`)
4. Ограничения:
   - `callback_data <= 64 bytes`
   - если `occurrenceId` может превысить лимит, использовать краткий токен `occRef` и серверный lookup.
5. Flow snooze:
   - callback -> проверка owner -> запись в `reminder_journal(action='snoozed')`
   - update `reminder_occurrence_history.snoozed_at/snoozed_until`
   - перепланирование следующей отправки на `snoozed_until`
   - при повторном callback с тем же `(occurrenceId, minutes)` действие идемпотентно (без дублей журнала/перепланирования)
6. Flow skip -> comment:
   - callback `rem_skip:*` -> показать keyboard причин
   - preset-причина -> запись `action='skipped'`
   - `reasonCode=other` -> состояние `waiting_skip_reason:{occurrenceId}`
   - следующий текст пользователя сохраняется как `skip_reason` и **не пересылается админу**
   - после сохранения причины: обязательный ack (`"Причина сохранена"`) и перевод состояния в `idle` (terminal step, без циклов)

**Тесты:**
- [ ] Unit: callback parser (`mapIn`) для `rem_open/rem_snooze/rem_skip/rem_skip_r`.
- [ ] Unit: проверка длины callback_data <= 64.
- [ ] Integration: MAX payload эквивалентен Telegram inline layout.

**Критерии готовности:**
- [ ] Зафиксирован единый keyboard layout.
- [ ] Зафиксирован callback-data контракт.
- [ ] Описаны snooze/skip state transitions.

---

## Задача S1.T06: UX фикс вопросов ("Отправить ваш вопрос Дмитрию?")

**Цель:** исключить автоматическую отправку текста админу без явного подтверждения пользователя.

**Предусловия:**
- В шаблонах есть `confirmQuestion`, `questionAccepted`, `questionCancelled`.
- Текущий сценарий использует только кнопку "Отправить вопрос" (без "Нет").

**Файлы для изменения:**
1. `apps/integrator/src/content/telegram/user/templates.json` - текст подтверждения.
2. `apps/integrator/src/content/telegram/user/scripts.json` - inline-кнопки `[Да] [Нет]`.
3. `apps/integrator/src/kernel/domain/usecases/handleMessage.ts` - fallback-логика legacy flow.
4. `apps/integrator/src/kernel/domain/usecases/handleUpdate.ts` - обработка callback для yes/no (если не только script path).

**Файлы для создания:**
- Не требуются.

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Обновить prompt:
   - было: `Отправить этот вопрос Дмитрию?`
   - стало: `Отправить ваш вопрос Дмитрию?`
2. Inline-клавиатура подтверждения (1 ряд):
   - `[Да]` -> `q_confirm:yes`
   - `[Нет]` -> `q_confirm:no`
3. Поведение:
   - `yes` -> отправить администратору (`adminForward`) + `questionAccepted` + `state=idle`
   - `no` -> не отправлять админу, отменить draft, `state=idle`, отправить `questionCancelled`
4. Требование безопасности:
   - пока пользователь в состоянии skip-reason (`waiting_skip_reason:*`) или question-confirm, входящий текст не уходит в `adminForward` без явного `yes`.

**Тесты:**
- [ ] Unit: `q_confirm:yes` пересылает вопрос.
- [ ] Unit: `q_confirm:no` не пересылает вопрос.
- [ ] Regression: обычный support relay не ломается.

**Критерии готовности:**
- [ ] Подтверждение вопроса всегда 2-кнопочное (да/нет).
- [ ] При `no` нет отправки в админский чат.
- [ ] Текст шаблона совпадает с UX-требованием.

---

## Задача S1.T07: Формат deep link для ЛФК и разминок

**Цель:** унифицировать deeplink-URL из бот-напоминаний в webapp.

**Предусловия:**
- Пациентские маршруты webapp:
  - `/app/patient/diary?tab=lfk`
  - `/app/patient/sections/[slug]`
  - `/app/patient/content/[slug]`

**Файлы для изменения:**
1. `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` - URL builder по `linkedObjectType`.

**Файлы для создания:**
- Не требуются.

**Файлы для удаления:**
- Не требуются.

**Детальное описание:**
1. Источник base URL:
   - primary: `system_settings(scope='admin')` ключ публичного base URL webapp;
   - fallback (compat): `APP_BASE_URL`.
2. Форматы:
   - `lfk_complex`:
     - `{BASE_URL}/app/patient/diary/lfk/journal?complexId={linkedObjectId}&from=reminder`
   - `content_section` (разминки):
     - `{BASE_URL}/app/patient/sections/{linkedObjectId}?from=reminder`
     - для warmups: `{BASE_URL}/app/patient/sections/warmups?from=reminder`
   - `content_page`:
     - `{BASE_URL}/app/patient/content/{linkedObjectId}?from=reminder`
3. Правила:
   - `linkedObjectId` URL-encode;
   - только `https://` в production;
   - одна и та же HTTPS-ссылка используется в Telegram и MAX (webview/browser fallback);
   - при отсутствии `linkedObjectId` fallback на `/app/patient/reminders?from=reminder`.

**Тесты:**
- [ ] Unit: URL builder для `lfk_complex`, `content_section`, `content_page`.
- [ ] Unit: fallback path при пустом `linkedObjectId`.

**Критерии готовности:**
- [ ] Формат deeplink покрывает ЛФК-комплексы и разминки.
- [ ] Есть fallback и правила URL-encode.
- [ ] Контракт готов для реализации в S3.T05.

---

## Примечание по нумерации миграций

В текущем репозитории номера `048` и `049` уже заняты другими миграциями (`048_online_intake.sql`, `049_patient_bookings_compat_source.sql`), поэтому для напоминаний в этой спецификации использованы `050` и `051`.

**Синхронизация с PLAN:** номера `050`/`051` и имена файлов согласованы с `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md` (S2.T01/S2.T02).
