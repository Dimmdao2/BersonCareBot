# Formal Audit: Stages 8-15 (Booking Rework City Service)

Date: 2026-04-02 (code/contract pass; см. §1)
Last doc-sync update: 2026-04-03 (variant B, GLOBAL_FIX Stage 6 F-05)
Auditor: Cursor agent (gpt-5.3-codex-high)
Scope: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/` (Stages 8-15)

Два слоя: **(A)** реестр находок по коду/контрактам (§2, §4, §6b) — исторический снимок и открытые продуктовые пункты; **(B)** согласованность docs SSOT variant B — `README` / `CHECKLISTS` §7 / `EXECUTION_LOG` / online-safe gate (§3, §6a).

## 1) Audit Method and Evidence

- Code verification:
  - `apps/webapp/migrations/048_online_intake.sql`
  - `apps/webapp/migrations/049_patient_bookings_compat_source.sql`
  - `apps/webapp/src/modules/online-intake/*`
  - `apps/webapp/src/app/api/patient/online-intake/*`
  - `apps/webapp/src/app/api/doctor/online-intake/*`
  - `apps/webapp/src/app/app/patient/intake/*`
  - `apps/webapp/src/app/app/doctor/online-intake/*`
  - `apps/webapp/src/modules/integrator/events.ts`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`
  - `apps/integrator/src/integrations/rubitime/{connector.ts,recordM2mRoute.ts,legacyResolveFlag.ts}`
  - `apps/integrator/src/infra/db/writePort.ts`
- Documentation/log verification:
  - `README.md` (in this folder), `CHECKLISTS.md`, `EXECUTION_LOG.md`
  - `STAGE_9_ONLINE_INTAKE.md`, `API_CONTRACT_ONLINE_INTAKE_V1.md`, `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md`
  - `COMPATIBILITY_RUBITIME_WEBAPP.md`, `CUTOVER_RUNBOOK.md`
- CI/log check:
  - Исторический прогон (2026-04-02): full `pnpm run ci` на HEAD `a7799e8d3ca79a6fe4813d1a4983c36e3f95f17e` — passed.
  - Docs SSOT / CHECKLISTS §7 (variant B): консолидация и таблица SHA+CI зафиксированы на HEAD `b8c08689bf7c49e790cf1691d6af6396a4b59774` (2026-04-03), см. `EXECUTION_LOG.md` «SHA + CI traceability».

## 2) Stage-by-Stage Result

Ниже — **результаты проверки кода и контрактов** на дату первичного аудита (§1). Они **не** отменяют закрытие docs-контура variant B (§3, §6a).

- Stage 8 (policy legacy-off, docs-sync, SHA traceability): **partially passed** (policy present). *До remediation F-05:* docs-sync/traceability считались неполными; *после variant B (Stage 6 F-05):* docs SSOT — §6a.
- Stage 9-10 (online intake contracts + migrations + API): **implemented partially**, several contract-to-code mismatches.
- Stage 11 (compat-sync Rubitime -> patient_bookings): **implemented partially**, critical gap for unlinked records + missing promised enrichment.
- Stage 12 (patient online wizard LFK + nutrition): **UI flows present**, but relies on Stage 9-10 backend pieces that are incomplete.
- Stage 13 (doctor/admin inbox + notifications): **base inbox present**, but data/notification contract is incomplete.
- Stage 14 (release hardening/runbook/rollback): **docs exist**, monitoring/rollback sections present.
- Stage 15 (final CI and readiness): **CI green** в снимке §1; **docs readiness** для CHECKLISTS §7 (variant B) — §6a; **продуктовый** readiness по F-01–F-04 — открыт (§6b).

## 3) Checklist vs Execution Log Mismatches

- **Remediation (variant B, Stage 6 GLOBAL_FIX):** `CHECKLISTS.md` §7 и `EXECUTION_LOG.md` секция «SHA + CI traceability» синхронизированы; online-safe gate сформулирован как «документированное закрытие + операционные критерии §6.2–6.3» (см. `CUTOVER_RUNBOOK.md` §6).
- Историческое замечание: readiness в логе при открытых checklist-пунктах — **снято** для docs-контура после синхронизации.
- Индекс Stages 8–15 в `README.md` **не** ссылается на несуществующие `STAGE_8_*.md` … `STAGE_15_*.md`; отдельный файл — только `STAGE_9_ONLINE_INTAKE.md`, остальное — `EXECUTION_LOG` / `AUDIT_STAGE_8_15.md`.

## 4) Findings

### [critical] F-01 - Compat-sync create path fails for unlinked Rubitime records

- Where:
  - `apps/webapp/migrations/040_patient_bookings.sql`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`
  - `apps/webapp/src/modules/integrator/events.ts`
- Risk:
  - Manual Rubitime records without resolved `platform_user_id` cannot be inserted into `patient_bookings`.
  - Integrator event ingest returns `503`, causing retries and preventing "compat row" creation for this class of records.
- Reproduce:
  1. Send `appointment.record.upserted` event where phone/integrator user cannot be resolved to webapp user.
  2. Handler calls `applyRubitimeUpdate -> upsertFromRubitime` with `userId = null`.
  3. Insert into `patient_bookings.platform_user_id` (NOT NULL) fails.
  4. `/api/integrator/events` returns non-accepted (`503`).
- Fix:
  - Choose and implement one consistent model:
    - either allow nullable `platform_user_id` for compat rows (schema + domain + UI handling),
    - or persist such rows in a separate queue/table and link later.
  - Align `COMPATIBILITY_RUBITIME_WEBAPP.md` with actual enforced model.

### [major] F-02 - Doctor intake API does not return patient identity fields declared by contract/UI

- Where:
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
  - `apps/webapp/src/app/api/doctor/online-intake/route.ts`
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md`
- Risk:
  - Doctor inbox cannot reliably display patient name/phone; contract and UI expectations diverge from backend payload.
- Reproduce:
  1. Create intake request via patient API.
  2. Call `GET /api/doctor/online-intake`.
  3. Response items are built from `online_intake_requests` only (no join to patient profile), so `patientName/patientPhone` are absent.
- Fix:
  - Extend repository query for doctor list/details to join patient source (`platform_users`/projection) and return contract fields.
  - Add route tests for doctor endpoints to lock response shape.

### [major] F-03 - `attachmentFileIds` accepted by API but dropped in persistence

- Where:
  - `apps/webapp/src/app/api/patient/online-intake/lfk/route.ts`
  - `apps/webapp/src/modules/online-intake/types.ts`
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/{STAGE_9_ONLINE_INTAKE.md,API_CONTRACT_ONLINE_INTAKE_V1.md}`
- Risk:
  - Users think file attachments are submitted, but backend does not store file references (`online_intake_attachments` only gets URL rows from current flow).
- Reproduce:
  1. POST `/api/patient/online-intake/lfk` with non-empty `attachmentFileIds`.
  2. Inspect DB rows for request in `online_intake_attachments`.
  3. No rows are created from `attachmentFileIds`.
- Fix:
  - Implement mapping `attachmentFileIds -> attachment_type='file'` rows (`s3_key` or media reference contract).
  - Add validation + tests for mixed URL/file attachments.
  - If file attachments are intentionally postponed, remove field from contract and UI.

### [major] F-04 - Stage 11 DoD claims "full compat" fields that are not actually resolved

- Where:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`
- Risk:
  - Audit/readiness can be falsely green while compat rows remain degraded (no real branch_service resolution despite DoD wording).
- Reproduce:
  1. Trace compat create/update path in `upsertFromRubitime`.
  2. Observe no lookup for `branch_service_id`; compat rows are inserted with `branch_service_id = null`.
  3. Compare with DoD text requiring branch_service resolution for full compatibility.
- Fix:
  - Either implement actual lookup by Rubitime IDs and fill `branch_service_id`/related labels,
  - or downgrade/clarify DoD and `compat_quality` criteria to match implemented behavior.

### [major] F-05 - Stage 8 docs-sync and Stage 15 SHA traceability are incomplete

- **Status:** addressed (variant B, Stage 6 GLOBAL_FIX): индекс в `README.md` приведён к фактам; `EXECUTION_LOG.md` содержит таблицу SHA+CI для Stages 8–15; `CHECKLISTS.md` §7 закрыт; `COMPATIBILITY_RUBITIME_WEBAPP.md` без ссылки на несуществующий `STAGE_11_*.md`.
- Where (historical):
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`

### [minor] F-06 - Notification deep-link does not point to specific request card

- Where:
  - `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_9_ONLINE_INTAKE.md`
- Risk:
  - Lower operational efficiency: notification opens generic list instead of exact intake request.
- Reproduce:
  1. Trigger intake notification.
  2. Observe generated link is `/app/doctor/online-intake` without request id.
  3. Compare with stage doc expectation of deep-link to request card.
- Fix:
  - Include `requestId` in generated link.
  - Add corresponding doctor detail page (or update docs if list-only UX is intended).

## 5) Residual Risks (non-blocking if accepted explicitly)

- Legacy-off global switch remains intentionally deferred until online-safe gate closure (documented).
- Notification relay is best-effort by design; failures do not block intake creation.
- Compat backfill for pre-Stage-11 historical Rubitime records is still manual/runbook-driven.

## 6) Verdicts

### 6a) Docs SSOT and checklist (variant B, GLOBAL_FIX Stage 6 F-05)

**pass**

- `README.md`: индекс Stages 8–15 без ссылок на несуществующие `STAGE_8_*.md` … `STAGE_15_*.md` (кроме `STAGE_9_ONLINE_INTAKE.md`).
- `CHECKLISTS.md` §7 и `EXECUTION_LOG.md` (в т.ч. «SHA + CI traceability», итог Stages 8–15) согласованы; online-safe gate закрыт в смысле **документированного** variant B (операционные шаги §6.2–6.3 в `CUTOVER_RUNBOOK.md` — у оператора).
- Пункт F-05 (индекс, SHA+CI таблица, отсутствие битых ссылок на `STAGE_11_*.md`) — **closed** в docs-контуре.

### 6b) Code and contract audit (registers §4, F-01–F-04)

**rework_required**

Rationale: критическая и major находки по compat-sync и контрактам (F-01–F-04) остаются открытыми на уровне продукта/кода; это **не** блокирует пункт **6a** при явном разделении scope.

## 7) Release Recommendation

- **Docs / CHECKLISTS §7 (readiness документации Stages 8–15, variant B):** satisfied — см. §6a и `EXECUTION_LOG.md`.
- **Полный продуктовый sign-off Stages 8–15** по реестру F-01–F-04: до закрытия находок в коде/схеме или явного изменения контрактов — **не** считать завершённым (§6b).

---

## 8) Stage summaries (variant B — minimal SSOT)

Ниже — краткая карта Stages 8–15 без отдельных `STAGE_N_*.md` (кроме Stage 9). Полные задачи и CI — в `EXECUTION_LOG.md`.

| Stage | Scope | Что сделано (репозиторий) | Evidence |
|------|--------|---------------------------|----------|
| 8 | Policy legacy-off, индексы docs, SHA-шаблон | Policy в `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md` / `CUTOVER_RUNBOOK` §6; записи в `EXECUTION_LOG` §Stage 8; `COMPATIBILITY_RUBITIME_WEBAPP.md` | §Stage 8 в `EXECUTION_LOG.md` |
| 9 | Online intake спека + контракты | `STAGE_9_ONLINE_INTAKE.md`, `API_CONTRACT_ONLINE_INTAKE_V1.md`, `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md` | Файлы + §Stage 9 в `EXECUTION_LOG.md` |
| 10 | DB + service + API intake | `048_online_intake.sql`, `online-intake` module, routes patient/doctor | §Stage 10 в `EXECUTION_LOG.md` |
| 11 | Compat-sync | `049_patient_bookings_compat_source.sql`, `events.ts`, `pgPatientBookings.ts`, integrator connector/writePort | `COMPATIBILITY_RUBITIME_WEBAPP.md`, §Stage 11 |
| 12 | Patient wizard online | Intake LFK/nutrition, `CabinetIntakeHistory`, ссылки из booking wizard | §Stage 12 |
| 13 | Doctor inbox + notifications | `DoctorOnlineIntakeClient`, `intakeNotificationRelay` | §Stage 13 |
| 14 | Hardening | `CHECKLISTS` / `CUTOVER_RUNBOOK` monitoring, limitations | §Stage 14 |
| 15 | Final CI | Полный `pnpm run ci`, зафиксировано в логе | §Stage 15, таблица SHA+CI |
