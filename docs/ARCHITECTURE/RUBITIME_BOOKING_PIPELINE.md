# Rubitime: вебхук, журнал, проекция, имена и статусы

## Поток данных

Входящий webhook → integrator: `rubitime_events` (сырой журнал), `rubitime_records`, очередь `projection_outbox` → webapp: `appointment_records` и обновление `platform_users` по телефону → интерфейс врача (список записей джойнит к `platform_users` по `phone_normalized`).

Код: `apps/integrator/src/integrations/rubitime/webhook.ts`, `connector.ts`, `apps/integrator/src/infra/db/writePort.ts`; проекция в webapp — `apps/webapp/src/modules/integrator/events.ts`.

## Журнал `rubitime_events.event` (integrator)

Колонка `event` — короткий тип строки. При логировании через шаг `event.log` с `eventStore: booking` значение берётся из тела: приоритет `event` → `action` (например `created` / `updated` / логика отмены) → `eventType` → иначе `unknown`. Раньше в журнале часто оставался `unknown`, если в payload не было поля `event`, хотя `action` был — это исправлено в `writePort.ts`.

## Имя клиента (ФИО)

Rubitime передаёт `name` как полную строку (часто ФИО с отчеством); порядок слов не гарантирован. Политика:

- Разбиение на имя и фамилию выполняется **только** при ровно **двух** словах (условно «фамилия имя»).
- При **трёх и более** словах отдельные `clientFirstName` / `clientLastName` из `name` **не** выводятся; каноническое отображаемое имя — поле `clientName` / полное имя в `payloadJson` проекции.
- Webapp при событии `appointment.record.upserted` в первую очередь использует `payloadJson.name` для `display_name`; `first_name` / `last_name` обновляются только если интегратор передал непустые значения.

## Статусы записи API (числовые коды 0–7)

Соответствие кодов Rubitime API внутренним строкам задаётся в `normalizeRubitimeStatus` (`connector.ts`), например: `0` → `recorded`, `4` → `canceled`, `5` → `awaiting_confirmation`, `7` → `moved_awaiting`; промежуточные состояния (`1`, `2`, `3`, `6`) маппятся во внутренние теги без дублирования уведомлений там, где сценарии в `content/rubitime/scripts.json` на них не завязаны.

Точные имена внутренних статусов и тесты — в `apps/integrator/src/integrations/rubitime/connector.test.ts`.

## Native booking (webapp create) — post-create projection

При создании записи из webapp (не через Rubitime iframe/сайт) поведение зависит от **`system_settings`** (scope `admin`):

| Ключ | Значения | Эффект |
|------|----------|--------|
| `booking_doctor_appointments_read_source` | `rubitime_legacy` (default seed) · `canonical` | Список `/app/doctor/appointments`, KPI «Сегодня», **календарь** `/app/doctor/calendar` |
| `booking_slots_read_source` | `rubitime` (default seed `0100`) · `canonical` | Patient/public **слоты** и **create** |

**Create при `booking_slots_read_source=rubitime` (2026-06-06 closeout):** Rubitime-first — обязательный `syncPort.createRecord`; канон **adopt** через projection mapping (`waitForRubitimeProjectionMapping`, до 5×100ms); **запрещён** native `createAppointment` fallback. При отсутствии mapping после retry — `rollbackFailedRubitimeCreate` (`deleteRecord` / `remove-record`) + `rubitime_projection_not_ready`. `assertSlotAvailable` **не** вызывается на create **и** reschedule (симметрия G4). Не зависит от `booking_rubitime_bridge_enabled`. Код: `rubitimeCreateRollback.ts`, `canonicalCreate.ts`.

**Create при `booking_slots_read_source=canonical`:** канон primary; Rubitime — best-effort при включённом мосте.

**Календарь:** reuse `booking_doctor_appointments_read_source` (отдельного ключа нет). При `rubitime_legacy` — `appointment_records` (`pgBookingCalendarLegacy`, фильтры `calendarLegacyFilters`); canonical free slots скрыты (`freeSlotsEnabled: false`). При `canonical` — `be_appointments` + optional free slots через `booking-scheduling`.

**Patient path (webapp):**
1. `POST /api/booking/create` (сессия) или `POST /api/booking/public/create` (гость, этап 3) → канон `be_appointments` при включённом booking-engine DI (порядок с Rubitime — см. таблицу выше).
   - **Без предоплаты:** `patient_bookings` (confirmed) → `emitBookingEvent('booking.created')` → TG/MAX + напоминания.
   - **С предоплатой (этап 5):** `awaiting_payment` + payment intent → оплата (`/app/patient/booking/pay` или `/book/pay`) → capture → `booking.payment_captured` → напоминания (событие `booking.created` до оплаты **не** шлётся).
2. Integrator → M2M **`POST /api/integrator/patient-notifications/web-push`** (`intentType: appointment_lifecycle`) → текст в **PWA-чат** (`/app/patient/messages`) + Web Push с тем же `openUrl`. См. [`PATIENT_SUPPORT_CHAT_INBOX.md`](PATIENT_SUPPORT_CHAT_INBOX.md). Slot-напоминания (`appointment_reminder`) в чат **не** пишутся.

**Doctor projection + GCal path (integrator):**
1. Webapp → `POST /api/bersoncare/rubitime/create-record` (M2M) → integrator создаёт запись в Rubitime API → получает `recordId`. Пока integrator не ответил, исходящий запрос webapp к integrator **обычно открыт** всё время ожиданий throttle и повторов api2 — на стороне webapp нужен **индикатор загрузки** (см. `apps/webapp/INTEGRATOR_CONTRACT.md`).
2. `runPostCreateProjection(recordId)` (файл `postCreateProjection.ts`) выполняет:
   - `fetchRubitimeRecordById` — забрать полную запись из Rubitime; при ошибке — пауза **5200 ms**, затем вторая попытка. Все вызовы api2 (включая повтор после ответа Rubitime про «5 second / consecutive requests») проходят через общий throttle **5500 ms** (`rubitime_api_throttle`): следующий вызов не стартует, пока не выдержан интервал после *завершения* предыдущего. Подробнее: `docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`.
   - Синтетический `RubitimeWebhookBodyValidated` c `from: 'webapp'`, `event: 'event-create-record'`.
   - `prepareRubitimeWebhookIngress` — нормализация timezone.
   - `syncRubitimeWebhookBodyToGoogleCalendar` — Google Calendar sync (best-effort, non-fatal).
   - `writeDb({ type: 'booking.upsert', ... })` → `appointment_records` / compat + fan-out `appointment.record.upserted` (sync emit или `projection_outbox` при сбое).
   - webapp projection poller → `appointment_records` → Doctor appointments UI.
3. Email autobind (если `webappEventsPort` доступен) — аналог webhook-path пункта.

**Идемпотентность при дубле webhook:** `booking.upsert` использует `ON CONFLICT (rubitime_record_id) DO UPDATE`; projection outbox дедуплицируется по `idempotencyKey`. Если Rubitime webhook для той же записи придёт позже — данные обновятся без дубликатов.

**Разделение UI:**
- Doctor appointments UI питается из `appointment_records` (заполняется через projection).
- В списке записей врача (`/app/doctor/appointments`) и на экране «Сегодня» основная строка имени — джойн к `platform_users` (как в SQL `COALESCE`); если `payload_json.name` от Rubitime после нормализации отличается от этой подписи, под основной строкой показывается краткая подсказка «В Rubitime: …».
- Patient «Мои записи» питается из `patient_bookings` (заполняется напрямую в webapp).

## Google Calendar: поле `description` события

Синхронизация Rubitime → Google Calendar (best-effort, не блокирует вебхук) выполняется в `syncRubitimeWebhookBodyToGoogleCalendar` → `mapRubitimeEventToGoogleEvent` (`apps/integrator/src/integrations/google-calendar/sync.ts`).

**Содержимое описания события:**

- **Заголовок (`summary`):** только ФИО (без услуги); при отмене/запросе переноса — префиксы ❌ / ⚠️, затем при связи с абонементом — **✅** (см. `summaryMarkers.ts`, `resolvePackageCalendarContext.ts`).
- **Описание (`description`):** первая строка `#+7…` (телефон из Rubitime/БД); ниже — комментарий клиента (`comment`); ниже — комментарий специалиста о клиенте (`be_patient_booking_profiles.problematic_note` или `be_appointment_staff_comments` к визиту) и строка `Проблемный` при `is_problematic`; ниже — `На сопровождении: <название программы>` при `doctor_patient_support.on_support` и активном `treatment_program_instances`; при `be_appointments.package_usage_ref` — строка `Абонемент от <sold_at|created_at>: сеанс n из N`. Код: `calendarDescription.ts`, `packageSessionIndex.ts`.
- **Lifecycle без уведомлений:** `booking.package_linked` / `booking.package_unlinked` (webapp M2M) — только обновление GCal для канонической записи.

**Вебхук:** часть полей может приходить только на верхнем уровне `data`, а не внутри `data.record`. В `toRubitimeIncoming` (`connector.ts`) для ключей комментариев выполняется подмешивание с родительского уровня, если во вложенной записи значение пустое (`mergeRubitimeWebhookSiblingCommentFields`).

**Проверки в репозитории:** `apps/integrator/src/integrations/google-calendar/calendarDescription.test.ts`, `sync.test.ts` (`mapRubitimeEventToGoogleEvent`), `apps/integrator/src/integrations/rubitime/connector.test.ts` (merge полей вебхука).

### Журнал (фрагмент)

| Дата | Изменение |
|------|-----------|
| 2026-05-02 | Описание события GCal: комментарии клиента/админа вместо одного только id; merge полей комментариев из тела вебхука; unit-тесты. |
| 2026-06-03 | **Google Calendar:** при Rubitime-first create не дублировать событие на `booking.created`; отмена пациентом/специалистом — префикс **❌** в заголовке (событие остаётся); запрос переноса (`staff_confirmation_required`) — **⚠️**; удаление в Rubitime (`remove-record`/webhook delete) и soft-delete в кабинете — **удаление** из GCal; отмена в Rubitime — `update-record` status `4`, не `remove-record`. **Календарь врача (webapp):** dedupe legacy/`be:` проекции. |
| 2026-06-05 | **Двустороннее зеркалирование (`AppointmentMirrorSync`):** live inbound/outbound для mapped appointments; единый `buildCanonicalInboundSnapshot`; см. § ниже и [`ACCEPTANCE_MIRROR_SYNC.md`](../BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md). |
| 2026-06-05 | **Mirror integrity hardening:** partial-failure flags в patient/staff API; echo-guard / stale-mapping skip legacy fanout; revive-guard в `patient_bookings`; lifecycle `FOR UPDATE` + `state_conflict`; Rubitime-first rollback при package/product failure; `empty_patch` → 400 на M2M `update-record`. Контракт: [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](../BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md). |
| 2026-06-06 | **Gaps closeout:** rubitime-first — no `createAppointment` fallback; create-rollback **`deleteRecord`** (не `cancelRecord`); doctor legacy `rubitime/cancel` → `update-record` status 4; patient partial UI (`rubitimeMirrorFailed` warning toast); shared `rubitimeCreateRollback`. План: [`.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md`](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md); LOG [`BOOKING_REWORK_INITIATIVE/LOG.md`](../BOOKING_REWORK_INITIATIVE/LOG.md) §2026-06-06. |
| 2026-06-06 | **Desync fix:** cancel mirror invariants (URL null, staff→patient_bookings, stale sweep, legacy branch FK); GCal DELETE **410** + Rubitime `remove-record` gone + `update-record` duplicate cancel = idempotent silent. План: [`.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) (`completed`). |

## Каноническая модель и read-bridge (этап 1, OWN_BOOKING_ENGINE)

Параллельно legacy-пайплайну выше существует **канон** в webapp (`be_appointments`, организационная модель `be_*`). Источник истины на этапе 1 для новых контрактов — канон; Rubitime и `appointment_records` остаются для текущего UI и вебхуков.

- **Мост:** `system_settings.booking_rubitime_bridge_enabled` (admin). При включении админ может запустить проекцию (`POST /api/admin/booking-engine/bridge`) — idempotent upsert в `be_appointments` + `be_external_entity_mappings` по `integrator_record_id` / `rubitime_record_id`.
- **Код:** модуль `apps/webapp/src/modules/booking-engine/`, репозитории `pgBookingEngine.ts`, `pgBookingRubitimeBridge.ts`; legacy ingest в `appointment_records` сохранён; при наличии `appointmentMirrorSync` в DI — mirror-first в `integrator/events.ts`.
- **Write-путь (этап 2, done):** пациентский create при каноническом DI пишет в `be_appointments`; Rubitime — по режиму `booking_slots_read_source` (Rubitime-first или best-effort bridge). Read UI врача — `appointment_records` по умолчанию (`rubitime_legacy`); cutover на канон — явный switch.

### Двустороннее зеркалирование (2026-06, `AppointmentMirrorSync`)

Для любой записи с mapping `be_external_entity_mappings` (`entity_type=appointment`, `external_system=rubitime`) действует **двусторонний** sync времени, длительности, scope (филиал/специалист/услуга), статуса и отмены — в том числе для `native` / `admin_manual`, если у записи уже есть Rubitime id.

- **Inbound (Rubitime → канон):** `appointment.record.upserted` → `buildCanonicalInboundSnapshot` → `applyInboundFromRubitime` → `pgBookingRubitimeBridge`. Тот же snapshot пишется в `appointment_records` (единый projection input). Fan-out top-level (`dateTimeEnd`, `serviceId`, `rubitimeCooperatorId`, `integratorBranchId`). Partial FK policy + warn в лог. Recovery → immediate update. Attribution: `mirror_last_synced_from`, `mirror_synced_at`, `mirror_sync_version`.
- **Echo guard:** inbound пропускается ~8 с после outbound с `mirror_last_synced_from=canonical`.
- **Outbound (канон → Rubitime):**
  - **Перенос (staff calendar):** Rubitime **до** канона (`manual-reschedule`) — проверка занятости слота, rollback при `slot_overlap`.
  - **Отмена (staff/admin):** канон `staffCancel` **до** Rubitime `cancelRecord` (`status: 4`).
  - **Пациент:** канон lifecycle **до** best-effort Rubitime (`patientMirrorOutbound.ts`).
  - Patch: `buildRubitimeOutboundPatch` + M2M; integrator — `normalizeUpdateRecordPatch.ts`.
- **Ops backfill:** `POST /api/admin/booking-engine/bridge` для истории; **live-path** — webhook + mirror (без ручного bridge на каждое изменение).

Код: [`booking-appointment-sync/README.md`](../../apps/webapp/src/modules/booking-appointment-sync/README.md), `infra/repos/pgBookingRubitimeBridge.ts`, `integrator/events.ts`, `apps/integrator/.../normalizeUpdateRecordPatch.ts`.

### Целостность mirror (2026-06, hardening)

- **Canonical-first после commit:** отмена/перенос пациента и staff manual-cancel применяют канон до best-effort Rubitime; HTTP **`ok: true`** с partial flags при сбое внешнего шага (набор флагов по поверхности — см. [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](../BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md) § Partial outcomes).
- **Staff outbound gate:** `booking_rubitime_bridge_enabled` обязателен для manual create/reschedule/cancel mirror (не путать с `booking_slots_read_source=rubitime` у patient create).
- **Inbound echo / stale mapping:** `skipped_echo_guard` и `stale_mapping_missing_canonical` — accepted event без upsert в `appointment_records` (только revalidate).
- **Legacy revive guard:** inbound `upsertFromRubitime` не переводит `patient_bookings` из `cancelled`/`cancelling`/`cancel_failed` и не оживляет строку при terminal canonical status.
- **Lifecycle races:** `pgBookingAppointmentLifecycle` — `SELECT … FOR UPDATE`; повторная отмена idempotent; reschedule из terminal status → `state_conflict`.
- **Rubitime-first create rollback:** при падении projection mapping / `reserveForAppointment` / `consumeVisitForAppointment` после успешного `createRecord` — best-effort **`deleteRecord`** (`remove-record`) + отмена orphan canonical. Обычная отмена существующей записи — `cancelRecord` / status 4 (не create-rollback).
- **Cancel mirror invariants (2026-06-06 desync fix):** после отмены Rubitime слот свободен; блокировка rebook — только ghost rows в `patient_bookings`. Все cancel paths закрывают mirror: `markCancelled` / inbound native cancel → `status=cancelled` + `rubitime_manage_url=NULL`; staff cancel — explicit `syncLinkedPatientBookingCancelled`; stale `cancelling`/`cancel_failed` (>15 min) sweep в `createPending`. Normal cancel **не** вызывает `remove-record`. Idempotent cleanup: GCal DELETE **410**; Rubitime `remove-record` «record not found» и `update-record` duplicate cancel / gone — silent. `appointment_records.branch_id` — только legacy `branches.id` (resolve из `rubitime_branch_id_snapshot`).
- **Staff delete (2026-06-07):** после staff `manual-cancel` — отдельный `POST …/appointments/[id]/delete` (только cancelled whitelist). Порядок: local purge (`appointment_records.deleted_at` + DELETE `patient_bookings`) → best-effort `remove-record` → **`booking.deleted`** (не `booking.cancelled`). Inbound на purged row → `skipped_purged`. Контракт — [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](../BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md) §Staff delete; план — [`.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md`](../../.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md).

### Перенос и отмена (этап 4 + mirror, 2026-06)

При записи с `canonical_appointment_id` в `patient_bookings`:

1. **Отмена (пациент):** `booking-appointment-lifecycle.patientCancel` → best-effort `cancelRecord` / mirror; `patient_bookings` → `cancelled`; проекция; `booking.cancelled` (+ partial API flags при сбое моста/side-effects). UI: при `rubitimeMirrorFailed` — warning toast (`bookingPartialOutcomeToast`).
2. **Перенос (пациент):** при `slots=rubitime` — **без** `assertSlotAvailable` (как create); иначе проверка слота → lifecycle → best-effort Rubitime `update-record` → `patient_bookings` / проекция / `booking.rescheduled` (+ partial flags / warning toast как у отмены).
3. **Отмена/перенос (staff/admin):** см. outbound-порядок в § «Двустороннее зеркалирование»; ручные API — `.../manual-cancel`, `.../manual-reschedule`.
4. **Проекция врача:** `appointment_records` (`be:{id}`) и inbound webhook синхронизируют один snapshot через mirror.

Код: `modules/patient-booking/service.ts`, `modules/booking-appointment-lifecycle/`, `app-layer/booking/staffRubitimeMirrorOutbound.ts`, `modules/integrator/bookingM2mApi.ts`.

Подробнее: [`OWN_BOOKING_ENGINE_INITIATIVE/CANONICAL_MODEL.md`](../OWN_BOOKING_ENGINE_INITIATIVE/CANONICAL_MODEL.md), [`patient-booking.md`](../../apps/webapp/src/modules/patient-booking/patient-booking.md), [`booking-calendar.md`](../../apps/webapp/src/modules/booking-calendar/booking-calendar.md).

## Одноразовое восстановление данных (ops)

Если у записи есть телефон в `appointment_records`, но нет строки в `platform_users` с тем же `phone_normalized`, в UI врача может отображаться «Неизвестный клиент». Исправление — создать или связать профиль по согласованным с продуктом правилам.

Пример одноразового SQL в репозитории: `apps/webapp/scripts/repair-client-8077942.sql` (идемпотентная вставка `platform_users` для конкретного инцидента). Выполнять на **БД webapp** с актуальным `DATABASE_URL`; на production путь к env-файлу и имена БД — в `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (раздел webapp).
