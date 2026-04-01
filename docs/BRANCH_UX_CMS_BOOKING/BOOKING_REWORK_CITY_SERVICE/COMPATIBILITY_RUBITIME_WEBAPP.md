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
| `compat_quality` | required | `'full'` / `'partial'` / `'minimal'` |

### Уровни `compat_quality`

- **`full`:** все best-effort поля заполнены (branch_service_id resolved, city_title, service_title, slot_end).
- **`partial`:** slot_start + rubitime_id + хотя бы одно из title-полей заполнено.
- **`minimal`:** только slot_start + rubitime_id + status (базовая видимость в истории).

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
- Исторические записи (до запуска compat-sync) не синхронизируются автоматически — необходим backfill скрипт (Stage 14).

## Связанные документы

- `STAGE_11_RUBITIME_COMPAT_BRIDGE.md` — реализация compat-sync.
- `CUTOVER_RUNBOOK.md` — порядок включения compat-sync в продакшн.
- `apps/integrator/src/integrations/rubitime/connector.ts` — webhook extraction.
- `apps/webapp/src/infra/repos/pgPatientBookings.ts` — upsertFromRubitime.
