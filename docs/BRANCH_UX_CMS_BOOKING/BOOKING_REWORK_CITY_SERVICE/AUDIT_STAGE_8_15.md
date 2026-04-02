# Formal Audit: Stages 8-15 (Booking Rework City Service)

Date: 2026-04-02
Auditor: Cursor agent (gpt-5.3-codex-high)
Scope: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/` (Stages 8-15)

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
  - Executed full `pnpm run ci` on current HEAD `a7799e8d3ca79a6fe4813d1a4983c36e3f95f17e`: passed (lint/typecheck/tests/build/audit).

## 2) Stage-by-Stage Result

- Stage 8 (policy legacy-off, docs-sync, SHA traceability): **partially passed** (policy present), **failed on docs-sync/traceability completeness**.
- Stage 9-10 (online intake contracts + migrations + API): **implemented partially**, several contract-to-code mismatches.
- Stage 11 (compat-sync Rubitime -> patient_bookings): **implemented partially**, critical gap for unlinked records + missing promised enrichment.
- Stage 12 (patient online wizard LFK + nutrition): **UI flows present**, but relies on Stage 9-10 backend pieces that are incomplete.
- Stage 13 (doctor/admin inbox + notifications): **base inbox present**, but data/notification contract is incomplete.
- Stage 14 (release hardening/runbook/rollback): **docs exist**, monitoring/rollback sections present.
- Stage 15 (final CI and readiness): **CI green confirmed**, but readiness evidence in docs/logs remains incomplete.

## 3) Checklist vs Execution Log Mismatches

- `CHECKLISTS.md` section "Stages 8-15 release readiness" has open items:
  - online-safe gate is not closed;
  - per-stage final SHA+CI date logging is incomplete.
- `EXECUTION_LOG.md` still states overall readiness for stages 8-15 while these checklist items remain open.
- Stage index in folder README references `STAGE_8_*`, `STAGE_10_*` ... `STAGE_15_*`, but these files are absent from the folder.

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

- Where:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`
- Risk:
  - Release auditability is weakened: stage references point to missing documents; per-stage SHA/CI evidence is not complete while readiness is declared.
- Reproduce:
  1. Check stage file index in folder README: references to `STAGE_8_*`, `STAGE_10_*` ... `STAGE_15_*`.
  2. List tracked files: only `STAGE_1..7` and `STAGE_9` exist.
  3. Compare checklist section for stages 8-15: open items remain unchecked.
- Fix:
  - Restore docs consistency:
    - either create missing stage docs,
    - or correct stage index to actual document structure.
  - Complete execution log with per-stage final SHA + CI date and align readiness statement with checklist state.

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

## 6) Verdict

**rework_required**

Rationale: critical compat-sync gap plus multiple major contract-to-code mismatches across Stage 9-13 and incomplete Stage 8/15 traceability evidence.

## 7) Release Recommendation

Do not approve release for Stages 8-15 as formally complete until F-01..F-05 are closed and checklist/readiness evidence is synchronized with execution log.
