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

---

## ST-10 — Final regression suite + docs sync

Date: 2026-06-19
Status: CLOSED

### Test results (step-level, all pass)

| Owner DoD area | Test file | Tests |
|----------------|-----------|-------|
| 1. Exclusion from general scope/visibility | `src/infra/repos/mockMediaStorage.test.ts` | 5 pass |
| 2. Upload routes into patient folder (G3 dual-record) | `src/infra/repos/pgPatientFiles.g3.test.ts` | 5 pass |
| 3. ФИО dedup naming (last4 vs uuid8, ordering) | `src/modules/media/clientFilesFolders.test.ts` | 16 pass |
| 4. Move-out denied (file + folder level) | `src/app/api/admin/media/[id]/route.test.ts` + `src/app/api/admin/media/folders/[id]/route.test.ts` | 19 + 8 = 27 pass |
| 5. Individual-exercise routing (doctor helper) | `src/app-layer/media/clientMediaFolders.test.ts` | 6 pass |
| Upload smoke (patient presign → patient folder) | `src/app/api/patient/media/program-submission/presign/route.test.ts` | 4 pass |

Total: **63 tests across 6 files — all pass.**

### tsc

`pnpm --dir apps/webapp exec tsc --noEmit` — PASS (exit 0).

### Docs sync

`apps/webapp/src/modules/media/media.md` line 12 updated: «Файлы клиентов» → «Пациенты» (added `client_files_root`/`client_patient` kind labels for clarity).

### Open-question resolutions

**O1 (folder name):** `CLIENT_FILES_ROOT_FOLDER_NAME` renamed to «Пациенты» (ST-01). Legacy promote: `pgEnsureClientFilesRootFolder` still matches by `nameNormalized`, so existing prod folders named «Файлы клиентов» are reused without duplication. No data migration needed.

**O2 (dual-record link):** `patient_files.mediaFileId` nullable FK to `media_files.id` with `onDelete: set null` (ST-04). Deleting a `patient_files` row does NOT delete the `media_files` record. G3 test asserts both directions.

**O3 (doctor individual-exercise route):** Gap documented. Helper landed in ST-08; full doctor UI route is out of scope for PFI. Connection point: future route must call `pgEnsureClientPatientFolder(patientUserId)` (not doctor userId) from `apps/webapp/src/app-layer/media/clientMediaFolders.ts`.

**O4 (dedup suffix):** last4 of `phoneNormalized` when phone has ≥ 4 digits; otherwise falls back to first 8 chars of `patientUserId`. Full phone never written. Tested in `clientFilesFolders.test.ts` (4 cases).

### Dev seed note

Patient file `edd8ab66` in dev DB has `media_file_id` set — suitable for manual verification of the dual-record wiring in a live dev session.

### What was deliberately NOT done

- Full migration of `patient_files` into `media_files` (O2 option b) — out of scope per owner default.
- Doctor UI for individual-exercise video capture — out of scope (O3; helper + wiring point landed).
- Automated prod rename of existing «Файлы клиентов» folders — not needed (promote logic handles legacy).
- Forced `displayName` rename on upload — rule 6 requires capability, not forced rename; capability exists via `PATCH /api/admin/media/[id]`.
