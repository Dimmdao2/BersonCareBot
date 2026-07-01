# ROADMAP — Patient Files Library Isolation

> Stages are atomic (≤30 min each, one start-to-finish action). Each lists What / Files / DoD / Depends.
> §6 ALWAYS embedded: ⛔ Drizzle only (no new raw SQL), DI via module contracts, reuse existing
> `clientMediaFolders` / `pgEnsureClientPatientFolder` / `excludeClientFiles` infra (no duplicate folder system),
> UI search before server search, SSR before excess fetch, tests scoped per stage.
>
> Existing infra confirmed (see REQUIREMENTS §4): `media_folders` kinds `client_files_root`/`client_patient`,
> `pgEnsureClientPatientFolder`, `clientFilesSubtreeFolderIdsSql`, `excludeClientFiles` list filter,
> `MediaLibraryFolderScopeSelect`. Patient-side video already routes to patient folder. The gaps: (1) system
> folder name «Файлы клиентов» vs «Пациенты», (2) ФИО+last4 naming, (3) `patient_files` not linked to library,
> (4) patient-folder rename currently blocked, (5) move-out restriction, (6) doctor individual-exercise video routing.

---

## ST-01 — System folder name «Пациенты» + ФИО ordering
**What:** Rename system root constant to «Пациенты» (per rule 1) while keeping legacy-promote compatibility, and
change patient-subfolder default name to **Фамилия Имя Отчество** (per rule 2). Build name from
`lastName + firstName + patronymic` via the shared name builder; no order/first-last regression.
**Files:**
- `apps/webapp/src/modules/media/clientFilesFolders.ts` (`CLIENT_FILES_ROOT_FOLDER_NAME` → «Пациенты»; add `clientPatientFolderFioName(lastName, firstName, patronymic)` pure helper; keep `clientPatientFolderBaseName` for backward-compat or re-point).
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` (`resolvePatientDisplayName` → resolve `lastName/firstName/patronymic` and build ФИО; promote-legacy matching by `nameNormalized` updated for new name, keep matching old «Файлы клиентов» name during transition).
- `apps/webapp/src/modules/media/clientFilesFolders.test.ts` (extend: ФИО ordering, trim, 180-cap).
**DoD:** root folder ensured as «Пациенты»; new patient folder default = «Фамилия Имя Отчество»; legacy «Файлы клиентов» root still recognized/promoted (no duplicate root); unit tests green for name builder; no raw SQL added.
**Depends:** none.
**Open-q gate:** O1 (confirm rename vs UI-alias) — default = rename; if owner picks UI-alias, this stage only adds the FIO helper and a display label.

## ST-02 — Dedup suffix = last4 phone (rule 2)
**What:** Replace the uuid8 collision suffix with **last 4 digits of phone**; full number never written. Secondary
fallback to uuid8 only when phone absent (per O4 default).
**Files:**
- `apps/webapp/src/modules/media/clientFilesFolders.ts` (`clientPatientFolderFallbackName(fio, last4|null, patientUserId)` → `\`${fio} · ${last4}\`` or uuid8 fallback; pure, no PII beyond last4).
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` (`pgEnsureClientPatientFolder`: select `phoneNormalized`, derive last4, pass into fallback name).
- `apps/webapp/src/modules/media/clientFilesFolders.test.ts` (dedup: same ФИО → +last4; no-phone → uuid8; last4 extraction).
**DoD:** collision on identical ФИО produces `ФИО · NNNN` (last4); never the full number; tests cover dup+last4 and no-phone fallback.
**Depends:** ST-01.

## ST-03 — Verify «hide from all-folders view» holds for library media (rule 3)
**What:** Confirm + lock with a test that media under the «Пациенты» subtree is excluded from the all-folders
library view (already implemented via `excludeClientFiles`), and that the scope select still surfaces the system
root only as an explicit scope. No behaviour change expected — this is the regression guard for rule 3.
**Files:**
- `apps/webapp/src/infra/repos/mockMediaStorage.ts` (ensure mock mirrors `excludeClientFiles` semantics for tests, if gap).
- New/extended test near media list (e.g. `apps/webapp/src/infra/repos/*mediaList*.test.ts` or extend existing) asserting: `folderId` omitted → patient-subtree files absent; explicit patient-folder scope → present.
**DoD:** test proves patient-subtree files hidden in default list and visible under explicit scope; mock + pg paths consistent; no new raw SQL.
**Depends:** ST-01 (folder kind/name), uses existing `clientFilesSubtreeFolderIdsSql`.

## ST-04 — Link patient-page uploads into the patient library folder (rule 4, backend)
**What:** On doctor patient-page file upload, ensure the patient folder exists and store the file inside the
library subtree, linking `patient_files` ↔ `media_files` (O2 default: dual-record + link column). Add nullable
`patient_files.media_file_id` (Drizzle migration) referencing `media_files.id`.
**Files:**
- `apps/webapp/db/schema/patientFiles.ts` (add `mediaFileId uuid` nullable FK → `media_files.id`, `onDelete set null`; index).
- Drizzle migration via `drizzle-kit generate` (new SQL migration file under `apps/webapp/db/migrations` — generated, not hand-raw).
- `apps/webapp/src/modules/patient-files/ports.ts` + `service.ts` (extend `PatientFileRecord`/`CreatePatientFileParams` with `mediaFileId`).
- `apps/webapp/src/infra/repos/pgPatientFiles.ts` (map/insert `mediaFileId`).
- `apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts` POST: call `pgEnsureClientPatientFolder(userId)` (via app-layer re-export), create the `media_files` row in that folder (reuse media create path / presign), then persist `patient_files` with `mediaFileId` + the library S3 key.
**DoD:** doctor upload → file lands in patient's «Пациенты» subfolder (auto-created, ФИО name); `patient_files.media_file_id` set; route stays thin (logic via services/ports); migration generated by drizzle-kit (no hand raw SQL). **G3 consistency test:** include a test asserting that a file reachable via `patient_files.media_file_id` is the same record as that in `media_files` (join-verify by id), and that deleting the `patient_files` row (or setting `mediaFileId=null`) does NOT delete the `media_files` row (cascade=set null, not cascade-delete) — isolates dual-record representations from each other.
**Depends:** ST-01, ST-02. Gate: O2 (confirm dual-record vs full migration) — default dual-record.

## ST-05 — Patient «Файлы» tab reads from library folder + upload UI wiring (rule 4, UI/SSR)
**What:** Make the patient «Файлы» tab show the same files now stored in the library folder, and keep upload flow
intact. Reuse existing UI primitives; SSR-first where the tab already SSRs; no duplicate fetch waterfalls.
**Files:**
- `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFiles.tsx` (no new custom chrome; ensure list reflects linked media; rename stays via existing PATCH).
- `apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts` GET (return library-backed previewUrl consistently; reuse presign).
**DoD:** uploads from the tab appear in the tab AND inside «Пациенты»/<patient> in the library; preview/download work; no new one-off UI components (reuse `CatalogSplitLayout`/doctor primitives); UI filtering done client-side before adding server params.
**Depends:** ST-04.

## ST-06 — Allow rename of patient subfolder; keep root + move-out locked (rules 2 & 4)
**What:** Permit doctor to rename a `client_patient` folder (rule 2), while still blocking rename of the
`client_files_root` and blocking any move/reparent of patient-subtree folders OUT to standard library (rule 4).
**Files:**
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` (add granular gate, e.g. `pgValidatePatientFolderRename(folderId)` allowing `client_patient` rename, denying root; ensure move-out denied — extend/verify `pgValidateManualFolderParent` so a `client_patient` folder cannot be reparented outside the patient subtree).
- `apps/webapp/src/app/api/admin/media/folders/[id]/route.ts` PATCH (replace blanket `isSystemManagedMediaFolder → 409` with: allow `name` change for `client_patient`; still 409 for `client_files_root`; for `parentId` change, deny moving patient folders/files outside the patient subtree).
- `apps/webapp/src/app/api/admin/media/folders/[id]/route.test.ts` (rename client_patient ok; rename root 409; reparent patient folder out → 409).
**DoD:** client_patient rename succeeds; root rename 409; reparent of patient folder/file to a standard folder rejected; tests cover all three; route thin.
**Depends:** ST-01.

## ST-07 — Enforce no move-out of patient files into standard folders (rule 4)
**What:** The primary file-move chokepoint is `PATCH /api/admin/media/[id]` which accepts a `folderId` change
(via `pgValidateUserAssignableMediaFolder`). Today this gate rejects `client_files_root` as a target but does NOT
block moving a file OUT of a `client_patient` folder into a standard (non-patient) folder. Add that check here.
Folder-level reparenting (already handled in ST-06) is secondary.
**Files:**
- **PRIMARY TARGET:** `apps/webapp/src/app/api/admin/media/[id]/route.ts` (PATCH, folderId change path) — after resolving the new folderId, reject if the file currently lives in a `client_patient` folder and the target is NOT in the patient subtree. Use `pgIsFolderInClientSubtree`.
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` — add `pgIsFolderInClientSubtree(folderId): Promise<boolean>` using `clientFilesSubtreeFolderIdsSql`; export via `app-layer/media/clientMediaFolders.ts`.
- `apps/webapp/src/app/api/admin/media/[id]/route.test.ts` — test: PATCH folderId on patient-folder file → standard folder → 400/403; move to sibling patient folder → allowed.
**DoD:** `PATCH /api/admin/media/[id]` rejects move of patient-subtree file to non-patient folder; intra-subtree moves allowed; tests green; no raw SQL (reuse existing subtree predicate).
**Depends:** ST-04, ST-06.

## ST-08 — Doctor individual-exercise video → patient folder (rule 5)
**What:** Ensure doctor-side individual-exercise video (recorded with patient at appointment) is written into the
patient's «Пациенты» folder, mirroring the patient-side submission path that already uses
`pgEnsureClientPatientFolder`. Provide the shared routing helper + connect the existing doctor upload entry point
(if one exists); if no doctor entry point exists yet, land the helper + wiring point and document the UI gap.
**Files:**
- `apps/webapp/src/app-layer/media/clientMediaFolders.ts` (confirm `pgEnsureClientPatientFolder` re-export usable from doctor routes).
- Doctor media-upload/presign route for individual exercise (to be identified at execution — candidate area:
  `app/api/doctor/treatment-program-instances/.../discussion` or a new program-item media presign) — set
  `folderId = pgEnsureClientPatientFolder(patientUserId).id` on create, like patient submission route.
- Test mirroring `apps/webapp/src/app/api/patient/media/program-submission/presign/route.test.ts` for the doctor path.
**DoD:** doctor individual-exercise video create resolves/creates the patient folder and stores video there (rules 1–3 apply); test asserts `folderId === patientFolder.id`; if the doctor UI entry point doesn't exist yet, helper + connection point landed and the missing-UI noted in LOG (full UI = out of scope per O3).
**Depends:** ST-01.
**Open-q gate:** O3 (confirm doctor individual-exercise entry point).

## ST-09 — Individual video rename capability (rule 6)
**What:** Ensure renaming a video (library media in patient folder) is possible. `patient_files.renameFile` and the
tab's inline rename already cover patient-page files; this stage guarantees library media in the patient folder is
renamable via the existing media `displayName`/rename path (no forced rename — capability only).
**Files:**
- Verify/extend media rename route (`app/api/admin/media/[id]/route.ts` or equivalent `updateMedia displayName`) is reachable for patient-folder media and not blocked by the system-folder guard (the guard should block folder ops, not file rename).
- Test: rename media file inside patient folder succeeds.
**DoD:** a video in the patient folder can be renamed (capability present, optional per rule 6); rename not blocked by system-folder readonly guard; test green.
**Depends:** ST-04, ST-06.

## ST-10 — Final regression suite + docs sync
**What:** Consolidated DoD test pass for the five owner-required test areas + sync initiative docs.
**Files:**
- Tests (already added in ST-03/04/06/07/08/09) reviewed as a set: (1) exclusion from general scope/visibility,
  (2) upload routes into patient folder, (3) ФИО dedup naming, (4) move-out denied, (5) individual-exercise routing.
- `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` (decisions, what was deliberately not done — created by Decomposer/executor, updated here).
- Update `apps/webapp/src/modules/media/media.md` if folder-naming docs reference the old «Файлы клиентов» name.
**DoD:** all five owner DoD test areas covered & green at phase-level for `apps/webapp`; docs reflect «Пациенты» naming; one final `apps/webapp` phase test run (full `pnpm run ci` only at push gate); LOG records decisions + open-q resolutions.
**Depends:** ST-01…ST-09.

---

## Stage count: **10** (ST-01 … ST-10)

## Dependency summary
- ST-01 → foundation (name/FIO).
- ST-02 depends ST-01.
- ST-03 depends ST-01.
- ST-04 depends ST-01, ST-02.
- ST-05 depends ST-04.
- ST-06 depends ST-01.
- ST-07 depends ST-04, ST-06.
- ST-08 depends ST-01.
- ST-09 depends ST-04, ST-06.
- ST-10 depends all.

## Out of scope (explicit)
- Full UI for doctor individual-exercise video capture (only routing/helper here — see O3).
- Full migration of `patient_files` into `media_files` (O2 default = dual-record link, not merge).
- Renaming/migrating already-created prod «Файлы клиентов» folders beyond compatibility-preserving promote (O1 — owner confirm).
- AI PDF parsing of patient files (existing future-note, unrelated).
