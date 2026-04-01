# API Contract v2: webapp ↔ integrator (booking in-person)

**Дата:** 2026-04-01  
**Scope:** только `booking_type = 'in_person'`. Online-запись не затронута.  
**Транспорт:** HTTPS, JSON, HMAC M2M подпись (существующий механизм `x-bersoncare-timestamp` / `x-bersoncare-signature`).

---

## Ключевой принцип

Webapp резолвит Rubitime IDs из локального каталога (`booking_branch_services`) и передаёт их в integrator явно.  
Integrator **не резолвит** `city`, `category` или `bookingProfileId` самостоятельно для in-person v2.

**NOTE (дискриминант v2):** в теле M2M нет поля `type: "in_person"`. Ветка v2 определяется только полем `"version": "v2"`. Поля `category` / `city` в v2 **не передаются** и не используются integrator для резолва. Очный поток на стороне webapp — единственный источник вызовов с `version: "v2"` (online остаётся на непомеченном v1 body).

---

## 1. POST /api/bersoncare/rubitime/slots (v2)

Получение доступных слотов для конкретной связки branch-service.

### Request

```
POST /api/bersoncare/rubitime/slots
Content-Type: application/json
x-bersoncare-timestamp: <unix_ms>
x-bersoncare-signature: <hmac_sha256>
```

**Body:**

```json
{
  "version": "v2",
  "rubitimeBranchId": "17356",
  "rubitimeCooperatorId": "34729",
  "rubitimeServiceId": "67591",
  "slotDurationMinutes": 60,
  "dateFrom": "2026-04-10",
  "dateTo": "2026-04-10"
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `version` | `"v2"` | да | Версия контракта |
| `rubitimeBranchId` | `string` | да | ID филиала в Rubitime |
| `rubitimeCooperatorId` | `string` | да | ID сотрудника в Rubitime |
| `rubitimeServiceId` | `string` | да | ID услуги в Rubitime |
| `slotDurationMinutes` | `number` (int > 0) | да | Длительность слота (мин.) для нормализации ответа Rubitime на стороне webapp/integrator |
| `dateFrom` | `string` (YYYY-MM-DD) | нет | Фильтр одного дня или начало диапазона (webapp для одного дня шлёт `dateFrom` = `dateTo`) |
| `dateTo` | `string` (YYYY-MM-DD) | нет | Конец диапазона |

**Не входит в v2 body:** `city`, `category`, `bookingType`, `bookingProfileId`.

**Ответ integrator:** фактическая реализация возвращает нормализованный массив `slots` с полями `date` и вложенными `slots[]` (`startAt`/`endAt` в формате нормализатора); webapp принимает как контракт v1-формы слотов, если нет массива `times[]`. См. `bookingM2mApi.ts`.

### Response (success)

```json
{
  "ok": true,
  "slots": [
    {
      "date": "2026-04-10",
      "times": ["10:00", "11:00", "14:00"]
    },
    {
      "date": "2026-04-11",
      "times": ["09:00", "12:30"]
    }
  ]
}
```

| Поле | Тип | Описание |
|---|---|---|
| `ok` | `true` | Успешный ответ |
| `slots` | `Array<{ date: string; times: string[] }>` | Доступные слоты по дням |
| `slots[].date` | `YYYY-MM-DD` | Дата |
| `slots[].times` | `HH:MM[]` | Доступное время (timezone aware на стороне integrator) |

### Response (error)

```json
{
  "ok": false,
  "error": {
    "code": "rubitime_branch_not_found",
    "message": "Branch 17356 not found in Rubitime"
  }
}
```

**Коды ошибок:**

| Код | HTTP | Описание |
|---|---|---|
| `invalid_signature` | 401 | Неверная HMAC-подпись или истёкший window |
| `missing_required_fields` | 400 | Отсутствует `rubitimeBranchId` / `rubitimeCooperatorId` / `rubitimeServiceId` |
| `rubitime_branch_not_found` | 422 | Филиал не найден в Rubitime |
| `rubitime_api_error` | 502 | Ошибка при запросе к Rubitime API |
| `rubitime_timeout` | 504 | Таймаут запроса к Rubitime API |

**Упразднённые коды для in-person v2:**
- `slots_mapping_not_configured` — **не используется** в v2 (mapping больше не нужен на стороне integrator)
- `booking_profile_not_found` — **не используется** в v2

---

## 2. POST /api/bersoncare/rubitime/create-record (v2)

Создание записи в Rubitime.

### Request

```
POST /api/bersoncare/rubitime/create-record
Content-Type: application/json
x-bersoncare-timestamp: <unix_ms>
x-bersoncare-signature: <hmac_sha256>
```

**Body:**

```json
{
  "version": "v2",
  "rubitimeBranchId": "17356",
  "rubitimeCooperatorId": "34729",
  "rubitimeServiceId": "67591",
  "slotStart": "2026-04-10T10:00:00+03:00",
  "patient": {
    "name": "Иван Иванов",
    "phone": "+79001234567",
    "email": "ivan@example.com"
  },
  "localBookingId": "uuid-of-patient-booking"
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `version` | `"v2"` | да | Версия контракта |
| `rubitimeBranchId` | `string` | да | ID филиала |
| `rubitimeCooperatorId` | `string` | да | ID сотрудника |
| `rubitimeServiceId` | `string` | да | ID услуги |
| `slotStart` | `string` (ISO 8601 с timezone) | да | Дата и время начала |
| `patient.name` | `string` | да | Имя пациента |
| `patient.phone` | `string` | да | Телефон (snapshot) |
| `patient.email` | `string` | нет | Email (snapshot, опционально) |
| `localBookingId` | `string` (UUID) | да | ID записи в webapp DB (для idempotency и корреляции) |

**Не входит в v2 body:** `city`, `category`, `bookingType`, `bookingProfileId`, `slotEnd`.

> **Реализация:** в v2 M2M `slotEnd` не передаётся. Integrator формирует вызов Rubitime `create-record` с полем `record` из даты/времени `slotStart` (см. `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`). Отображаемая длительность слота на стороне webapp опирается на каталог (`durationMinutes` услуги), а не на отдельное поле в этом запросе.

### Response (success)

```json
{
  "ok": true,
  "rubitimeRecordId": "r_12345",
  "confirmedSlotStart": "2026-04-10T10:00:00+03:00"
}
```

| Поле | Тип | Описание |
|---|---|---|
| `ok` | `true` | Успешный ответ |
| `rubitimeRecordId` | `string` | ID созданной записи в Rubitime (сохраняется в `patient_bookings.rubitime_id`) |
| `confirmedSlotStart` | `string` | Подтверждённое время начала (ISO 8601) |

### Response (error)

```json
{
  "ok": false,
  "error": {
    "code": "slot_already_taken",
    "message": "Slot 2026-04-10T10:00:00+03:00 is no longer available"
  }
}
```

**Коды ошибок:**

| Код | HTTP | Описание |
|---|---|---|
| `invalid_signature` | 401 | Неверная подпись |
| `missing_required_fields` | 400 | Отсутствует любое из обязательных полей |
| `slot_already_taken` | 409 | Слот занят к моменту создания |
| `rubitime_branch_not_found` | 422 | Филиал не найден |
| `rubitime_api_error` | 502 | Ошибка Rubitime API |
| `rubitime_timeout` | 504 | Таймаут Rubitime API |
| `duplicate_local_booking_id` | 409 | Запись с этим `localBookingId` уже создана (idempotency) |

---

## 3. Backward Compatibility Policy

### v1 → v2 переход

| Аспект | v1 (legacy) | v2 (новый) |
|---|---|---|
| Резолв Rubitime IDs | Integrator (из `booking_profiles`) | Webapp (из `booking_catalog`) |
| Поле `category` | Обязательно | Не используется |
| Поле `city` | Обязательно | Не используется |
| Поле `rubitimeBranchId` | Нет | Обязательно |
| Поле `rubitimeServiceId` | Нет | Обязательно |
| Версия в body | Нет (implicit v1) | `"version": "v2"` |

### Правила совместимости

1. **v1 запросы продолжают работать** пока не отключена legacy-ветка в integrator (`bookingScheduleMapping`).
2. Integrator определяет версию по наличию поля `"version": "v2"` в body.
3. При отсутствии `"version"` — трактуется как v1 (backward compatible).
4. **Дата отключения v1** фиксируется в cutover runbook (`CUTOVER_RUNBOOK.md`) после полного перехода all bookings → v2.

### Гарантии v2

- Integrator никогда не запрашивает `booking_profiles` для `version: "v2"` запросов.
- Ошибка `slots_mapping_not_configured` не возникает в v2 path.
- `localBookingId` обеспечивает idempotency: повторный запрос с тем же ID возвращает `ok: true` без дубля в Rubitime.

---

## 4. HMAC подпись (без изменений по смыслу)

Механизм подписи тот же, что у остальных M2M-эндпоинтов integrator (см. `recordM2mRoute.ts`):

```
payload = timestamp + "." + raw_body
signature = base64url( HMAC-SHA256(secret, payload) )
```

- `x-bersoncare-timestamp` — unix timestamp в **секундах** (строка)
- `x-bersoncare-signature` — **base64url** digest
- Window: **±300 секунд** от текущего времени сервера integrator
- Secret: значение, согласованное с webapp (в продакшене — из admin settings / общий M2M secret; не логировать)
