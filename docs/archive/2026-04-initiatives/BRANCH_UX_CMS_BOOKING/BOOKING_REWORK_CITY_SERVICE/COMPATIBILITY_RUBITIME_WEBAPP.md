# Rubitime ↔ Webapp Compatibility: Definition of Done

Документ определяет критерии полной совместимости между ручными записями в Rubitime и базой данных Webapp.

## Контекст

Есть два пути создания записи:

1. **Native (через webapp):** пациент бронирует через UI → `patient_bookings` создаётся сразу с полными данными.
2. **External (через Rubitime вручную):** администратор/врач создаёт запись в Rubitime → webhook → integrator → `appointment_records` (projection) → **compat-sync** → `patient_bookings`.

Цель compat-sync: все пути приводят к одному result — запись видна в `patient_bookings` с максимально полными данными.

## Definition of Done (compat-sync gate)

Запись считается **полностью совместимой**, если после входящего Rubitime webhook:

| Поле в `patient_bookings` | Обязательность | Источник |
|---|---|---|
| `id` | required | UUID (gen при compat-create) |
| `user_id` | required | resolveByPhone(clientPhone) или null (unlinked) |
| `rubitime_id` | required | webhook `record.id` |
| `status` | required | mapped из Rubitime lifecycle (confirmed/cancelled/etc.) |
| `slot_start` | required | `record.dateTimeStart` (ISO) |
| `slot_end` | best-effort | `record.dateTimeEnd` или `slot_start + default_duration` |
| `source` | required | `'rubitime_projection'` |
| `branch_service_id` | best-effort | lookup по `rubitime_branch_id` + `rubitime_service_id` |
| `city_title` | best-effort | из `branchName` или lookup каталога |
| `service_title` | best-effort | из `serviceName` или lookup каталога |
| `branch_title` | best-effort | из `branchName` payload |
| `rubitime_branch_id` | best-effort | `record.branchId` из webhook |
| `rubitime_service_id` | best-effort | `record.serviceId` из webhook |
| `compat_quality` | required | `'full'` / `'partial'` / `'minimal'` (см. ниже; **не декларативный** — вычисляется из факта lookup + полей) |

### Уровни `compat_quality`

Реализация: `computeCompatSyncQuality` (`apps/webapp/src/modules/patient-booking/compatSyncQuality.ts`) + lookup `booking_branch_services` по `rubitime_branch_id` + `rubitime_service_id` (опционально `rubitime_cooperator_id` для снятия неоднозначности). **Запрещён «fake full»:** `full` только если в БД реально найден `branch_service_id` (FK на каталог), а не по одним только строкам из payload.

- **`full`:** `branch_service_id` найден в каталоге, есть `city_code_snapshot` (из города филиала), `service_title_snapshot`, и конец слота задан явно из webhook **или** вычислен по `duration_minutes` каталога после успешного lookup.
- **`partial`:** не `full`, но заполнено хотя бы одно «человекочитаемое» поле: `branch_title_snapshot`, `service_title_snapshot` или `city_code_snapshot` (названия/город из payload или каталога).
- **`minimal`:** только `slot_start` + `rubitime_id` + `status` и нет title/city снимков (базовая видимость в истории).

При наличии `rubitime_branch_id` + `rubitime_service_id` в payload, но отсутствии строки в `booking_branch_services`, в лог пишется `branch_service_lookup_miss` — compat остаётся `partial`/`minimal`, без маскировки под `full`.

## Поведение при повторных webhook

- Второй webhook с тем же `rubitime_id` → **UPDATE** существующей строки, не INSERT.
- Snapshot-поля native bookings (созданных через webapp UI) **не перетираются** при compat-sync.
- Source = `'native'` rows имеют приоритет над source = `'rubitime_projection'`.

## Lifecycle mapping

| Rubitime event | patient_bookings.status |
|---|---|
| record.created | `confirmed` |
| record.updated | `confirmed` (или `rescheduled` если slot изменился) |
| record.cancelled | `cancelled` |
| record.completed | `completed` |

## Видимость в patient history

После корректного compat-sync запись должна:

- Отображаться в `CabinetPastBookings` как запись с temporal данными (дата, время).
- Показывать `city_title` / `service_title` если доступны (best-effort label).
- Не дублировать native booking с тем же `rubitime_id`.
- В журнале прошлых приёмов **не** вести внешнюю ссылку «редактировать в расписании» из payload (`link` для истории в webapp не прокидывается); нейтральный статус «подтверждена» в UI не дублируется, «отменена» выделяется визуально.

## Best-effort fallback labels

Если payload не содержит service/city названий и lookup в каталоге не нашёл совпадения:

- `service_title` → `null` (UI показывает «Услуга не указана»).
- `city_title` → `null` (UI показывает «Филиал: <branchName>»).
- `slot_end` → `slot_start + 60 minutes` (дефолтная длительность).
- `compat_quality` = `'minimal'`.

## Проверки (monitoring queries)

```sql
-- Compat rows созданные за последние 24 часа
SELECT count(*), compat_quality
FROM patient_bookings
WHERE source = 'rubitime_projection'
  AND created_at > now() - interval '24 hours'
GROUP BY compat_quality;

-- Потенциальные дубли (два ряда с одним rubitime_id)
SELECT rubitime_id, count(*)
FROM patient_bookings
WHERE rubitime_id IS NOT NULL
GROUP BY rubitime_id
HAVING count(*) > 1;

-- Minimal качество (нет service/city)
SELECT count(*) FROM patient_bookings
WHERE source = 'rubitime_projection'
  AND compat_quality = 'minimal'
  AND created_at > now() - interval '7 days';
```

## Known limitations

- Если клиент зарегистрирован в Rubitime с другим телефоном, чем в Webapp, `user_id` будет null → запись не привязана к учётной записи пациента.
- Если webhook payload не содержит `serviceId` / `branchId`, `branch_service_id` не может быть resolved → `compat_quality = 'minimal'`.
- Исторические записи (до запуска compat-sync) не синхронизируются автоматически — необходим backfill: `pnpm --dir apps/webapp backfill-rubitime-compat-snapshots` (Stage 2: payload + catalog lookup).

## Ingest resiliency (integrator → webapp projection outbox)

**Цель:** временные сбои (сеть, таймаут, HTTP 5xx, 503 от webapp) не переводят событие в финальный `dead` с первой попытки.

| Класс | Примеры | Поведение |
|-------|---------|-----------|
| **Recoverable** | `status 0`, `5xx`, `503`, `429`, `408` | `projection_outbox`: увеличить `attempts_done`, `next_try_at` с экспоненциальным backoff (база 30s, верхняя граница 3600s), повторить emit. |
| **Non-recoverable** | `4xx` кроме 429/408 (в т.ч. `422` для ошибок валидации в `/api/integrator/events`) | Немедленный переход в `dead` без исчерпания retry (исправление данных или кода). |

**Idempotency:** ключ `idempotency_key` в `projection_outbox` + payload-hash в ключе для `appointment.record.upserted` — повторная доставка не дублирует бизнес-запись (UPSERT/ON CONFLICT на стороне webapp).

**User linking по телефону:** входящий телефон нормализуется к каноническому виду `+7…` (`normalizeRuPhoneE164`, единая политика с `platform_users.phone_normalized`). При отсутствии `integrator_user_id` в payload выполняется lookup по телефону. При нескольких совпадениях по телефону в БД (нарушение уникальности) безопасная деградация — не привязывать пользователя до ручного разрешения; для штатной схемы `phone_normalized` уникален. Реализация: `pgUserByPhone.findByPhone` при двух и более строках с тем же `phone_normalized` возвращает `null` (запрос с `ORDER BY id ASC LIMIT 2`).

## Связанные документы

- `EXECUTION_LOG.md` (§Stage 11) — реализация compat-sync (отдельного `STAGE_11_*.md` нет; вариант B).
- `CUTOVER_RUNBOOK.md` — порядок включения compat-sync в продакшн.
- `apps/integrator/src/integrations/rubitime/connector.ts` — webhook extraction.
- `apps/webapp/src/infra/repos/pgPatientBookings.ts` — upsertFromRubitime.
