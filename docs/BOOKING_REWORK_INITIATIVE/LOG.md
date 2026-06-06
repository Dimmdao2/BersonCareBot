# LOG — BOOKING_REWORK_INITIATIVE

## 2026-06-06 — Booking sync desync fix (prod smoke rebook / manage / FK / 410)

**План:** [`.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) (`status: completed`; sync-only; cancel = status 4, без `remove-record` на normal cancel).

**Prod smoke (до фикса):** rebook на отменённый слот → `slot_overlap`; GCal `410` на remove webhook; «Управлять» на dead Rubitime rows; FK `appointment_records_branch_id_fkey` при patient cancel projection.

**Код:**
- `pgPatientBookings`: `markCancelled` → `rubitime_manage_url = NULL`; stale sweep `cancelling`/`cancel_failed` в `createPending`; `listUpcomingByUser` → `cancelled_at IS NULL`.
- `upsertPatientBookingFromRubitime`: native inbound cancel clears manage URL; `closeActivePatientBookingsByRubitimeId` on cancel (scenario E duplicate rows).
- `pgPatientBookings.markCancelled`: sibling close by `rubitime_id`.
- `staffManualCancelAfterCanonical` + `PatientBookingService.syncLinkedPatientBookingCancelled`: staff cancel закрывает linked `patient_bookings`.
- `projectCanonicalAppointment*` + `resolveLegacyBranchIdForProjection`: legacy `branches.id` (не `be_branches.id`); `pgAppointmentProjection` ON CONFLICT `COALESCE` branch_id; `buildCanonicalSnapshot` не пишет be_branch в `appointment_records`.
- Integrator: GCal DELETE tolerates **410**; Rubitime `remove-record` «record not found» → silent `{}`; `update-record` duplicate cancel / gone → silent `{}`.
- Patient UI: hide Rubitime manage для `cancel_failed`; defense при пустом URL.

**Ops backfill (post-deploy, review counts):**

```sql
UPDATE patient_bookings SET status = 'cancelled', rubitime_manage_url = NULL
WHERE cancelled_at IS NOT NULL AND status <> 'cancelled';

UPDATE patient_bookings SET status = 'cancelled', rubitime_manage_url = NULL
WHERE status = 'cancelling' AND updated_at < now() - interval '15 minutes';
```

**Проверки:** targeted vitest (pgPatientBookings, upsertPatientBookingFromRubitime, `closeActivePatientBookingsByRubitimeId`, service/staff/events, `bookingMirrorDesyncMatrix` 7/7, projection, integrator connector/sync GCal 410 + Rubitime idempotent update/remove) + **`pnpm run ci` green** (2026-06-06).

**P0.0 (root cause):** класс ghost A–D подтверждён prod evidence в плане (smoke #4 overlap, staff cancel без mirror, FK branch, manage URL); SQL runbook — §P0.0 плана (ops verification post-deploy).

**Post-deploy ops gate (вне code DoD):** re-smoke #4–6 + ops backfill SQL ниже — после деплоя на prod; см. [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) smoke #9 + § «Post-deploy ops gate — sync desync fix» (todo плана `post-deploy-ops-gate`: `cancelled`).

**Доки:** `LOG.md`, `ACCEPTANCE_MIRROR_SYNC.md`, `RUBITIME_BOOKING_PIPELINE.md`, `INTEGRATOR_CONTRACT.md`, `README.md`, `ROADMAP.md`, plan archive YAML `completed`.

**Docs sync (post-closeout desync fix):** выровнены § cancel mirror invariants в pipeline; smoke #9 + § «Верификация sync desync fix» + post-deploy ops gate в ACCEPTANCE; пункт #18 README + строка ROADMAP; DoD/checklist/todos в plan archive; idempotent `update-record` в INTEGRATOR_CONTRACT.

## 2026-06-06 — Booking gaps closeout (rubitime-first overlap class + parity)

**План:** [`.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md`](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md).

**Код:**
- `canonicalCreate.ts` + `rubitimeCreateRollback.ts`: retry projection mapping; **запрет** native `createAppointment` fallback; `rubitime_projection_not_ready` + rollback `deleteRecord`.
- `service.ts`: reschedule skip `assertSlotAvailable` при `slots=rubitime`; legacy create rollback → `deleteRecord`.
- `staffRubitimeManualBooking.ts`: create-rollback → `deleteRecord`.
- `doctor/appointments/rubitime/cancel`: `update-record` status 4 (не `remove-record`).
- Patient UI: `bookingPartialOutcomeToast` + `CabinetBookingActions` / `useRescheduleBooking` / `ConfirmStepClient`.
- `pgWebPushOnlyReminders`: `ANY(${ids}::uuid[])`.

**Доки:** `BOOKING_MIRROR_INTEGRITY_CONTRACT.md`, `patient-booking.md`, `ACCEPTANCE_MIRROR_SYNC.md`, `api.md`, `RUBITIME_BOOKING_PIPELINE.md`, `README.md`, `ROADMAP.md`, `booking-appointment-sync/README.md`.

**Docs sync (post-closeout):** выровнены `RUBITIME_BOOKING_PIPELINE.md` (rubitime-first adopt, `deleteRecord` rollback, reschedule skip assert, patient partial UI), `ACCEPTANCE_MIRROR_SYNC.md` (снят defer doctor cancel, smoke #7–8), пути планов в LOG/README/archive; audit-план перенесён в [`.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md`](../../.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md).

**Проверки:** targeted vitest (10 files, 86 tests) + mirror bundle + **`pnpm run ci` green** (2026-06-06; полный барьер прогнан в **отдельной agent-сессии** реализации closeout, не в docs-сессии).

**Хвосты (догон после аудита, закрыты):** `staffRubitimeManualBooking` → shared `rollbackFailedRubitimeCreate` + `finalizeStaffManualRubitimeSyncSuccess` + integration rollback test; тест reschedule assert при `canonical`; `INTEGRATOR_CONTRACT` doctor cancel = status 4; явный handler `rubitime_projection_not_ready` в create route; `useRescheduleBooking.test.ts`, `CabinetBookingActions.test.tsx`, `ConfirmStepClient.test.tsx`; warning toast style; план — [`.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md`](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md) (`status: completed`).

**Prod deploy:** см. §2026-06-06 аудит — smoke CR-A / CN-P / RS-P после деплоя.

## 2026-06-06 — Аудит сценариев записи/отмены/переноса + фиксы rubitime-first

**Контекст:** prod-инцидент rubitime-first create (double insert → overlap → rollback → orphan GCal). План: [`.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md`](../../.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md).

**Код:**
- `canonicalCreate.ts`: `rollbackRubitimeFirstCreate` — `deleteRecord` + cancel orphan `be_appointments` (G2/G3); package/product rollback унифицирован на `deleteRecord`.
- `cancel/route.ts`, `reschedule/route.ts`: проброс partial flags из service (G1).
- `integrator/recordM2mRoute.ts`: GCal delete на `remove-record` (ранее).
- Тесты: +1 `markConfirmed` rollback; partial flags в cancel/reschedule routes; webhook tests mock `getRubitimeWebhookToken`.

**Доки:** `patient-booking.md`, `BOOKING_MIRROR_INTEGRITY_CONTRACT.md` § create rollback vs cancel.

**Проверки:** mirror bundle webapp 224 + integrator 53; `pnpm run ci` green (~6.5 min).

**Prod deploy (ручной):**
1. Деплой `webapp` + `integrator` на хост.
2. Smoke CR-A: patient create → 1× Rubitime, 1× `be_appointments`, 1× GCal, `confirmed`.
3. Cleanup orphan GCal от инцидента (Rubitime IDs 8449506, 8449507).
4. Опционально: `failed_sync` rows в `patient_bookings`; projection outbox #1606 → `cancelled` если stale.

## 2026-06-06 — Закрытие инициативы (этап 5, sign-off владельца)

- Ручной проход UI пройден владельцем постановки; подтверждение: **«Новый интерфейс записи принят»**.
- Закрыты: этап 1 (`done`), этап 5 (`done`), инициатива **`done`**.
- Обновлены: [`ROADMAP.md`](ROADMAP.md), [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md), [`README.md`](README.md), `docs/README.md`.

## 2026-06-06 — Снят устаревший `ACCEPTANCE_STAGE1.md`

- Удалён `ACCEPTANCE_STAGE1.md` (чек-лист 12 вкладок; не соответствует IA на 4 вкладки).
- Этап 1 зафиксирован как **`done` в коде**; ручной sign-off перенесён в [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md) (решение владельца 2026-06-04, LOG §«Этап 5: проход UI владельца»).
- Обновлены ссылки: `README.md`, `STAGE2_DECOMPOSITION.md`, `STAGE3_DECOMPOSITION.md`, `docs/README.md`.

## 2026-06-05 — Стабилизация цепочек записи (mirror integrity hardening)

**Closeout commits:** `377f3d51` → `d9bf2335` → `e823a581` → `f960825b` → `9e2ef6c3` → `13abe6d7` (план: [`.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md`](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md), `status: completed`). Канонический plan-файл — только архив в репозитории; копия в `~/.cursor/plans/` не является source-of-truth.

**Сделано (фазы 0–7):**
- Контракт: [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](BOOKING_MIRROR_INTEGRITY_CONTRACT.md).
- Create: `markAwaitingPayment` сохраняет `rubitime_id` / manage URL; admin manual create = doctor (Rubitime sync + rollback); rollback Rubitime при package/product failure после rubitime-first; `projectionWarning` в логе.
- Cancel/reschedule: staff cancel → `ok` + флаги partial failure; patient cancel — side effects в try/catch + флаги; patient reschedule — `rubitimeMirrorFailed`; staff outbound уважает `booking_rubitime_bridge_enabled`.
- Lifecycle: `FOR UPDATE` + `state_conflict` / idempotent повторный cancel.
- Inbound: dedup `payloadHash`; release dedup при `PIPELINE_FAILED`; echo/stale mapping не обновляют legacy fanout; advisory lock на first insert; native booking не «оживает» после canonical cancel.
- M2M: branch TZ на `update-record`; empty patch → 400; string numeric ids в patch; `update-record` в internal contract.
- Тесты: `rubitimePayloadHash`, gateway release, обновления manual/cancel/canonicalCreate.

**Финал (audit closeout — полное закрытие):**
- `notificationOutcomeFailed` в patient cancel/reschedule и staff `runStaffManualCancelAfterCanonical`.
- `paymentOutcomeFailed` на patient reschedule при сбое carry-over.
- Тесты: `staffManualCancelAfterCanonical.test.ts`, partial flags в manual-cancel routes, patient side-effect/reschedule flags в `service.test.ts`, `markConfirmedByCanonicalAppointment` в `pgPatientBookings.test.ts`.
- Docs: полная матрица в `ACCEPTANCE_MIRROR_SYNC.md`; defer legacy `remove-record` + online double-book в `BOOKING_MIRROR_INTEGRITY_CONTRACT.md`; partial flags по поверхностям (`9e2ef6c3`). *Defer doctor `remove-record` снят в gaps closeout 2026-06-06 — см. § выше.*
- Plan archive: frontmatter `status: completed`, todos `completed`, чеклисты `[x]`, `closeoutCommits` в YAML.

**Доработка (audit closeout):**
- Patient cancel: `patchLatestCancellationNotifications` в try/catch; staff manual-reschedule — gate `booking_rubitime_bridge_enabled`.
- Тесты: admin `appointments/manual`, echo-guard fanout, revive-guard `pgPatientBookings`, package/product rubitime-first rollback, `pgBookingAppointmentLifecycle` state_conflict/idempotent cancel, M2M `empty_patch`; CI-fix — mock `loadDoctorAnalyticsAudience` в stats routes.
- Docs: `RUBITIME_BOOKING_PIPELINE` § integrity, `patient-booking.md`, `api.md`, `INTEGRATOR_CONTRACT` empty_patch.

**Фазовый execution ledger (audit trail):**

| Фаза | Коммиты | Ключевые изменения | Проверки/артефакты |
|------|---------|--------------------|--------------------|
| 0. Контракт и рамки | `377f3d51`, `d9bf2335` | Контракт поведения и defer-ограничения (`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`) | `rg`-проверки в plan; docs sync в этом разделе и в `ACCEPTANCE_MIRROR_SYNC.md` |
| 1. Create consistency | `377f3d51`, `d9bf2335` | prepayment linkage, admin/doctor parity, rollback Rubitime-first create | `canonicalCreate.test.ts`, `manual/route.test.ts` (doctor/admin) |
| 2. Cancel/reschedule consistency | `377f3d51`, `d9bf2335`, `e823a581` | partial outcome flags после canonical commit, bridge gate, side-effect isolation | `manual-cancel/route.test.ts`, `service.test.ts`, `staffManualCancelAfterCanonical.test.ts` |
| 3. Lifecycle race hardening | `377f3d51`, `d9bf2335` | `FOR UPDATE`, `state_conflict`, idempotent cancel, revive guard | `pgBookingAppointmentLifecycle.test.ts`, `pgPatientBookings.test.ts` |
| 4. Inbound dedup/echo | `377f3d51`, `d9bf2335` | `payloadHash`, release dedup on `PIPELINE_FAILED`, echo/stale mapping ветки | `rubitimePayloadHash.test.ts`, `eventGateway/index.test.ts`, `events.test.ts` |
| 5. Timezone + cancel semantics | `377f3d51`, `d9bf2335` | branch timezone для update, `empty_patch` 400, `update-record` в контракте | `normalizeUpdateRecordPatch.test.ts`, `recordM2mRoute.test.ts`, `INTEGRATOR_CONTRACT.md` |
| 6. Test matrix + docs sync | `d9bf2335`, `e823a581`, `9e2ef6c3` | regression matrix, acceptance/architecture/module docs, partial flags by surface | `ACCEPTANCE_MIRROR_SYNC.md`, `BOOKING_MIRROR_INTEGRITY_CONTRACT.md`, `RUBITIME_BOOKING_PIPELINE.md`, `api.md`, `patient-booking.md`, `README.md`, `ROADMAP.md` |
| 7. Финальный closeout | `e823a581`, `f960825b`, `9e2ef6c3`, `13abe6d7` | partial-flag tests, plan/LOG ledger, docs reconciliation, post-audit plan/docs sync | targeted matrix + `tsc` + полный `pnpm run ci` (см. `ACCEPTANCE_MIRROR_SYNC.md` § «Верификация closeout») |

**Реконсиляция scope drift (closeout):**
- Промежуточный коммит `659f0166` включал смежные правки analytics/stats routes как CI-fix для общих зависимостей (`loadDoctorAnalyticsAudience`) и не менял контракт mirror hardening.
- В closeout-патче удалены случайно закоммиченные временные дампы `.tmp/db-sync/unified_bcb_webapp_prod_20260605_123244.dump` и `.tmp/db-sync/unified_bcb_webapp_prod_20260605_123251.dump`.
- Docs reconciliation (`9e2ef6c3`): surface-specific partial flags в `api.md`, контракте, `patient-booking.md`, pipeline; cross-refs в `README.md` / `ROADMAP.md` / `.cursor/plans/archive/README.md`.
- Итоговый source-of-truth: `ACCEPTANCE_MIRROR_SYNC.md` (матрица + команды проверок) + `BOOKING_MIRROR_INTEGRITY_CONTRACT.md` (поведение + defer).

**Проверки (локально):** канонический набор команд — [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) § «Авто-проверки» и § «Верификация closeout».

**Повторный аудит closeout (после ревью плана):**

| Замечание | Статус | Действие |
|-----------|--------|----------|
| `~/.cursor/plans/booking_mirror_integrity_hardening_8f043ac3.plan.md` оставался с `phase7: pending` и незакрытыми чекбоксами | закрыто | синхронизирован с архивом репозитория (`status: completed`, todos/checklists `[x]`) |
| Расхождение closeout-доков (`closeoutCommits`, execution ledger) | закрыто | `13abe6d7` — выравнивание plan YAML, LOG, ACCEPTANCE, contract, README, ROADMAP |
| Targeted matrix не была зафиксирована в LOG с числами прогона | закрыто | см. § «Верификация closeout» в `ACCEPTANCE_MIRROR_SYNC.md` |
| Полный `pnpm run ci` не был записан как фактический барьер | закрыто | прогон и результат — § «Верификация closeout» ниже |

```bash
# Targeted mirror matrix (webapp + integrator) — полный список в ACCEPTANCE_MIRROR_SYNC.md
# Post-audit (2026-06-05): webapp 20 files / 199 tests; integrator 4 files / 53 tests; tsc webapp+integrator — OK
pnpm install --frozen-lockfile && pnpm run ci  # post-audit — passed (~5 min)
```

## 2026-06-05 — Двусторонняя синхронизация Rubitime ↔ канон (`AppointmentMirrorSync`) — закрыто

**Сделано:**
- Модуль [`booking-appointment-sync/README.md`](../../apps/webapp/src/modules/booking-appointment-sync/README.md): `buildCanonicalInboundSnapshot`, fan-out merge, partial FK + warn, loop guard, `syncVersion`, outbound patch.
- Inbound: любой mapped `source`; recovery → immediate update; `events.ts`: mirror first → единый snapshot в `appointment_records`.
- Outbound: doctor + **admin** manual routes, **patient** cancel/reschedule (`patientMirrorOutbound.ts`); integrator `normalizeUpdateRecordPatch.ts`.
- Shared: `staffRubitimeMirrorOutbound.ts`.
- Документация синхронизирована: [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md), [`RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md), [`patient-booking.md`](../../apps/webapp/src/modules/patient-booking/patient-booking.md), [`booking-calendar.md`](../../apps/webapp/src/modules/booking-calendar/booking-calendar.md).

**Проверки:** см. ACCEPTANCE_MIRROR_SYNC (vitest matrix); `tsc` webapp — OK.

**Доработка (замечания ревью):** staff **cancel** — канон → Rubitime (не наоборот); убран мёртвый `skipped_native_owner`; лог echo-guard; тесты `patientMirrorOutbound`.

**Вне scope (без изменений):** DDL; real-time UI push; полный FSM redesign.

**Документация (синхронизация):** `README`, `ROADMAP`, `INVENTORY_AND_IA`, `ACCEPTANCE_MIRROR_SYNC`; `RUBITIME_BOOKING_PIPELINE`, `DB_STRUCTURE`; OWN_BOOKING — `LOG`, `STAGE_CHECKLISTS`, `CANONICAL_MODEL`, `UI_SURFACES_CHECKLIST`, `MASTER_PLAN`; `docs/README.md`; module README `booking-appointment-sync`, `patient-booking`, `booking-calendar`; план — [`.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md`](../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md) (`status: completed`).

## 2026-06-04 — Этап 5: агентская реализация (код + документация)

**Контекст:** реализация принятой IA по замечаниям владельца. Базис — блок «Принято владельцем» и «Решения владельца» ниже. Агентская часть выполнена, ожидает ручного прохода и подписи. Чек-лист: [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md).

### Сделано (код)

**Блок A — Admin «Настройки записи»:**
- `bookingAdminTabs.ts`: 12 вкладок → 4 (`overview`, `form-public`, `payments`, `integrations`); legacy `/catalog` → alias на overview.
- `layout.tsx`: заголовок «Запись» → «Настройки записи».
- `page.tsx` (overview): прокрутка — `BookingCatalogHelp` (runbook с якорными ссылками) → `BookingOverviewPanel` → `BookingSoloLocationsSection` → grid(services, availability) → `BookingRulesPageClient`.
- `BookingOverviewPanel`: удалена карточка «Быстрые действия».
- `BookingCatalogHelp`: все шаги runbook — кликабельные ссылки.
- `form-public/page.tsx`: создан (форма + виджет + attribution).
- Удалены route-папки: `locations/`, `services/`, `availability/`, `schedule/`, `form/`, `rules/`, `memberships/`, `public/`, `operations/`.

**Блок B — Навигация:**
- `doctorNavLinks.ts`: `admin-booking` метка «Запись» → «Настройки записи»; `booking-merge` перенесён из «Работа с пациентами» в «Администрирование».
- `doctorScreenTitles.ts`: все шаблоны заголовков обновлены; `doctorScreenTitles.test.ts` обновлён под 4-вкладочную структуру.

**Блок C — Страница «Записи» врача:**
- `ports.ts`: `AppointmentRow.dateKey`, `DoctorAppointmentsListFilter { kind: "past"; limit?; offset? }`.
- `service.ts`: `dateKey` вычисляется из `recordAtIso` в `Intl.DateTimeFormat("sv-SE", { timeZone })`.
- `pgDoctorAppointments.ts` (legacy) + `pgDoctorCanonicalAppointments.ts` (Drizzle): реализован `case "past"` с `ORDER BY DESC`, `LIMIT/OFFSET`.
- `DoctorAppointmentsListClient.tsx`: группировка по `dateKey`; sort ASC для `future`, DESC для `past`; ленивая подгрузка архива через `GET /api/doctor/appointments/list`.
- `DoctorCreateAppointmentDialog.tsx`: dialog — пациент + услуга + локация + datetime → POST `/api/doctor/booking-engine/appointments/manual`.
- `DoctorAppointmentsToolbar.tsx`: вкладки «Записи» / «Расписание» (schedule — только admin); кнопка «Создать запись».
- `appointments/page.tsx`: RSC; `?tab=` + `?view=`; schedule sections в guard `role=admin`.
- `GET /api/doctor/appointments/list`: новый endpoint, auth-guard, пагинация.

**Исправления после аудита кода:**
- Удалены неиспользуемые `useRouter`/`router` и prop `isAdmin` из `DoctorAppointmentsListClient`.
- Удалён неиспользуемый `useRef` из `DoctorCreateAppointmentDialog`.
- Исправлен порядок сортировки групп в архиве (ASC → DESC).
- Обновлён `doctorScreenTitles.test.ts` (тест для старых вкладок упал → исправлен).
- Удалён мёртвый код `BookingOperationsPageClient.tsx`.

### Сделано (документация)

- `DOCTOR_CABINET_NAVIGATION.md`: обновлены кластер «Администрирование» (строка 25), маршрут `/appointments` (строка 35, новые params), admin booking (строка 47, 4 вкладки вместо 9).
- `INVENTORY_AND_IA.md`: добавлена §1a «Навигация после этапа 5».
- `ACCEPTANCE_STAGE5.md`: создан.
- `ROADMAP.md`: этап 5 `pending` → `in_progress`; §11 — ссылка на ACCEPTANCE_STAGE5.

### Авто-проверки

- vitest: 42/42 (fast); `tsc --noEmit`: 0 ошибок; `eslint --max-warnings=0`: 0 предупреждений.

### Не делали / defer / открытые вопросы

- Создание абонементов на `/appointments` — не реализовано; ожидает решения владельца.
- Nav label «Записи» vs «Запись» — открытый вопрос.
- Touch long-press / resize smoke — defer из этапа 4.
- Warning при resize ≠ длительность услуги — defer (решение владельца §«Решения»).
- Ops: prod cutover `booking_doctor_appointments_read_source=canonical` — отдельный ops-журнал.

---

## 2026-06-04 — Этап 5: проход UI владельца (замечания, кабинет записи)

**Контекст:** ручной просмотр `/app/doctor/admin/booking` (вкладка «Обзор» и навигация по 12 вкладкам). Этап 5 в ROADMAP — `pending`; инициатива не закрывается без явного «Новый интерфейс записи принят».

### Замечания владельца (IA / UX)

| # | Тема | Замечание | Намеченное действие |
|---|------|-----------|---------------------|
| 5.1 | Обзор — дубли ссылок | Отдельный блок «Быстрые действия» (`BookingOverviewPanel`) избыточен: есть `BookingCatalogHelp` («Порядок настройки») с описанием шагов. Ссылки — в **названиях шагов** runbook, не во второй карточке. | Убрать карточку «Быстрые действия»; в `BookingCatalogHelp` сделать пункты списка ссылками на целевые разделы (после слияния вкладок — на якоря/подразделы одного экрана). |
| 5.2 | Локации + услуги + доступность + правила | Четыре вкладки — лишнее дробление; одна настройка каталога/доступности/политик. | Слить в **один экран** (секции или внутренние табы), вместе с обзором/runbook на **одной вкладке** «Настройка» / «Обзор» (уточнить финальное имя). |
| 5.3 | Абонементы и продукты vs Операции | Каталог пакетов/продуктов (`/memberships`) и patient-bound блоки на `/operations` (`BookingPatientPackagesSection`, `BookingPatientProductsSection`) логически один домен. | Один экран: каталог офферов + работа с абонементами/продуктами выбранного пациента; на «Операциях» оставить только manual lifecycle, merge и прочее **не** каталожное. |
| 5.4 | Форма + публичная запись | Две вкладки связаны по смыслу (вопросы записи + виджет/ссылка). | Один экран: `BookingSoloFormFieldsSection` + `BookingPublicWidgetSection` + attribution. |

**Не затронуто в первом проходе:** Оплата, Интеграция Rubitime, patient/public flow, touch DnD/resize (defer из этапа 4).

### Принято владельцем (2026-06-04, уточнение IA)

**Разделение «настройки» vs «работа»:**

| Зона | Назначение | Не здесь |
|------|------------|----------|
| **Настройки записи** (`/app/doctor/admin/booking`) | Как устроена запись: каталог, правила, форма, оплата, Rubitime | Рабочие действия с записями, расписание дня, абонементы пациента |
| **Рабочая «Запись»** (кабинет врача, рядом с календарём) | После настройки: сетка/календарь, актуальные записи, действия с выбранной записью | Вкладка «Операции» в админке |
| **Карточка клиента / кабинет врача** | Продажа и работа с абонементами/продуктами, списания, отвязка | Админка «Абонементы» как ежедневный экран |

**Настройки записи — 4 вкладки (принято):**

1. **Обзор и настройка** — runbook (ссылки в шагах), метрики, локации, услуги, доступность, правила.
2. **Форма и публичная запись**
3. **Оплата**
4. **Интеграция Rubitime**

**Рабочая зона «Запись» (принято, без слова «Операции»):**

- Вкладка/раздел в кабинете врача (не в admin booking): **расписание + записи** в одном рабочем месте с календарём (эволюция `/app/doctor/calendar` и связанных экранов).
- Layout: **слева** — список актуальных записей; **справа** — действия с выбранной записью (создать, перенести, отменить, …).
- **Клик по записи** — детали + те же действия (не отдельная абстрактная «операция» в меню настроек).
- Текущая admin-вкладка **«Операции»** (`BookingManualLifecycleSection`, merge) — **убрать из настроек**; lifecycle → рабочая «Запись» / деталь записи; merge пациентов — отдельный пункт кабинета (уже есть «Объединение пациентов» в nav).

**Абонементы и продукты:** каталог офферов может остаться в настройках (если нужен редкий CRUD); **ежедневная работа** — карточка клиента (`DoctorClientMembershipsPanel` и аналоги), не admin `/operations`.

**Расписание (рабочие часы, исключения):** настройка — в «Обзор и настройка» или подрежим календаря; **просмотр/редактирование дня** — в рабочей зоне с календарём, не отдельная admin-вкладка «Расписание».

### Решения владельца (2026-06-04, ответы на вопросы реализации)

| Тема | Решение |
|------|---------|
| Календарь vs «Запись» | **Отдельно.** Календарь не в правую колонку списка — на экран не влезает. |
| Admin nav | Пункт **«Настройки записи»** (не «Запись»). |
| Ручное создание / перенос / отмена | Только **работа врача** → страница **«Запись»** (`/app/doctor/appointments` или переименование), не admin. |
| Список слева | Без выбранной записи — нормальные **фильтры** (дни/даты); по умолчанию **будущие**, сгруппированные **по датам**; отдельно **архив** (прошедшие). |
| Настройка расписания (часы, исключения) | У **врача**, не в admin «Настройки записи». |
| «Обзор и настройка» (admin) | Одна **прокрутка**; на desktop блоки в **два ряда**, где нет широких таблиц. |
| Правила абонементов (past unlink и т.п.) | Остаются в **настройках записи** (редко меняются). |
| **Создание** абонементов (регулярная работа) | На **странице «Запись» врача**, не в admin. |
| Legacy URL admin booking | **Не нужны** редиректы. |
| Мердж пациентов | **Убрать** из главного меню врача; это **админская** задача, не отдельная вкладка «настройки записи» — разместить в общей **админ-зоне** (куда именно — при реализации). |
| `ACCEPTANCE_STAGE1` (старый список 12 вкладок) | **Снят** 2026-06-06; приёмка — [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md). |
| Warning при resize (duration ≠ service default) | Пока **не делать**; оставить в defer без блокировки этапа 5. |

**Уточнённая карта (код ещё не совпадает):**

- **Admin:** «Настройки записи» — обзор+каталог+правила (вкл. правила абонементов), форма+публичная, оплата, Rubitime. **Без** расписания, **без** операций, **без** мерджа.
- **Врач:** «Календарь» (отдельно); «Запись» — список+фильтры+архив, панель действий, ручной lifecycle, **создание абонементов**; **настройка расписания** — у врача (маршрут уточнить: календарь toolbar vs подраздел «Запись»).

### Открытые вопросы (осталось)

- Где именно в **админке** (не booking): «Мердж пациентов» — `admin/integrations`, `admin/technical`, отдельный пункт «Администрирование»?
- **Настройка расписания** у врача: отдельная вкладка внутри «Запись», кнопка из календаря, или оба?
- Переименование nav: «Записи» → «Запись» и слияние с текущим `/appointments`?

---

## 2026-06-04 — Этап 4: закрытие и синхронизация документации

- Этап 4 переведён в `done`: обновлены статусы и чеклисты в [`ROADMAP.md`](ROADMAP.md), [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md), [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md), [`README.md`](README.md), [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md), `apps/webapp/src/app/api/api.md`.
- Зафиксированы финальные решения реализации: `manual create` использует sync `createRecord` с rollback (hard delete/fallback cancel), `manual-reschedule` работает без compensating lifecycle-reschedule при Rubitime conflict, UI делает immediate refresh на `external_slot_taken`.
- Добавлен модульный документ `apps/webapp/src/modules/booking-calendar/booking-calendar.md` (канон feed, refresh policy, API contract).
- Defer в этап 5 / ops:
  - manual touch-smoke (long-press/resize на реальном устройстве) — owner acceptance;
  - предупреждение при resize на длительность ≠ стандарту услуги (UX polish);
  - prod ops cutover `booking_doctor_appointments_read_source=canonical` после staging smoke.

## 2026-06-04 — Этап 4: ревизия декомпозиции (уточнение)

- Убраны двусмысленные развилки в [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md): зафиксированы однозначные решения для `includeFreeSlots` (игнор в doctor route), `readSource=canonical`, поведения toggle `booking_calendar_show_working_hours`, контракта ошибок `409 external_slot_taken`.
- Уточнены gate'ы 4.0/4.1/4.3/4.7: без временных feature-flag на merge, старый grid удаляется, rollback для `manual-reschedule` описан как compensating reschedule.
- В [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md) добавлены проверки на key allowlist (`ALLOWED_KEYS` + admin settings route) и единый error-contract для `manual`/`manual-reschedule`.
- `ROADMAP.md` §10 синхронизирован с решениями этапа 4: canonical-only для календаря врача и явный rollback при Rubitime conflict.

## 2026-06-04 — Этап 4: декомпозиция (документы)

- Добавлены [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md) (блоки 4.0–4.8) и [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md).
- Решения владельца: UI читает только нашу БД; фон `working`/`break` из канона, без Rubitime free slots; toggle **`booking_calendar_show_working_hours`** (toolbar + admin); npm calendar/DnD + long-press + resize; toolbar solo+локация; Rubitime conflict → rollback + poll refetch; ops `booking_doctor_appointments_read_source=canonical` в 4.8.
- ROADMAP §10, README — ссылки на план исполнения.
- Отступление от OWN_BOOKING Q3 (custom grid без npm) — в STAGE4 «продуктовые решения».

## 2026-06-04 — Синхронизация документации (этап 3)

- Обновлены: `README.md` (инициатива + `docs/README.md`), `ROADMAP.md` §9 и таблица этапов, `STAGE3_DECOMPOSITION.md` (все DoD 3.0–3.6 `[x]`, baseline → «закрыто», полный список vitest), `ACCEPTANCE_STAGE3.md`, `INVENTORY_AND_IA.md` (ключ `booking_allow_doctor_unlink_past_package_sessions`), `memberships.md` (canonical path + ссылка на initiative).
- Ревью UI (после аудита): поздняя отвязка через `beginDetach` (двойной confirm для past); `isPast` в `runDetach` без гонки `pendingDetach`; сброс `history`/`notes` в `PatientPackageCard`.
- Проверка: vitest fast (пакет этапа 3) + `tsc` webapp — зелёные.

## 2026-06-04 — Этап 3: закрытие пробелов (после аудита)

- UI: collapsible **История** (`GET patient-packages/[id]`), preview комментария, **soldAt / validUntil / оплата** в карточке; кнопка **«Списать как оказанную»** при `canManualConsume`; тексты confirm по типу действия (unlink / refund / charge).
- Тесты: route `PATCH`/`GET detail`, `sessions?includePast`, `detach`/`unlink`/`refund`; расширен `patient-packages/route.test` (notes, manual без title); `service.test` (past guards, filter past sessions); RTL `PatientPackageSessionsList`, panel (history).
- Документы: `ACCEPTANCE_STAGE3.md`, `STAGE3_DECOMPOSITION.md`, `ROADMAP` §таблица этапов → **`done`**.
- Проверка: `vitest` fast 41 passed; `tsc` webapp green.

## 2026-06-04 — Этап 3: реализация 3.0–3.6 (код)

- API: `notes` на catalog offer + optional `title` manual; `PATCH patient-packages/[id]`; `GET .../sessions`; `POST .../package/detach` (+ wrappers unlink/refund); admin mirror тех же routes.
- Service/repo: `updatePatientPackageNotes`, `listPatientPackageSessions`, `detachAppointmentPackage` (late/past guards), `packageManualTitle`, `packageSessionLinkage`.
- Settings: `booking_allow_doctor_unlink_past_package_sessions` в `ALLOWED_KEYS` + UI `BookingPackagePastUnlinkSetting` на `/app/doctor/admin/booking/rules`.
- UI: `PatientPackageCard`, `PatientPackageSessionsList`, рефактор `DoctorClientMembershipsPanel` (без UUID/названия); parity `BookingPatientPackagesSection`.
- Docs: `memberships.md`, `api.md`.
- Проверки: vitest fast — `packageManualTitle`, `packageSessionLinkage`, `service.test` (вкл. detach late + auto-title), `DoctorClientMembershipsPanel.test`, `patient-packages/route.test`.

## 2026-06-04 — Этап 3: ревизия декомпозиции (уточнение)

- `STAGE3_DECOMPOSITION.md`: добавлены `Definition of Done` и `Scope boundaries` (что можно/нельзя менять), убраны двусмысленные «опциональные» ветки внутри scope.
- Зафиксирован единый контракт late detach: `POST .../package/detach` без `outcome` в late-window возвращает `409 late_detach_choice_required`; `unlink/refund` остаются wrappers.
- Уточнены контракты списка сеансов (`includePast=false|true`), путь UI-компонентов в doctor clients, и команды проверок (`tsc -p tsconfig.json` в `apps/webapp`).
- `ACCEPTANCE_STAGE3.md`: добавлен блок DoD, явные проверки API (`/sessions`, `/package/detach`) и точный ключ `system_settings` для прошедших отвязок.

## 2026-06-04 — Этап 3: декомпозиция (документы)

- Добавлены [`STAGE3_DECOMPOSITION.md`](STAGE3_DECOMPOSITION.md) (блоки 3.0–3.6, gates, API контракты, `system_settings` ключ §9.6) и [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md).
- ROADMAP §9 и README — ссылки на план исполнения.
- Решения в декомпозиции: комментарий → `be_patient_packages.notes`; период поздней отвязки → `freeCancelHoursBefore` из `booking-policies`; auto-title для manual без названия в UI.

## 2026-06-04 — Документация: синхронизация после закрытия этапа 2

- README, ROADMAP §8, STAGE2_DECOMPOSITION (DoD, статус), INVENTORY §5.2–5.3, ACCEPTANCE_STAGE2, `docs/README.md`.
- Plan: `.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md` — todos `completed`.
- Исправлены устаревшие «Не делали / отложено» в записи «Этап 2: реализация» (api.md и INVENTORY обновлены в блоке аудита).

## 2026-06-04 — Этап 2: закрытие (аудит → исправления)

### Доработки по аудиту

- Link route: verify `resolveLegacyBranchServiceId` после save; расширены route tests.
- Dialog: pre-fill legacy Rubitime targets из существующего `branchServiceId`.
- Deprecation log при legacy `branchServiceId` в `resolveInPersonBranchServiceId`.
- Тесты: `BookingRubitimeMappingSection`, `loadBookingAdminOverview`, dual-input slots/create/memberships/products, `legacyProjection` availability fallback.
- Public deep link: canonical `branchId+serviceId` через `resolveInPersonContext`.
- Документация: `api.md`, `INVENTORY_AND_IA.md` §5.3, `ACCEPTANCE_STAGE2.md`, ROADMAP §8 → `done`.

### 2.3b (ops gate — вне кода)

- **`booking_slots_read_source=canonical`:** после smoke и `mapped_ok` на staging/prod (ops).
- **`booking_doctor_appointments_read_source=canonical`:** defer → **этап 4** (календарь).

### Проверки

- Targeted vitest (fast): rubitime-mapping, patient-booking resolve/catalog, booking routes, mapping UI, overview.
- `pnpm run ci` — зелёный (2026-06-04); fix: port-based Deps вместо import buildAppDeps в modules.

## 2026-06-04 — Этап 2: реализация (2.0–2.3a)

### Сделано

- **2.0:** `rubitime-mapping/link` — upsert legacy `booking_branch_services` + SSA + `be_external_entity_mappings` (`legacy_branch_service_id`); route tests.
- **2.1:** `GET rubitime-mapping`, `BookingRubitimeMappingSection`, реорганизация integrations; удалён дубль branch-service из `RubitimeSection`; overview warnings через `rubitimeMapping.listMappings({ problemsOnly: true })`.
- **2.2:** центральный `resolveInPersonBranchServiceId`; fail-closed в memberships/products available при unmapped canonical pair.
- **2.3a:** dual-input slots/create (API); `GET /api/booking/in-person-services`; patient/public wizard — primary `{ branchId, serviceId }`; legacy `branchServiceId` сохранён для reschedule/deep links.

### Проверки

- vitest (fast): rubitime-mapping routes, computeStatus, inPersonBookingResolve, inPersonServicesCatalog, RubitimeSection, ServiceStepClient, SlotStepClient, ConfirmStepClient
- `pnpm exec tsc --noEmit -p apps/webapp`

### Не делали / defer (актуально на закрытие этапа 2)

- **2.3b ops:** `booking_slots_read_source=canonical`, staging smoke create — ops на staging/prod (см. блок «закрытие» выше).
- **`booking_doctor_appointments_read_source=canonical`:** defer → **этап 4**.
- Приёмка владельца по [`ACCEPTANCE_STAGE2.md`](ACCEPTANCE_STAGE2.md) §2.1–2.2 (код + авто OK; ручной smoke staging — ops).

## 2026-06-04 — Этап 2: ревью и уточнение декомпозиции

### Изменения после проверки кода

- Добавлен обязательный блок **2.0 Link service**: `upsertBranchServiceAdmin` не пишет SSA/`be_external_entity_mappings` — runtime-связь только из backfill `0087`; UI save должен идти через `POST .../rubitime-mapping/link`.
- Трёхслойная модель маппинга (entity + SSA + availability metadata) задокументирована.
- Статусы расширены: `ssa_missing`, `branch_unmapped`, `specialist_unmapped`, `service_unmapped`, приоритет primary status.
- 2.1: убрать дубль branch-service matrix из `RubitimeSection`; overview warnings ↔ один read API.
- 2.2: явно разделено «уже в этапе 1» vs «patient wizard ещё cityCode + legacy catalog».
- 2.3: split 2.3a (API + patient catalog по branchId) / 2.3b (cutover; appointments defer → этап 4).
- Исправлены команды vitest (`pnpm --dir apps/webapp`).

### Сделано ранее (2026-06-04)

- Первая версия декомпозиции 2.1–2.3, ACCEPTANCE_STAGE2, ссылки в ROADMAP/README.

## 2026-06-04 — Этап 1: замечания аудита (финал)

### Сделано

- Reverse-resolve `branchId + serviceId → branchServiceId`: `resolveLegacyBranchServiceId` (port + pg), API `GET /api/admin/booking-engine/resolve-branch-service`.
- Публичный виджет: выбор локации + услуги; city code и `branchServiceId` резолвятся на сервере; UUID не показывается в UI.
- Probe слотов: `GET /api/admin/booking-engine/slots-probe` через `patientBooking.getSlots` (тот же путь, что у пациента).
- UX: «Показывать пациентам» / «Доступна пациентам», «Отключить» для интервалов; ACCEPTANCE обновлён.

### Проверки

- vitest (fast): `resolve-branch-service/route.test.ts`, `slots-probe/route.test.ts`, `bookingSoloAdminApi.test.ts`, `bookingAdminTabs.test.ts`
- `pnpm exec tsc --noEmit -p apps/webapp`

### Не делали (на момент записи)

- Ручная приёмка solo UX (устаревший чек-лист stage1) — перенесена в [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md). Этап 2 (patient API `{ branchId, serviceId }`) — **выполнен позже**, см. записи «Этап 2» ниже.

## 2026-06-04 — Этап 0: Инвентаризация и IA

### Сделано

- Составлена карта текущих 10 вкладок `/app/doctor/admin/booking` (маршруты, компоненты, API).
- Для каждой вкладки зафиксировано: что остаётся, переносится в integration/advanced, переименовывается, скрывается из UX.
- Описаны источники данных: `be_*`, `booking_*`, `patient_bookings`, `appointment_records`, `be_external_entity_mappings`, `system_settings`.
- Задокументирована зависимость in_person от `branchServiceId` и двухфазный plan (скрыть в UX → canonical `{ branchId, serviceId }` на этапе 2).
- Проверены grep-зависимости `branchServiceId`, `roomId`/`be_rooms`, read-source switches.
- Создан [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) — целевая IA на 12 вкладок.

### Решения

- Solo-specialist: специалист и кабинет не показываются в основном UX; Rubitime-дубли — только integration tab.
- `roomId` скрывается с default/null strategy; таблицы не удаляются.
- Read-source switches остаются на вкладке интеграции; конфликт — предупреждение в обзоре.
- Онлайн-ветка записи вне scope инициативы.

### Проверки

- `rg branchServiceId apps/webapp/src` — inventory в INVENTORY_AND_IA §5.2
- `rg "roomId|be_rooms|specialist-rooms" apps/webapp/src apps/webapp/db` — §6
- `rg "booking_slots_read_source|booking_doctor_appointments_read_source" apps/webapp/src` — §7

### Не делали (этап 0)

- Изменения API create/slots.
- Migrations / DDL.

## 2026-06-04 — Этап 1: исправления по аудиту

### Сделано

- Доступность: `branchId` в `specialist_service` при toggle матрицы.
- Обзор: подсчёт услуг без доступности через обе таблицы; расписание на ближайшие 7 дней; расширенные предупреждения Rubitime-маппинга.
- Локации: `sortOrder`; услуги: `onlinePaymentApplicable`.
- Форма: последовательный reorder, обработка ошибок через `apiJson`.
- Расписание: убрана двойная загрузка часов; исключения — `pickDefaultSpecialist`.
- Probe: пояснение при `booking_slots_read_source=rubitime`.
- Тексты без «Канон»; вкладка «Интеграция Rubitime».

### Проверки

- vitest fast: `bookingAdminTabs`, `bookingSoloAdminApi`, `doctorScreenTitles` — OK
- `tsc` webapp — OK

## 2026-06-04 — Этап 1: Solo UX (реализация завершена, ожидает приёмки)

### Сделано

- Навигация: 12 вкладок; `/catalog` → redirect `/locations`; «Абонементы и продукты».
- Solo-секции: `BookingSoloLocationsSection`, `BookingSoloServicesSection`, `BookingSoloAvailabilitySection`, `BookingSoloScheduleSection`, `BookingSoloFormFieldsSection`, `bookingSoloAdminApi.ts`.
- Обзор: рабочие метрики, предупреждения (доступность, fallback, read-source, неполный Rubitime-маппинг).
- Услуги: рубли, описание, абонементы, предоплата, «Доступна пациентам».
- Расписание: интервалы по локации, копирование дня, буфер, min notice (`booking_min_notice_hours`), исключения solo UX, probe слотов.
- Форма: конструктор вопросов без технических ключей.
- API: `scheduling-settings` (buffer + min notice), фильтр слотов по min notice.

### Не делали (этап 1)

- Ручная приёмка solo UX — см. [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md) (устаревший `ACCEPTANCE_STAGE1` снят 2026-06-06).
- Этап 2+: полный Rubitime adapter UI — **выполнено** (см. LOG «Этап 2»).

### Проверки

- vitest (fast): `bookingAdminTabs.test.ts`, `bookingSoloAdminApi.test.ts`, `doctorScreenTitles.test.ts`

## 2026-06-04 — Этап 1: Solo UX (часть 1)

### Сделано

- Навигация: 12 вкладок; `/catalog` → redirect `/locations`.
- `BookingSoloLocationsSection`, `BookingSoloServicesSection`, `BookingSoloAvailabilitySection`, `bookingSoloAdminApi.ts`.
- Обзор: рабочие метрики, без jargon Канон/Rubitime.
- Цена в рублях; доступность услуга × локация; вкладка «Абонементы».
- Расписание: solo-режим, «Исключения», probe с локацией.

### Осталось в этапе 1

- Редактор рабочих часов (интервалы, копирование, буфер, min notice).
- Конструктор формы.
- Ручная приёмка solo UX — см. [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md).

### Проверки

- vitest: `bookingAdminTabs.test.ts`, `bookingSoloAdminApi.test.ts`, `doctorScreenTitles.test.ts` — OK
