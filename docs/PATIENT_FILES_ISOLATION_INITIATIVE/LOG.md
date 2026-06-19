# Patient Files Isolation Initiative — Decision Log

This file records escalations, decisions, and known gaps discovered during PFI implementation.

---

## O3 — Doctor individual-exercise video entry point (Rule 5)

Decision date: 2026-06-19
Status: GAP documented (plan A from ESCALATIONS.md)

Finding: No doctor-side route/UI for recording video of individual exercises during appointment exists in the codebase as of 2026-06-19.

Patient-side: `apps/webapp/src/app/api/patient/media/program-submission/presign/route.ts` correctly routes to `pgEnsureClientPatientFolder`. The patient calls this route to upload their own exercise video, which lands in their `client_patient` folder under «Пациенты».

Helper: `pgEnsureClientPatientFolder` is exported from `apps/webapp/src/app-layer/media/clientMediaFolders.ts` and is usable by future doctor routes without any additional wiring.

Connection point: When a doctor-side individual-exercise presign route is created, it must call `pgEnsureClientPatientFolder(patientUserId, ...)` — using the **patient's** userId (not the doctor's) — to route the video to the correct patient folder.

Test coverage: `apps/webapp/src/app-layer/media/clientMediaFolders.test.ts` (PFI-ST-08) contains 6 unit tests proving the re-export is callable and the return shape (`kind === "client_patient"`, `parentId === root.id`, `patientUserId` matches) is correct.

Future task: Create doctor-side presign route at e.g. `/api/doctor/treatment-program-instances/[instanceId]/media-presign`. The route must:
1. Authenticate the doctor session.
2. Resolve the `patientUserId` from the `instanceId`.
3. Call `pgEnsureClientPatientFolder(patientUserId)` to obtain/create the patient folder.
4. Use the returned `folder.id` as `folderId` when inserting the pending media record.

---

## PFI Initiative — Final Status (2026-06-19)

All 9 implementation stages closed. Root folder renamed «Пациенты»; per-patient subfolders use ФИО+last4 naming; patient-subtree excluded from general library view; uploads link to patient folder; move-out blocked; rename gate granular; docs updated.

| Stage | What | Verdict |
|-------|------|---------|
| ST-01 | «Пациенты» root + ФИО naming + legacy compat | CLOSED-backend (f6e9877b) |
| ST-02 | last4 phone dedup suffix | CLOSED-backend (258500e6) |
| ST-03 | excludeClientFiles regression guard | CLOSED-backend (258500e6) |
| ST-04 | patient_files.media_file_id FK + upload route | CLOSED-backend (605f4113) |
| ST-05 | PatientTabFiles «В библиотеке» badge | CLOSED-2seals (0de06444; verify-seals exit 0) |
| ST-06 | Rename gate: client_patient allowed, root denied | CLOSED-backend (630c34d9) |
| ST-07 | Move-out blocked for patient media | CLOSED-backend (b7481aaf) |
| ST-08 | Doctor video helper + O3 gap doc | CLOSED-backend (21051398) |
| ST-09 | displayName rename not blocked | CLOSED-backend (e5197755) |

Open: O3 (doctor-side presign UI) — deferred, helper + wiring point in place (see above).
