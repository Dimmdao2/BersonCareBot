# Stage 9: Online Intake Model (LFK + Nutrition)

Цель: спека и контракты для замены online-записи через Rubitime на intake-сценарий.

## Суть изменения

Online-поток больше **не создаёт запись в Rubitime** напрямую. Вместо этого:

- Пациент заполняет форму/анкету.
- Данные сохраняются как **online intake request** в Webapp DB.
- Врач получает уведомление и сам связывается с пациентом.
- Данные остаются в истории пациента навсегда.

## S9.T01 — Спека online-потоков

### Сценарий A: LFK (ЛФК)

**Trigger:** пациент нажимает «Онлайн → ЛФК».

**Flow:**
1. Страница с текстом: «Опишите проблему, с которой обращаетесь».
2. Поле: многострочное описание (required, min 20 chars).
3. Поле: вложения (optional):
   - file upload (images/pdf/archive, max 20 MB total).
   - URL-поле (ссылка на облако/диск с файлами).
4. Кнопка «Отправить запрос».
5. Success state: «Заявка отправлена. Врач свяжется с вами лично или через приложение».

**Уведомления:** врачу → Telegram + MAX + webapp inbox. В сообщении: имя пациента, краткое описание (первые 200 символов), ссылка на карточку заявки.

### Сценарий B: Nutrition (Нутрициология)

**Trigger:** пациент нажимает «Онлайн → Нутрициология».

**Flow:**
1. Пошаговая анкета (question-by-question). Вопросы:
   - Q1: «Ваш возраст?» (число, required).
   - Q2: «Ваш вес (кг) и рост (см)?» (два числовых поля, required).
   - Q3: «Есть ли хронические заболевания / ограничения в питании?» (textarea, optional).
   - Q4: «Ваша цель (похудение / набор массы / здоровое питание / другое)?» (single-select, required).
   - Q5: «Опишите текущий рацион и запрос к нутрициологу» (textarea, required).
2. Навигация: «Назад» / «Далее» / «Отправить» на последнем шаге.
3. Draft persistence: ответы сохраняются при переходе между шагами.
4. Success state: «Анкета отправлена. Нутрициолог свяжется с вами».

**Уведомления:** врачу → Telegram + MAX + webapp inbox. В сообщении: имя пациента, цель (Q4), ссылка на карточку.

## S9.T02 — Контракт API Online Intake V1

Файл: `API_CONTRACT_ONLINE_INTAKE_V1.md`

### POST /api/patient/online-intake/lfk

**Auth:** required (patient session)

**Request:**
```json
{
  "description": "string (required, min 20, max 5000)",
  "attachmentUrls": ["string (url, optional, max 5)"],
  "attachmentFileIds": ["string (media file id, optional, max 10)"]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "status": "new",
  "type": "lfk",
  "createdAt": "ISO datetime"
}
```

**Errors:** 400 validation, 401 unauth, 429 rate limit (max 3 per day per user).

---

### POST /api/patient/online-intake/nutrition

**Auth:** required (patient session)

**Request:**
```json
{
  "answers": [
    { "questionId": "q1", "value": "28" },
    { "questionId": "q2", "value": "75 / 178" },
    { "questionId": "q3", "value": "нет ограничений" },
    { "questionId": "q4", "value": "healthy_eating" },
    { "questionId": "q5", "value": "описание..." }
  ]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "status": "new",
  "type": "nutrition",
  "createdAt": "ISO datetime"
}
```

**Errors:** 400 (required answers missing / invalid type), 401, 429.

---

### GET /api/patient/online-intake

**Auth:** required (patient session)

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "lfk" | "nutrition",
      "status": "new" | "in_review" | "contacted" | "closed",
      "createdAt": "ISO",
      "summary": "string (first 200 chars)"
    }
  ]
}
```

---

### GET /api/doctor/online-intake

**Auth:** required (doctor or admin role)

**Query:** `?type=lfk|nutrition&status=new&page=1&limit=20`

**Response 200:** список заявок с `patientName`, `patientPhone`, `type`, `status`, `createdAt`, `id`.

---

### GET /api/doctor/online-intake/:id

**Auth:** required (doctor or admin)

**Response 200:** полный объект заявки: description / answers, attachmentUrls, patient contact, status history.

---

### PATCH /api/doctor/online-intake/:id/status

**Auth:** required (doctor or admin)

**Request:**
```json
{ "status": "in_review" | "contacted" | "closed", "note": "string (optional)" }
```

**Response 200:** обновлённый объект.

## S9.T03 — Контракт хранения

Файл: `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md`

### Таблица `online_intake_requests`

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id        UUID NOT NULL REFERENCES platform_users(id)
type           TEXT NOT NULL CHECK (type IN ('lfk', 'nutrition'))
status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','in_review','contacted','closed'))
summary        TEXT            -- first 200 chars of description / first answer
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Таблица `online_intake_answers`

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
request_id     UUID NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE
question_id    TEXT NOT NULL       -- 'lfk_description' | 'q1'...'q5'
ordinal        INT  NOT NULL       -- display order
value          TEXT NOT NULL
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (request_id, question_id)
```

### Таблица `online_intake_attachments`

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
request_id     UUID NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE
attachment_type TEXT NOT NULL CHECK (attachment_type IN ('file', 'url'))
s3_key         TEXT            -- для type='file'
url            TEXT            -- для type='url'
mime_type      TEXT
size_bytes     BIGINT
original_name  TEXT
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Таблица `online_intake_status_history`

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
request_id     UUID NOT NULL REFERENCES online_intake_requests(id) ON DELETE CASCADE
from_status    TEXT
to_status      TEXT NOT NULL
changed_by     UUID REFERENCES platform_users(id)
note           TEXT
changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

## S9.T04 — Privacy и retention

- Patient видит только свои заявки.
- Doctor/admin видят все заявки (scope: all users).
- Данные не удаляются автоматически (no TTL); закрытые (`closed`) заявки архивируются (soft).
- Файлы в S3 следуют общей медиа-политике (retention ≥ 5 лет).
- В ответах API для doctor не раскрывается email/phone без необходимости — только contactName + contactPhone.

## S9.T05 — Notification routing

При создании новой заявки (`status: new`):

1. Webapp events → NotificationService.
2. NotificationService отправляет:
   - **Telegram**: через существующий bot-channel врача. Текст: «Новая заявка [тип]: [имя пациента]. [первые 200 символов описания/цели]. Карточка: <webapp_url>/app/doctor/online-intake/<id>».
   - **MAX**: аналогично.
   - **Webapp inbox**: создаётся notification entry для doctor роли.

Реализация нотификации: через существующий `NotificationService` / bot channel. Deep-link формируется из `PUBLIC_URL` system_setting + `/app/doctor/online-intake/<id>`.

## S9.T06 — Тест-матрица Stage 9

Файл: `TEST_MATRIX_STAGE9.md`

### Happy cases
- H1: LFK submit с описанием → 201, запись в DB, уведомление врачу.
- H2: Nutrition submit с 5 ответами → 201.
- H3: Patient list own requests → правильный список.
- H4: Doctor list all → видит всё.
- H5: Doctor status change → статус обновился + history entry.

### Negative cases
- N1: LFK без description → 400.
- N2: Nutrition с пропущенным required q4 → 400.
- N3: Patient пытается смотреть чужую заявку → 403.
- N4: Patient пытается менять статус → 403.
- N5: Более 3 LFK заявок за день → 429.

### Security cases
- S1: Unauth request → 401.
- S2: Patient auth пытается GET /api/doctor/online-intake → 403.
- S3: XSS в description поле → sanitize at read.
- S4: File upload с опасным mime → rejected.

## S9.T07 — Лог этапа

Заполнить S9.* в EXECUTION_LOG.md.
