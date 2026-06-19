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
