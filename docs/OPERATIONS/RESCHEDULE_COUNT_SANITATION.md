# Санация: be_appointments.reschedule_count → источник истины (R28)

Разовая чистка накопленного «мусора» в `public.be_appointments.reschedule_count` после фикса
инфляции счётчика переносов в мосте проекции Rubitime.

## Проблема

Мост проекции Rubitime (`apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts`,
`updateRubitimeProjection`) при каждом прогоне проекции/бэкфилле делал
`reschedule_count + 1`, если время проекции разошлось с каноном (`timeChanged`), **без** строки
в `be_appointment_reschedules`. Счётчик инфлировал на churn проекции, а не на реальный перенос.

Результат на dev (read-only диагностика, 2026-06-14):
- реальных переносов в `be_appointment_reschedules` ≈ **1**;
- `reschedule_count = 3-4` (до 12) у **343** записей `source=rubitime_projection`;
- ещё **5** нативных записей (`admin_manual`/native) инфлированы мостом (bidirectional inbound по
  смапленным записям), напр. `count 4 → реально 0`, `count 3 → реально 1`.

## Источник истины

Реальные переносы пишет **только** настоящий путь переноса
(`apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts`): одновременно `reschedule_count + 1`
**и** строку в `be_appointment_reschedules`. KPI «Переносов» в аналитике уже считается прямо по
строкам `be_appointment_reschedules` и корректен — чинить надо только колонку-счётчик.

## Фикс кода

Инкремент по `timeChanged` убран из моста (`updateRubitimeProjection`) — мост больше не трогает
`reschedule_count`. Регрессия: `pgBookingRubitimeBridge.test.ts` →
«does NOT inflate rescheduleCount on projection update when time changed (R28)».

## Скрипт санации (накопленные значения)

| | |
|--|--|
| Файл | `apps/webapp/scripts/sanitize-reschedule-count.ts` |
| npm | `pnpm --dir apps/webapp run sanitize-reschedule-count` |
| По умолчанию | **dry-run** (только диагностика, без записи) |

### Что делает (две идемпотентные ветки, трогают только строки с расхождением)

| Source | Действие | Почему |
|--------|----------|--------|
| `rubitime_projection` | `reschedule_count = 0` | реальные переносы исторических проекций в каноне неизвестны; по решению владельца — честный 0, а не выдуманный счётчик |
| прочие (`admin_manual`/native/patient) | `reschedule_count = count(be_appointment_reschedules)` | мост мог инфлировать и их; реальные переносы через движок зафиксированы строками таблицы — приводим к этому источнику истины |

### Флаги

| Флаг | Назначение |
|------|------------|
| `--commit` | применить (всё в одной транзакции, ROLLBACK при ошибке); без флага — только подсчёт |
| `--org=<uuid>` | ограничить одной организацией (по умолчанию — все) |

### Безопасность

- **dev = реальные ПДн.** Скрипт печатает только id/числа, ПДн не выводит. Писать в БД — только намеренно (`--commit`).
- **Идемпотентно:** повторный прогон после фикса меняет 0 строк (`WHERE … <> target`).
- **Audit-лог** (commit-режим): `.tmp/reschedule-count-sanitation/applied-<ts>.json` (counts + sample id).

## Runbook

```bash
# 1. env (иначе pg уйдёт в локальный сокет)
set -a && source apps/webapp/.env.dev && set +a

# 2. dry-run — подтвердить расхождения (projectionMismatch / nativeMismatch)
pnpm --dir apps/webapp run sanitize-reschedule-count

# 3. ПРИМЕНИТЬ — только по явному ОК владельца (dev = реальные ПДн)
pnpm --dir apps/webapp run sanitize-reschedule-count -- --commit

# 4. проверить идемпотентность — повторный dry-run должен дать 0 расхождений
pnpm --dir apps/webapp run sanitize-reschedule-count
```

## Проверка (read-only SQL)

```sql
-- проекции с ненулевым счётчиком (должно стать 0 после --commit)
SELECT count(*) FROM be_appointments
 WHERE source = 'rubitime_projection' AND reschedule_count <> 0;

-- нативные расхождения с источником истины (должно стать 0)
SELECT count(*) FROM be_appointments a
 WHERE a.source <> 'rubitime_projection'
   AND a.reschedule_count <> (SELECT count(*) FROM be_appointment_reschedules r WHERE r.appointment_id = a.id);
```

## Прод

Тот же скрипт, та же последовательность; перед `--commit` — dry-run и явное подтверждение.
После деплоя фикса кода новые прогоны проекции счётчик не инфлируют — санация разовая.
