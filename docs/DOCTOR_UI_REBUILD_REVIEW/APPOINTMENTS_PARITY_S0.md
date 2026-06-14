# S0 — Паритет записей Rubitime ↔ canonical (исследование, по D1)

**Статус:** ИССЛЕДОВАНИЕ ЗАВЕРШЕНО · **Дата:** 2026-06-13 · **Ветка:** `feat/doctor-ui-rebuild`
**Спека:** [`ROADMAP.md` §S0 + §0 D1](./ROADMAP.md) · **Режим:** read-only (код + dev-БД `SELECT`); данные/схема/sync-правила **не менялись**.

> ## ⚠️ ADDENDUM (2026-06-13, orchestrator) — dev-обкатка бэкфилла выявила конфликт
> Написан скрипт `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` (dry-run по умолчанию, `--commit`), обёртка над боевой `RubitimeBridgePort.projectAppointmentRecords`. Dry-run на dev: legacy live 375 / canonical projection 231. **`--commit` на dev спроецировал +6 (231→237), затем УПАЛ** на `be_appointments_specialist_no_overlap` (специалист `518ea988…`, слот 2026-06-17 15:00–16:00). На этом слоте **уже есть** canonical-ряд `source='rubitime_projection'` с тем же телефоном → значит **несколько legacy-записей соответствуют одной реальной записи** (дубли в Rubitime / перенос+оригинал), а дедуп их не схлопывает. Две проблемы проекции: (1) `projectRows` (pgBookingRubitimeBridge.ts:523-563) крутит записи без try/catch — первый конфликт валит весь батч (предыдущие уже закоммичены, т.к. транзакция на запись); (2) дедуп `recoverExistingProjection` не покрывает кейс «дублирующиеся legacy на один слот». **Вывод: унификация — не one-shot скрипт; нужна реконкиляция + харднинг проекции (зона моста/`BOOKING_REWORK`).** Следующий шаг (рекомендация): толерантный режим скрипта (catch+skip+собрать список всех конфликтов) → классификация (истинные дубли vs реальные двойные брони) → расширить дедуп / линковать mapping → чистый прогон. dev эфемерный, частичные +6 безвредны.
>
> ## ✅ ADDENDUM-2 (2026-06-13) — скрипт доведён + провалидирован на dev
> Скрипт переписан: read-only диагностика (default dry-run) + **толерантный per-record** прогон (через `bridge.upsertCanonicalFromRubitimeRecord` в try/catch — боевой мост не тронут, батч не падает) + `--delete-test` (мягкое удаление `+79189000782`/`+70000000000`) + `--collapse-dups` (правило: смаплен→неотменён→свежий `updated_at`, лузеры `deleted_at`). Прогон на dev: **непроецированных 119→0, дубль-кластеров 7→0**, projection inserted 116 / updated 325. **Остаются 3 неустранимых конфликта = реальные double-bookings** (два разных пациента на один специалист+слот): (1) Андреева Ассоль 05-30 16:00 — отменена, низкий приоритет; (2) Менялкина Анна Вт 06-16 16:00 (Rubitime) ↔ `+79111536895` (`admin_manual`) на `518ea988`; (3) Вовк Ирина Ср 06-17 16:00 (Rubitime) ↔ `+79060432251` на `518ea988`. Требуют решения владельца (какая запись настоящая / не перепутан ли специалист). **dev теперь полностью согласован** (canonical полон — удобно для тестов UI-трека). Для PROD: сначала read-only `diagnose` на чистом снимке, ревью конфликтов с владельцем, затем `--commit --delete-test --collapse-dups`. Дубль-кластеры на dev резолвились 1:1 в одну canonical-запись (НЕ двойные брони) — двойные брони только в этих 3 «осадочных» конфликтах.
>
> ## ✅ ADDENDUM-3 (2026-06-13) — 3 конфликта разобраны по CSV; dev = 0/0/0
> Источник истины: `.tmp/rubitime-import/records.csv` (есть колонка «Сотрудник» = специалист: «Дмитрий Берсон»=Москва, «(СПб)»=Питер).
> 1. **Андреева Ассоль 30.05 16:00** — её 16:00 отменена (CSV-коммент «отмените 16.00»); реальный слот = Бословяк Кристина (confirmed). Canonical уже верный; устаревший хвост `8361933` → `--drop-legacy`.
> 2. **Менялкина Анна Вт 16.06 16:00** — РЕАЛЬНАЯ (CSV `8416510`, Сеанс 90, Москва). Мешала ошибочная `admin_manual` запись Груздевой (`+79111536895`), которой НЕТ в Rubitime — это инстанс бага «бронь на занятый слот» (см. [[booking-overlap-allowed-bug-2026-06]]); на проде owner её уже удалил (canonical+GCal). На dev удалена (canonical-строка + дети + mapping). После этого Менялкина встала на слот.
> 3. **Вовк Ирина Ср 17.06 16:00** — переехала на Вт 18:00 (CSV-коммент); реальный Ср 16:00 = Аня Коган. Устаревшие Ср-16:00 дубли `8448355/57/63/71/75/95` → `--drop-legacy`/collapse.
> Итог на dev: **unmapped 0 / dups 0 / conflicts 0**, dev полностью согласован.
>
> ### Прод-ранбук (только скриптом, без ad-hoc SQL) — ПОЛНАЯ версия: [`../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md`](../OPERATIONS/BOOKING_CANONICAL_CUTOVER.md) (вкл. ручной разбор конфликтов)
> 1. `set -a && source /opt/env/bersoncarebot/webapp.prod && set +a` (см. SERVER CONVENTIONS).
> 2. **Диагностика (read-only):** `pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments` → сверить unmapped/dups/conflicts.
> 3. Сверить «осадочные» конфликты с CSV; стале-ext-id собрать в список (Груздева-тип ошибочные canonical-записи удаляет владелец через кабинет/UI, НЕ скриптом — на проде уже сделано).
> 4. **Прогон:** `pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- --commit --delete-test --collapse-dups --drop-legacy=8361933,8448355,8448357,8448363,8448371,8448375,8448395` (ext-id уточнить по прод-диагностике).
> 5. Перепроверить диагностикой → должно стать 0/0/0. Затем §3.5 (KPI→canonical) безопасен.

> **ВЕРДИКТ (кратко):** **Катовер read-source на canonical сейчас НЕ безопасен.** В canonical `be_appointments` **отсутствуют 125** исторических записей, которые есть в legacy `appointment_records` (CSV-бэкфилл Rubitime от 2026-06-13 залился **только** в legacy и **не** спроецировался в canonical). Непрерывный входящий поток Rubitime→canonical **работает** (свежие месяцы почти полны), но **исторический backfill в canonical не сделан**. Сначала — добивка (backfill canonical из legacy/`rubitime_records`), затем катовер.

---

## (a) Топология

### Два хранилища записей

| Слой | Таблица | Где читают | Порт / файл |
|------|---------|-----------|-------------|
| **legacy** | `public.appointment_records` (зеркало Rubitime в webapp) | doctor KPI/список/статистика (по умолчанию) | `createPgDoctorAppointmentsPort` — [`pgDoctorAppointments.ts:145`](../../apps/webapp/src/infra/repos/pgDoctorAppointments.ts) (`FROM appointment_records ar`) |
| **canonical** | `public.be_appointments` | календарь врача; booking-модуль | `createPgDoctorCanonicalAppointmentsPort` — [`pgDoctorCanonicalAppointments.ts:8,124`](../../apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts) + `createPgBookingCalendarPort` — [`pgBookingCalendar.ts:195`](../../apps/webapp/src/infra/repos/pgBookingCalendar.ts) (`from(beAppointments)`) |
| **raw (integrator)** | `integrator.rubitime_records` | сырой приёмник вебхуков Rubitime (ops/аудит/проекция) | `upsertRecord` — [`apps/integrator/src/infra/db/repos/bookingRecords.ts:47`](../../apps/integrator/src/infra/db/repos/bookingRecords.ts) |

### Read-switch (legacy ↔ canonical)

- Свитч: [`doctorAppointmentsReadSwitch.ts:27-48`](../../apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts) — дефолт `rubitime_legacy`.
- Wiring: [`buildAppDeps.ts:567-577`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) — источник из настройки `booking_doctor_appointments_read_source` (scope `admin`).
- Календарь **жёстко** читает canonical: [`booking-calendar/service.ts:191`](../../apps/webapp/src/modules/booking-calendar/service.ts) (`readSource: "canonical"`).
- Schedule-KPI идут через read-switch: [`schedule-kpis/route.ts:49`](../../apps/webapp/src/app/api/doctor/schedule-kpis/route.ts) (`deps.doctorAppointments.getScheduleKpis`).

> **Это и есть «два хранилища» из D1:** KPI/список = legacy (`rubitime_legacy`), календарь = canonical → расхождение видно даже в UI (KPI≠календарь).

### Ключ соединения (join key)

```
appointment_records.integrator_record_id (= Rubitime record id, text, UNIQUE)
   ↕  be_external_entity_mappings.external_id  (external_system='rubitime', entity_type='appointment')
       be_external_entity_mappings.canonical_id  =  be_appointments.id
```

### Маппинг raw → canonical (сеансы / филиалы)

- Branch/specialist/service резолвятся из `be_external_entity_mappings` (`external_system='rubitime'`, `entity_type IN ('branch','specialist','service','availability')`) — `loadExternalMappingLookup` [`pgBookingRubitimeBridge.ts:45-60`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts).
- Проекция в `be_appointments` (insert + mapping + history): [`pgBookingRubitimeBridge.ts:363-405`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) (`source: "rubitime_projection"`).
- Маппинг филиалов/услуг ведёт `createPgRubitimeMappingPort` [`buildAppDeps.ts:489-499`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) + [`pgRubitimeMapping.ts`](../../apps/webapp/src/infra/repos/pgRubitimeMapping.ts).

### Пайплайн (полный)

```
Rubitime (внешний источник)
  │  webhook  /webhook/rubitime/:token
  ▼
INTEGRATOR  apps/integrator/src/integrations/rubitime/webhook.ts
  ├─ upsertRecord → integrator.rubitime_records              (raw, repos/bookingRecords.ts:47)
  ├─ syncRubitimeWebhookBodyToGoogleCalendar(...)            (GCal ИЗ raw, webhook.ts:65)  ← downstream здесь
  └─ eventGateway → webapp event  appointment.record.upserted
        │  buildAppointmentRecordUpsertedFanout.ts
        ▼
WEBAPP  /api/integrator/events  →  modules/integrator/events.ts
  ├─ [новый путь] deps.appointmentMirrorSync.applyInboundFromRubitime(...)   (events.ts:993)
  │     → bridge.upsertCanonicalFromRubitimeRecord → be_appointments + mapping   (canonical-first)
  │     → ap.upsertRecordFromProjection → appointment_records                     (legacy-проекция)
  └─ [legacy путь, если mirrorSync null] ap.upsertRecordFromProjection → appointment_records  (events.ts:1034)
        + deps.rubitimeCanonicalProjection.upsertCanonicalFromRubitimeRecord → be_appointments (events.ts:1046)

DOCTOR UI:
  KPI/список → doctorAppointments read-switch → appointment_records (DEFAULT rubitime_legacy)
  Календарь  → bookingCalendar → be_appointments (canonical, hardcoded)
```

---

## (b) Паритетные числа (dev-БД `bcb_webapp_dev`, read-only)

> Контекст: dev-база восстановлена из прод-дампа 2026-06-13 + миграции ветки + CSV-бэкфилл (см. [`RUBITIME_CSV_BACKFILL.md`](../OPERATIONS/RUBITIME_CSV_BACKFILL.md)). Числа на dev ≈ прод (тот же бэкфилл прогонялся на обоих, +123 записи / +49 клиентов).

### Точные SQL (выполнены)

```sql
-- Totals
SELECT count(*) FROM appointment_records;                                   -- 375
SELECT count(*) FROM appointment_records WHERE deleted_at IS NULL;          -- 372
SELECT count(*) FROM appointment_records
  WHERE deleted_at IS NULL AND record_at IS NOT NULL;                       -- 372
SELECT count(*) FROM be_appointments;                                       -- 238
SELECT source, count(*) FROM be_appointments GROUP BY source;
  -- rubitime_projection=231 | native=6 | admin_manual=1
SELECT count(*) FROM be_external_entity_mappings
  WHERE external_system='rubitime' AND entity_type='appointment';           -- 248

-- Anti-join: legacy (живые, с record_at) БЕЗ canonical-маппинга
SELECT count(*) FROM appointment_records ar
WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system='rubitime' AND m.entity_type='appointment'
    AND m.external_id = ar.integrator_record_id);                           -- 125  ← ПРОБЕЛ

-- Reverse: canonical-маппинг БЕЗ живого legacy-record
SELECT count(*) FROM be_appointments a
JOIN be_external_entity_mappings m ON m.canonical_id=a.id
  AND m.external_system='rubitime' AND m.entity_type='appointment'
WHERE NOT EXISTS (SELECT 1 FROM appointment_records ar
  WHERE ar.integrator_record_id=m.external_id AND ar.deleted_at IS NULL);   -- 1 (admin_manual id 8488182)
```

### Сводка

| Метрика | Значение |
|---|---|
| `appointment_records` всего | **375** (живых, с `record_at`: **372**) |
| `be_appointments` всего | **238** (`rubitime_projection`=231, `native`=6, `admin_manual`=1) |
| rubitime appointment-маппингов | **248** (из них совпали с живым legacy-record: 247) |
| **legacy → canonical: ПРОПУЩЕНО** | **125** (живых, с `record_at`, без canonical) |
| canonical → legacy: orphan | **1** (`admin_manual`, native-создание, не Rubitime — норма) |

### Пропущенные 125 — по месяцам и характеру

| Месяц | legacy | в canonical | **пропущено** |
|---|---|---|---|
| 2026-01 | 37 | 6 | **31** |
| 2026-02 | 59 | 1 | **58** |
| 2026-03 | 75 | 54 | **21** |
| 2026-04 | 75 | 67 | 8 |
| 2026-05 | 63 | 60 | 3 |
| 2026-06 | 63 | 59 | 4 |

- Перекос — в историю (Jan–Mar: 110 из 125). Свежие месяцы почти полны (3–4) → **непрерывный inbound-sync работает**, пробел — именно исторический CSV-backfill, который пошёл только в legacy.
- Характер пропущенных: `created`=105, `canceled`=20. **Все 125 имеют `platform_user_id`** (бэкфилл уже прорезолвил клиентов) → добивка низкорисковая.
- Подтверждение источника: `last_event` пропущенных = `created`/`canceled` (CSV-семантика), не `native.*`.

### Настройки на момент исследования (dev)

| key (scope=admin) | value |
|---|---|
| `booking_doctor_appointments_read_source` | `rubitime_legacy` (KPI/список = legacy) |
| `booking_rubitime_bridge_enabled` | `true` (batch-проекция включена) |
| `booking_calendar_show_working_hours` | `true` |

> **Прод-note:** числа выше — dev (read-only). Перед катовером прогнать те же anti-join `SELECT`'ы на проде через `set -a && source /opt/env/bersoncarebot/webapp.prod && set +a` (см. [`host-psql-database-url.mdc`](../../.cursor/rules/host-psql-database-url.mdc)) — ожидаемо аналогичный пробел (~125), т.к. бэкфилл шёл одинаково на dev и прод.

---

## (c) Вердикт

**КАТОВЕР read-source на canonical — НЕ безопасен сейчас (NOT safe yet).**

Если переключить `booking_doctor_appointments_read_source` → `canonical` сегодня:
- KPI/список/статистика врача потеряют **125 исторических записей** (в основном Jan–Mar 2026) — они есть в legacy и в Rubitime, но не спроецированы в `be_appointments`.
- После отключения Rubitime эти 125 записей **исчезнут навсегда из видимости кабинета**, если их не добить в canonical заранее.

**Станет безопасным после:** (1) backfill 125 пропущенных записей в `be_appointments` (закрытие пробела до 0); (2) подтверждение, что inbound-sync остаётся непрерывным; (3) повтор anti-join на проде = 0.

---

## (d) Список пробелов (gaps) + владелец зоны

| # | Пробел | Числа (dev) | Владелец зоны | Действие |
|---|--------|-------------|---------------|----------|
| **G1** | Исторические Rubitime-записи в legacy, отсутствующие в canonical (CSV-backfill 2026-06-13 пошёл только в `appointment_records`, не спроецирован в `be_appointments`) | **125** | **этот ребилд (S0→S2b)** + **BOOKING_REWORK_INITIATIVE** (владелец bridge/проекции) | backfill canonical через `bridge.projectAppointmentRecords(orgId)` (см. план ниже) |
| **G2** | KPI/список читают legacy, календарь — canonical (двойной источник; UI-расхождение KPI≠календарь) | source=`rubitime_legacy` | **этот ребилд (S2b)** | после G1 — катовер read-source → `canonical` |
| **G3** | 1 canonical-маппинг без живого legacy-record (`admin_manual` 8488182) | 1 | **integrator / BOOKING_REWORK** | норма (native-создание); только зафиксировать, не «чинить» |
| **G4** | GCal-sync идёт из **raw Rubitime webhook** в integrator, а не из canonical | — | **integrator** | вне scope катовера read-source; учесть при отключении Rubitime (см. план §4) |
| **G5** | Reminders/notifications проецируются из integrator-потока (`rubitime_records` / booking-flow), не из canonical | — | **integrator** | вне scope этого ребилда; при отключении Rubitime источник напоминаний должен переехать на canonical (отдельная инициатива) |

> **Непрерывность (вывод):** inbound Rubitime→canonical **активен и непрерывен** (а не разовый бэкфилл): через `appointmentMirrorSync.applyInboundFromRubitime` [`events.ts:993-1005`](../../apps/webapp/src/modules/integrator/events.ts) → `bridge.upsertCanonicalFromRubitimeRecord` (canonical-first), либо через legacy-ветку [`events.ts:1044-1056`](../../apps/webapp/src/modules/integrator/events.ts). Отмены/переносы/длительность приходят тем же путём (`updateMappedRubitimeProjection` [`pgBookingRubitimeBridge.ts:435-453`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts), таблицы `be_appointment_reschedules`/`be_appointment_cancellations`/`be_appointment_events`). **Пробел — только историческая добивка G1.**

---

## (e) РЕКОМЕНДОВАННЫЙ ПЛАН DB-УНИФИКАЦИИ (план, НЕ исполнен)

Цель: сделать `be_appointments` единственным хранилищем до дальнейшей UI-работы. Все шаги — после ревью владельцем; sync-правила Rubitime менять только по согласованию с integrator + BOOKING_REWORK.

### Шаг 1 — Backfill пробела G1 (125) в canonical
- Использовать **существующий** механизм проекции (НЕ писать новый): `bridge.projectAppointmentRecords(organizationId)` — [`pgBookingRubitimeBridge.ts:575-593`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) (читает все живые `appointment_records` и проецирует в `be_appointments` идемпотентно по `external_id`). Точка вызова уже есть: `booking-engine/service.ts:169-170` (admin batch).
- Предусловие: `booking_rubitime_bridge_enabled=true` (в dev уже `true`).
- Сначала **dev**: прогнать проекцию, проверить anti-join → 0; убедиться что branch/service/specialist резолвятся (иначе пополнить `be_external_entity_mappings` через `rubitimeMappingService`).
- Затем **прод** (под `webapp.prod`, со свежим бэкапом — как в [`RUBITIME_CSV_BACKFILL.md`](../OPERATIONS/RUBITIME_CSV_BACKFILL.md)): тот же batch.
- Проверка (dev и прод):
  ```sql
  SELECT count(*) FROM appointment_records ar
  WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM be_external_entity_mappings m
    WHERE m.external_system='rubitime' AND m.entity_type='appointment'
      AND m.external_id=ar.integrator_record_id);   -- ОЖИДАЕМ 0
  ```

### Шаг 2 — Подтвердить непрерывный inbound Rubitime → canonical
- Убедиться, что `appointmentMirrorSync` подключён в проде (`bookingRubitimeBridgePort && bookingEngineCorePort` ≠ null — [`buildAppDeps.ts:463-474, 922, 1546`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts)).
- Smoke: тестовая Rubitime-запись в **dev** (НЕ прод — dev no-op по [`dev-prod-isolation`](../../.cursor/rules/dev-prod-isolation-no-real-creds.mdc)) → проверить, что появилась строка в `be_appointments` + mapping; отмена/перенос обновляют canonical (`be_appointment_reschedules`/`cancellations`).
- Зафиксировать, что отмены/переносы/длительность/комментарии из Rubitime доходят до canonical (через `updateMappedRubitimeProjection`).

### Шаг 3 — Катовер read-source на canonical
- После шага 1 (пробел=0 на проде) и шага 2: установить `booking_doctor_appointments_read_source` → `canonical` **через webapp Settings flow** (`updateSetting`, чтобы синхронизировалось в integrator — [`system-settings-integrator-mirror.mdc`](../../.cursor/rules/system-settings-integrator-mirror.mdc)), не править SQL напрямую.
- Это автоматически переводит KPI/список/статистику на тот же источник, что и календарь (D1, S2b).
- Проверка в UI (dev-bypass `dev:admin` на `127.0.0.1:5200`): KPI = числам календаря; список не пустой; исторические записи (Jan–Mar) видны.
- Также проверить клиентский фильтр списка (`kind==="appointment"`/таймзона — [`ROADMAP.md` §3.5 / ScheduleCalendarTab 383-389`]) — чтобы canonical-записи не отфильтровывались.

### Шаг 4 — Сохранить полную историю после отключения Rubitime
- **До отключения Rubitime:** убедиться, что весь исторический объём в `be_appointments` (шаг 1 = 0 пробел) и mapping/history (`be_appointment_events`) полны.
- **Downstream при отключении** (вне scope read-cutover, но обязательно зафиксировать для integrator/BOOKING_REWORK):
  - **GCal (G4):** сейчас sync из raw webhook ([`webhook.ts:65`](../../apps/integrator/src/integrations/rubitime/webhook.ts)). После отключения Rubitime источником GCal должен стать canonical (`appointmentMirrorSync.stampCanonicalOutbound` + outbound из `be_appointments`) — **отдельная инициатива integrator**.
  - **Reminders (G5):** проекция напоминаний от integrator-потока — после отключения Rubitime переезжает на canonical — **отдельная инициатива**.
- `appointment_records` и `integrator.rubitime_records` оставить как **read-only архив** истории (не удалять) до подтверждённой полноты canonical.

### Чего НЕ делать
- Не менять sync-правила Rubitime без согласования (integrator + BOOKING_REWORK).
- Не катоверить read-source до закрытия G1 (пробел=0 на проде).
- Не «чинить» G3 (admin_manual orphan — норма).
- Не писать новые backfill-скрипты — использовать существующий `projectAppointmentRecords`.

---

## Приложение — ключевые файлы (file:line)

| Что | Файл:line |
|---|---|
| Read-switch legacy/canonical | [`doctorAppointmentsReadSwitch.ts:27-48`](../../apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts) |
| Wiring read-source | [`buildAppDeps.ts:567-577`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) |
| legacy port (appointment_records) | [`pgDoctorAppointments.ts:145`](../../apps/webapp/src/infra/repos/pgDoctorAppointments.ts) |
| canonical port (be_appointments) | [`pgDoctorCanonicalAppointments.ts:124`](../../apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts) |
| Календарь canonical (hardcoded) | [`booking-calendar/service.ts:191`](../../apps/webapp/src/modules/booking-calendar/service.ts) |
| Bridge: insert проекции | [`pgBookingRubitimeBridge.ts:363-405`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) |
| Bridge: batch projectAppointmentRecords | [`pgBookingRubitimeBridge.ts:575-593`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) |
| Bridge gate (enabled) | [`pgBookingRubitimeBridge.ts:567-569`](../../apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) |
| Inbound mirror sync (canonical-first) | [`booking-appointment-sync/service.ts:10-40`](../../apps/webapp/src/modules/booking-appointment-sync/service.ts) |
| Integrator events: inbound branch | [`integrator/events.ts:993-1056`](../../apps/webapp/src/modules/integrator/events.ts) |
| Integrator raw rubitime_records upsert | [`bookingRecords.ts:47`](../../apps/integrator/src/infra/db/repos/bookingRecords.ts) |
| Integrator GCal из raw webhook | [`rubitime/webhook.ts:65`](../../apps/integrator/src/integrations/rubitime/webhook.ts) |
| CSV-бэкфилл (только legacy) | [`RUBITIME_CSV_BACKFILL.md`](../OPERATIONS/RUBITIME_CSV_BACKFILL.md) |
