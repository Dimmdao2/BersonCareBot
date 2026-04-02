# Спецификация: нативный модуль записи на приём

---

## 1. Проблема

Сейчас запись на приём — iframe Rubitime (`/app/patient/booking`). Проблемы:

1. **Двойной ввод данных** — пациент вводит телефон и имя в боте/webapp, затем заново в iframe Rubitime
2. **Нет интеграции** — запись в Rubitime не привязана к аккаунту пациента в момент создания (привязка происходит постфактум через webhook)
3. **SMS-расходы** — Rubitime шлёт подтверждения и напоминания через SMS, хотя у пациента уже есть бот
4. **Нет управления** — пациент не может отменить/перенести запись из webapp
5. **Чужой UI** — iframe не вписывается в дизайн, не адаптируется, не управляется

---

## 2. Целевое решение

Собственный UI записи на приём в webapp. Расписание получается из Rubitime API. При создании записи — синхронизация с Rubitime (для совместимости) и Google Calendar. Подтверждения и напоминания — через бота.

---

## 3. Архитектура

### 3.1. Источник расписания

```
Rubitime API2 → Сервис расписания (integrator/webapp) → Кеш (Redis/memory, TTL 5-15 мин) → API endpoint
```

Rubitime предоставляет:
- `get-record` — получить запись по ID
- `update-record` — обновить запись
- `remove-record` — удалить/отменить запись

Дополнительно потребуется API для получения расписания/слотов (уточнить возможности Rubitime API2 или использовать scraping расписания).

### 3.2. Поток создания записи

```
1. Пациент выбирает тип приёма → город (если очный)
2. Пациент видит доступные даты/слоты
3. Пациент подтверждает слот (телефон и email предзаполнены из аккаунта)
4. Backend:
   a. Создаёт запись в локальной БД (таблица bookings)
   b. Синхронизирует в Rubitime (API2)
   c. Создаёт событие в Google Calendar
   d. Отправляет подтверждение пациенту через бота (Telegram/MAX)
   e. Отправляет уведомление врачу
5. Напоминания: за 24ч и за 2ч через бота
```

### 3.3. Поток отмены/переноса

**NOTE (webapp кабинет, 2026-04):** в UI «Мои приёмы» нет inline-отмены; ссылка «Изменить» ведёт на `system_settings.support_contact_url` (например Telegram-бот), где сценарий переноса/отмены обрабатывается оператором/ботом. API `POST /api/booking/cancel` остаётся для интеграций и тестов.

```
1. Пациент нажимает «Отменить» / «Перенести» на карточке записи (или пишет в бот по ссылке «Изменить»)
2. Подтверждение (диалог), если предусмотрено каналом
3. Backend:
   a. Обновляет статус в локальной БД
   b. Вызывает Rubitime API2 remove-record / update-record
   c. Обновляет Google Calendar событие
   d. Уведомляет врача
4. При переносе — возврат к выбору нового слота
```

### 3.4. Синхронизация с Rubitime webhooks

Существующий обработчик Rubitime webhooks (`apps/integrator/src/integrations/rubitime/webhook.ts`) уже получает:
- `event-create-record`
- `event-update-record`
- `event-remove-record`
- `event-delete-record`

При получении — обновляем локальную таблицу `bookings`, если запись создана извне (через сайт Rubitime).

---

## 4. Схема БД

### Таблица `bookings`

```sql
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  -- Тип и место
  booking_type    TEXT NOT NULL CHECK (booking_type IN ('in_person', 'online')),
  city            TEXT,                     -- 'moscow' | 'spb' | NULL (для online)
  category        TEXT NOT NULL,            -- 'rehab_lfk' | 'nutrition' | 'general'
  
  -- Время
  slot_start      TIMESTAMPTZ NOT NULL,
  slot_end        TIMESTAMPTZ NOT NULL,
  
  -- Статус
  status          TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  
  -- Внешние ID
  rubitime_id     TEXT,                     -- ID записи в Rubitime
  gcal_event_id   TEXT,                     -- ID события в Google Calendar
  
  -- Контакты (снимок на момент записи)
  contact_phone   TEXT NOT NULL,
  contact_email   TEXT,
  contact_name    TEXT NOT NULL,
  
  -- Напоминания
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_2h_sent  BOOLEAN DEFAULT FALSE,
  
  -- Мета
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Индексы
  CONSTRAINT bookings_slot_no_overlap 
    EXCLUDE USING gist (
      tstzrange(slot_start, slot_end) WITH &&
    ) WHERE (status = 'confirmed')
);

CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_slot_start ON bookings(slot_start);
CREATE INDEX idx_bookings_rubitime_id ON bookings(rubitime_id);
```

---

## 5. API Endpoints

### `GET /api/booking/slots`

Параметры:
- `type` — `in_person` | `online`
- `city` — `moscow` | `spb` (для in_person)
- `category` — `rehab_lfk` | `nutrition` | `general`
- `date` — `YYYY-MM-DD` (опционально, по умолчанию — ближайшие 14 дней)

Ответ:
```json
{
  "ok": true,
  "slots": [
    { "date": "2026-04-02", "times": ["10:00", "11:30", "14:00"] },
    { "date": "2026-04-03", "times": ["09:00", "12:00"] }
  ]
}
```

### `POST /api/booking/create`

Тело:
```json
{
  "type": "in_person",
  "city": "moscow",
  "category": "general",
  "slotStart": "2026-04-02T10:00:00+03:00",
  "slotEnd": "2026-04-02T11:00:00+03:00",
  "contactName": "Иван Иванов",
  "contactPhone": "+79001234567",
  "contactEmail": "ivan@example.com"
}
```

Ответ:
```json
{
  "ok": true,
  "booking": { "id": "uuid", "status": "confirmed", ... }
}
```

### `POST /api/booking/cancel`

Тело:
```json
{
  "bookingId": "uuid",
  "reason": "Не смогу прийти"
}
```

### `GET /api/booking/my`

Список записей текущего пациента (сессия).

---

## 6. UI: экран записи (пациент)

### Главный экран `/app/patient/cabinet`

```
┌──────────────────────────────────────┐
│ ← Меню          Кабинет       ⚙ 📨  │  PatientHeader
├──────────────────────────────────────┤
│                                      │
│  ┌─ Активные записи ───────────────┐ │
│  │ 2 апреля, 10:00 · Очный приём   │ │  Плоский список строк (как журнал)
│  │ Москва · услуга          [бейдж] │ │  Справа: статус + «Изменить» → Telegram
│  │                    [Изменить]    │ │  (inline «Отменить» в webapp нет)
│  └─────────────────────────────────┘ │
│                                      │
│  ╔═══════════════════════════════╗   │
│  ║  📍 Адрес  📋 Подготовка  💰  ║   │  Ссылки-справки
│  ╚═══════════════════════════════╝   │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │      [ Записаться на приём ]    │ │  Кнопка — раскрывает блок ниже
│  └─────────────────────────────────┘ │
│                                      │
│  (при раскрытии):                    │
│  ┌────────────┬────────────────────┐ │
│  │  Очный     │  Онлайн            │ │  2 колонки
│  │  приём     │  консультация      │ │
│  ├────────────┼────────────────────┤ │
│  │ Москва     │ Реабилитация (ЛФК) │ │
│  │ СПб        │ Нутрициология      │ │
│  └────────────┴────────────────────┘ │
│                                      │
│  ─── Журнал прошедших приёмов ────── │  Ссылка/аккордеон
│                                      │
└──────────────────────────────────────┘
```

### Экран выбора слота

После выбора категории → экран с календарём:

```
┌──────────────────────────────────────┐
│ ← Назад      Выбор времени    ⚙ 📨  │
├──────────────────────────────────────┤
│                                      │
│  Очный приём · Москва                │  Заголовок
│                                      │
│  ┌─ Апрель 2026 ──────────────────┐ │
│  │ Пн Вт Ср Чт Пт Сб Вс         │ │  Мини-календарь
│  │     1 [2] 3  4  5  6          │ │  Доступные дни подсвечены
│  │  7  8  9  10 11 12 13         │ │
│  └────────────────────────────────┘ │
│                                      │
│  2 апреля:                           │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │10:00 │ │11:30 │ │14:00 │        │  Доступные слоты
│  └──────┘ └──────┘ └──────┘        │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │ Имя:    Иван Иванов (из профиля)│ │  Предзаполнено
│  │ Тел:    +7 900 123-45-67       │ │
│  │ Email:  (опционально)          │ │
│  │                                 │ │
│  │        [ Подтвердить запись ]   │ │
│  └─────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

---

## 7. Уведомления

| Событие | Канал | Получатель | Текст (шаблон) |
|---|---|---|---|
| Запись создана | Telegram/MAX бот | Пациент | «Вы записаны на {дата} в {время}. {тип}, {город}.» |
| Запись создана | Webapp / Telegram | Врач | «Новая запись: {имя}, {дата} {время}, {тип}» |
| Напоминание 24ч | Telegram/MAX бот | Пациент | «Напоминаем: завтра {время} — {тип приёма}. {адрес}» |
| Напоминание 2ч | Telegram/MAX бот | Пациент | «Через 2 часа: {тип приёма} в {время}. {адрес}» |
| Запись отменена | Telegram/MAX бот | Врач | «Пациент {имя} отменил запись на {дата} {время}» |

---

## 8. Google Calendar интеграция

### Настройка

- OAuth2 для Google Calendar API (сервисный аккаунт или OAuth consent врача)
- Env-переменные: `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY` (или OAuth tokens)
- Интеграция опциональна — если не настроена, записи работают без Calendar

### События

При создании записи → `calendar.events.insert`:
```json
{
  "summary": "Приём: Иван Иванов",
  "description": "Тип: очный, Москва\nТелефон: +79001234567",
  "start": { "dateTime": "2026-04-02T10:00:00+03:00" },
  "end": { "dateTime": "2026-04-02T11:00:00+03:00" }
}
```

При отмене → `calendar.events.delete` или обновление статуса.

---

## 9. Миграция с iframe

### Шаги

1. Реализовать DB/каталог и репозитории (блок 2.A), Admin UI (блок 2.B), patient flow v2 (блок 2.C), integrator bridge (блок 2.D) — см. `PHASE_2_TASKS.md`
2. Переключить маршрут `/app/patient/cabinet` на новый UI
3. Удалить `/app/patient/booking` (iframe)
4. Обновить Telegram-бот: кнопка «Записаться» → webapp URL нового экрана
5. Оставить Rubitime webhook для обратной совместимости (записи через сайт Rubitime)

### Обратная совместимость

- Rubitime webhook продолжает работать
- Записи из сайта Rubitime синхронизируются в локальную БД
- Локальные записи синхронизируются в Rubitime
- В будущем можно полностью отказаться от Rubitime, оставив только собственный модуль

---

## 10. Открытые вопросы

1. **Rubitime API для слотов** — есть ли API для получения доступных слотов, или только CRUD записей? Если нет — нужен альтернативный источник расписания (Google Calendar free/busy, ручное расписание в БД).
2. **Google Calendar** — сервисный аккаунт или OAuth consent врача?
3. **Длительность слотов** — фиксированная (60 мин) или зависит от типа?
4. **Города** — только Москва и СПб, или список расширяемый?
5. **Категории онлайн** — «Реабилитация (ЛФК)» и «Нутрициология» — это разные специалисты/расписания или один врач?

---

## 11. In-person v2 — очный приём (city + service)

> **Статус:** активная спецификация для booking rework (BRANCH_UX_CMS_BOOKING).  
> Заменяет legacy-подход `city + category` для очного приёма.

### 11.1. Non-goals (scope этого раздела)

- **Online-запись не входит** в этот этап. Всё, что описано ниже, относится исключительно к `booking_type = 'in_person'`.
- Изменения не затрагивают существующий online-поток.

### 11.2. Пользовательский flow (in-person v2)

```
1. Пациент открывает кабинет
2. Выбирает город (например: Москва / СПб)
3. Выбирает услугу (например: Сеанс 60 мин / Сеанс 90 мин)
4. Видит доступные слоты для выбранной связки (city → service → branch → specialist)
5. Подтверждает слот (телефон/имя предзаполнены из профиля)
6. Backend создаёт запись в Rubitime с явными IDs
```

Переход `city → service` соответствует каталогу `booking_branches` / `booking_services` / `booking_branch_services`.

### 11.3. Обязательный payload integrator (in-person v2)

При создании записи webapp отправляет в integrator **явные IDs** без резолва на стороне integrator:

| Поле | Тип | Описание |
|---|---|---|
| `rubitimeBranchId` | `string` | ID филиала в Rubitime (из каталога) |
| `rubitimeCooperatorId` | `string` | ID сотрудника в Rubitime (из каталога) |
| `rubitimeServiceId` | `string` | ID услуги в Rubitime (из каталога) |
| `slotStart` | `string` (ISO 8601) | Дата и время начала слота |

Integrator **не резолвит** `category` или `city` самостоятельно — все ID передаются webapp из каталога.

### 11.4. Изменения схемы БД (in-person v2)

Для поддержки нового flow в `patient_bookings` добавляются FK-поля и snapshot:

- `branch_id UUID` — FK → `booking_branches.id`
- `service_id UUID` — FK → `booking_services.id`
- `branch_service_id UUID` — FK → `booking_branch_services.id` (несёт specialist через связку)
- `rubitime_branch_id_snapshot TEXT` — snapshot на момент записи
- `rubitime_cooperator_id_snapshot TEXT` — snapshot на момент записи
- `rubitime_service_id_snapshot TEXT` — snapshot на момент записи

> Прямая FK `specialist_id` в `patient_bookings` не добавляется — specialist определяется через `branch_service_id` (JOIN на `booking_branch_services.specialist_id`). Полный DDL в `MIGRATION_CONTRACT_V2.md`.

Поле `category TEXT` для очного v2 **не используется**. Совместимость legacy-записей обеспечивается через dual-read (поле остается nullable).

### 11.5. Каталог сущностей

Новые таблицы каталога (подробно в `MIGRATION_CONTRACT_V2.md`):

- `booking_cities` — города присутствия
- `booking_branches` — филиалы, каждый привязан к городу
- `booking_specialists` — сотрудники, каждый привязан к филиалу
- `booking_services` — услуги (глобальные)
- `booking_branch_services` — связка: какая услуга доступна в каком филиале у какого сотрудника (с Rubitime IDs)

### 11.6. Критерии готовности in-person v2

- [ ] Нет требования `category` в flow очного v2
- [ ] Payload integrator содержит только `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId`, `slotStart`
- [ ] Каталог позволяет динамически добавлять города и услуги без деплоя
- [ ] Online-поток не затронут
