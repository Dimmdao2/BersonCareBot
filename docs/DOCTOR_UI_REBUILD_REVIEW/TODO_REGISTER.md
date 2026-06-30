# TODO Register — Doctor UI Rebuild (S5.1 sweep, 2026-06-16)

Registered TODOs that require owner decision, backend work, or significant scope.
All plan-doc cross-ref markers (TODO#2, TODO#3) were cleaned from source files in this sweep.

## Open TODOs

| # | File | Line | Category | Description | Recommendation |
|---|------|------|----------|-------------|----------------|
| T01 | `apps/webapp/src/app/app/doctor/broadcasts/labels.ts` | 64 | backend | AUDIT-BACKLOG-010/011: `inactive` and `sms_only` audience segments lack a precise filter in `DoctorClientsPort` — recipient count falls back to all clients | Owner to review segment accuracy requirements; implement dedicated filters in `DoctorClientsPort` when targeting these segments |
| T02 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx` | 725–731 | backend | PWA install / push-notification status not tracked in current schema; section shows "нет данных" | Add `pwa_install_status` / `push_subscribed` to `platform_users` when PWA tracking is implemented |
| T03 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx` | 882 | backend | `rubitime_id` not in `PatientCardHeader`; would come from `ClientIdentity` | Expose `integratorUserId` from `pgDoctorClients.getPatientCardHeader` (join on `integrator_clients`) |
| T04 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabAccount.tsx` | 891 | backend | `identity.createdAt` not in `PatientCardHeader`; available in `ClientIdentity` / `platform_users` | Add `createdAt` to `PatientCardHeader` identity (`SELECT platform_users.created_at`) |
| T05 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabProgram.tsx` | 13 | enhancement | Port: add `DoctorClientActiveProgramPanel` + `DoctorClientProgramInbox` to the program tab for a richer embedded view | Expand `PatientTabProgram` when program-inbox depth is prioritised; secondary CTA "Открыть полный вид" already present as bridge |
| T06 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.tsx` | 8, 71, 110 | integration | Bridge from visit records to Карта tab: `hasVisitRecord` flag missing from `PatientAppointmentItem` model; `openTab` event is dispatched but `PatientCardClient` listener not wired | (a) Add `hasVisitRecord: boolean` to `PatientAppointmentItem` port + DB query; (b) wire `patient:open-tab` listener in `PatientCardClient` |
| T07 | `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/mockData.ts` | 4 | backend | Location / service / duration option lists are empty stubs; free-text input used instead | Replace with real catalog fetch from booking/appointments API when structured catalog is available |
