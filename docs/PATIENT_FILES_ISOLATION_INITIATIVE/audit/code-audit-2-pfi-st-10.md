# PFI-ST-10 Code Audit 2 (Opus)

**Item**: PFI-ST-10 — Final regression suite + docs sync
**Branch**: `auto/pfi-st-10`
**Auditor**: Opus (Code-Auditor #2) — Режим ДОЕБАТЬСЯ, independent of Audit-1
**Date**: 2026-06-19
**Diff scope** (`git diff feat/doctor-ui-rebuild...auto/pfi-st-10 --name-only`): 3 files
- `apps/webapp/src/modules/media/media.md` — 1 line changed
- `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` — 69 lines added
- `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-10.md` — new (Audit-1 report; expected on an audit branch)

All independently verified from code/git/DB constraint, not from the Audit-1 report.

---

## A. Cross-check docs against code

### A1 — `CLIENT_FILES_ROOT_FOLDER_NAME` = «Пациенты»
**PASS** — `clientFilesFolders.ts:3` → `export const CLIENT_FILES_ROOT_FOLDER_NAME = "Пациенты";`. Legacy constant present at line 6: `CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY = "Файлы клиентов"`. media.md line 12 now reads «Пациенты» (тип `client_files_root`) — matches the live constant.

### A2 — media.md kind labels match actual enum
**PASS** — media.md documents `standard | client_files_root | client_patient`. Cross-checked against:
- TS type: `src/modules/media/types.ts:60` → `MediaFolderKind = "standard" | "client_files_root" | "client_patient"`.
- DB check constraint: `db/drizzle-migrations/0113_client_media_folders.sql:16` → `CHECK ("kind" = ANY (ARRAY['standard','client_files_root','client_patient']))`.
- `clientFilesFolders.ts:9` `isClientFilesFolderKind` confirms the two non-standard kinds.
The doc's `(тип client_files_root)` / `(тип client_patient)` labels are accurate against `pgClientMediaFolders.ts` (root inserted with `kind: 'client_files_root'`, per-patient with `kind: 'client_patient'`).

### A3 — Commit hashes in LOG.md status table exist
**PASS** — All 8 resolved via `git log --oneline -1 <hash>`: `f6e9877b` (ST-01 audit2), `258500e6` (ST-02+03 audit2), `605f4113` (ST-04 merge), `0de06444` (ST-05 merge), `630c34d9` (ST-06 merge), `b7481aaf` (ST-07 merge), `21051398` (ST-08 merge), `e5197755` (ST-09 merge). All present in history. Hashes point to audit/merge commits — acceptable as stage-closure markers.

### A4 — LOG.md test file paths exist
**PASS** — All 7 referenced files exist in worktree: `mockMediaStorage.test.ts`, `pgPatientFiles.g3.test.ts`, `clientFilesFolders.test.ts`, `[id]/route.test.ts`, `folders/[id]/route.test.ts`, `clientMediaFolders.test.ts`, `program-submission/presign/route.test.ts`.

### A5 — O3 resolution: helper re-export + no doctor presign route
**PASS** — `app-layer/media/clientMediaFolders.ts:4` re-exports `pgEnsureClientPatientFolder` (also `pgEnsureClientFilesRootFolder` line 3). No doctor-side presign route exists: `find src/app/api/doctor -path "*media*presign*"` and broad grep for `media-presign` / `treatment-program-instances...presign` both return nothing; no `doctor` media dir. Matches the documented gap.

---

## B. Completeness

### B6 — 5 owner-required areas documented with test evidence
**PASS** — LOG.md ST-10 table maps each DoD area to a test file with counts. Independently re-counted via `grep -cE "^\s*(it|test)\("`:
| Area | File | LOG | Counted |
|------|------|-----|---------|
| 1 Exclusion | mockMediaStorage.test.ts | 5 | 5 |
| 2 Upload→folder | pgPatientFiles.g3.test.ts | 5 | 5 |
| 3 ФИО dedup naming | clientFilesFolders.test.ts | 16 | 16 |
| 4 Move-out denied (file) | media/[id]/route.test.ts | 19 | 19 |
| 4 Move-out denied (folder) | folders/[id]/route.test.ts | 8 | 8 |
| 5 Individual-exercise helper | clientMediaFolders.test.ts | 6 | 6 |
| Upload smoke | presign/route.test.ts | 4 | 4 |
Total = **63**, matches LOG.md exactly. All 5 owner areas + smoke covered.

### B7 — Scope of what was NOT done captured accurately
**PASS** — LOG.md "What was deliberately NOT done" lists: full migration into media_files (O2 option b), doctor UI for individual-exercise (O3 — helper+wiring landed), automated prod rename (legacy promote handles it via `nameNormalized` match — verified migration 0114 inserts/promotes by `client_files_root` existence, app layer renames), and forced displayName rename (capability vs forced — accurate, rename available via `PATCH /api/admin/media/[id]`). O3 gap honestly scoped.

---

## C. Risks

### C8 — No production code in diff
**PASS** — Diff touches only 2 `.md` docs + the Audit-1 `.md` report. Zero `.ts`, migration, or config files. Verified via `--name-only`.

### C9 — No content wrongly removed from media.md
**PASS** — Single-line replacement at line 12 only. Surrounding lines 7–15 read verbatim intact (presign/multipart, UI врача, media-by-id, video HLS, listing, excludeClientFiles, usage-summary, canonical links). The new line is a strict superset of the old (adds type labels, renames root) with no other deletions.

### C10 — Dev seed note appropriately flagged
**PASS (not a blocker)** — LOG.md "Dev seed note" describes `patient_files edd8ab66` with `media_file_id` set as a manual-verify aid in dev DB. It is explicitly labelled a dev-DB convenience, not prod data, not a migration artifact — no cleanup obligation for audit closure. (Could not re-query dev DB from worktree: scrubbed/mismatched creds → auth failure; Audit-1 confirmed `media_file_id = 709565e7-...` non-null. Not load-bearing for PASS.)

### O2 supplementary (FK semantics claimed in LOG.md)
**PASS** — `db/schema/patientFiles.ts:63-67`: FK `patient_files_media_file_id_fkey` on `mediaFileId → mediaFiles.id` with `.onDelete("set null")`; column nullable (`mediaFileId: uuid("media_file_id")` line 35); partial index where `media_file_id IS NOT NULL`. Matches LOG.md O2 exactly.

### O4 supplementary (dedup suffix logic)
**PASS** — `clientFilesFolders.ts:48-50`: `last4 = digits-only phone .slice(-4)` only when length === 4; else `suffix = patientUserId.slice(0, 8)`. Full phone never written. Matches LOG.md O4.

---

## Overall Verdict

**PASS / CLEAN**

All 10 clauses pass under presumption-of-wrong. Diff is docs-only. media.md «Пациеты» root name, the three-kind enum, all 8 commit hashes, all 7 test paths, all 63 test counts, O1/O2/O3/O4 resolutions, and the deliberately-not-done scope are independently verifiable from code, the DB check constraint, the schema FK, and git. Nothing to доебаться.

Audit-1 (Sonnet) was accurate. No defects it missed. One note beyond Audit-1: the «Пациенты» rename lives only in the application constant (ST-01) — the 0113/0114 migrations still insert the literal «Файлы клиентов» and rely on app-layer promote-by-normalized-name; LOG.md states this correctly ("no data migration needed"), so it is documented, not a gap.
