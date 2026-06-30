# TODO Register — Doctor Cabinet Rebuild

> Remaining code-level TODOs surfaced during S5.1 sweep (2026-06-17). Each item is
> either a future enhancement or a tracked gap; none are regressions or critical bugs.

---

## DR-001 — Duration field in TodayAppointmentItem for current-appointment detection
**File**: `src/app/app/doctor/DoctorCurrentAppointmentCard.tsx:32`  
**Context**: Current appointment is determined by `startsAt` only; duration unavailable in `TodayAppointmentItem`.  
**Impact**: Low — detection works but an appointment is "current" until the next one starts.  
**Action**: Add `durationMin` to `TodayAppointmentItem` + DB query; use to compute end time.

## DR-002 — Contact info missing from TodayAppointmentItem
**File**: `src/app/app/doctor/DoctorCurrentAppointmentCard.tsx:117`  
**Context**: Doctor's current appointment card has no phone/contact block (not in model).  
**Impact**: Low — contacts visible in appointment detail modal.  
**Action**: Add `patientPhone` to `TodayAppointmentItem`.

## DR-003 — Audience filter count accuracy for un-segmented broadcasts
**File**: `src/app/app/doctor/broadcasts/labels.ts:64`  
**Context**: Segments without full `DoctorClientsPort` filter (e.g. `inactive`, `without_appointment`) show total-client count.  
**Impact**: Low — counts are approximate (over-estimate); accurate count needs SQL-level filter.  
**Related**: AUDIT-BACKLOG-010/011 in buildAppDeps.

## DR-004 — PWA install / push subscription status not tracked per user
**File**: `src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx:725,731`  
**Context**: Учётка "PWA/App" block is a placeholder — push subscription state not in DB schema.  
**Action**: Add `push_subscriptions` table or flag on `platform_users`; expose in PatientCardHeader.

## DR-005 — Rubitime ID not exposed in PatientCardHeader
**File**: `src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx:882`  
**Context**: Учётка "Rubitime ID" block has no data — `rubitime_id` not loaded in card header.  
**Action**: Add `rubilimeId` to PatientCardHeader query (JOIN `rubitime_client_mappings`).

## DR-006 — Registration date (createdAt) not in PatientCardHeader
**File**: `src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx:891`  
**Context**: Учётка "Дата регистрации" block has no data — `createdAt` not in card header response.  
**Action**: Add `createdAt` from `platform_users` to PatientCardHeader query.

## DR-007 — Visit record presence flag in appointment model
**File**: `src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.tsx:71`  
**Context**: `hasVisitRecord` hardcoded `false` — `PatientAppointmentItem` lacks this field.  
**Impact**: UI can't visually distinguish appointments with/without a saved visit note.  
**Action**: Add `hasVisitRecord: boolean` to `PatientAppointmentItem` (JOIN `patient_visits`).

## DR-008 — File upload large files (multipart / presigned S3 PUT)
**File**: `src/app/api/doctor/patients/[userId]/files/route.ts:8,131`  
**Context**: Current upload is full body read into memory; no S3 presigned URL path.  
**Impact**: Files > ~50MB may time out or OOM.  
**Action**: Implement presigned PUT URL endpoint; client uploads directly to S3.

## DR-009 — Client search in SQL (firstName/lastName/email)
**File**: `src/modules/doctor-clients/clientSearchMatch.ts:3`  
**Context**: Client search is client-side JS filter over pre-loaded list. Large practices (1000+ patients) may slow down.  
**Action**: Add SQL full-text search on `first_name`, `last_name`, `email` columns.

## DR-010 — Patient category definitions (client/potential/subscriber)
**File**: `src/modules/doctor-clients/ports.ts:34,39,44`  
**Context**: Definitions of "пациент", "потенциальный клиент", "подписчик" are approximate / TODO.  
**Related**: BIG-01 initiative (patient category system).  
**Action**: Implement as part of BIG-01 when scheduled.
