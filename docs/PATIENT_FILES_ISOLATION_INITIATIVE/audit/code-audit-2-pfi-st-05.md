# Code Audit 2 — PFI-ST-05
Auditor: Opus (2nd independent)
Date: 2026-06-19 (UTC)
Branch: auto/pfi-st-05 @ f9ebf36b vs feat @ aa4b9414
Item: Patient «Файлы» tab reads from library folder + upload UI wiring (mediaFileId surfacing)

Diff scope (vs feat): 1 file, +27 / -5
`apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFiles.tsx`

---

## Clause A: mediaFileId flow (DB → ports → mapRow → route → client type → 3 UI surfaces)
Verdict: **PASS**

How verified — traced the full chain end to end:

1. **DB column + FK + index** — `apps/webapp/db/schema/patientFiles.ts:35` declares
   `mediaFileId: uuid("media_file_id")`; partial index `idx_patient_files_media_file_id`
   on `mediaFileId WHERE media_file_id IS NOT NULL` (lines 45-47); FK
   `patient_files_media_file_id_fkey` (lines 64-66). Migration
   `0131_patient_files_media_file_id_fk.sql` present. Column is nullable (ST-04 baseline).

2. **Ports type** — `apps/webapp/src/modules/patient-files/ports.ts:33`
   `mediaFileId: string | null` on `PatientFileRecord`, documented as null for legacy/unrouted uploads.

3. **mapRow** — `apps/webapp/src/infra/repos/pgPatientFiles.ts:28`
   `mediaFileId: row.mediaFileId ?? null` — present in the single `mapRow` used by
   `listFiles`, `getFile`, `createFile`, `linkFileToVisit`, `renameFile`. So every
   read/write path emits the field. Field name matches schema (`row.mediaFileId`).

4. **Route GET spread** — `route.ts:84` returns `{ ...f, previewUrl }`. `f` is a
   `PatientFileRecord` from `listFiles`, so `mediaFileId` is carried through the spread
   verbatim. No omit/pick filtering. Response shape: `{ ok, files: [...] }`.

5. **Client FileRecord type** — `PatientTabFiles.tsx:55` adds `mediaFileId: string | null`
   (mirrors API). `loadFiles()` (line 889-911) reads `data.files` typed as `FileRecord[]`
   and `setFiles(data.files)` (line 900) — no field stripping; the parsed JSON keeps
   `mediaFileId`. Type is structural, no runtime validation, but server is the only
   producer and emits it, so field is present at runtime.

6. **3 UI surfaces** — conditional `{file.mediaFileId && (...)}`:
   - FileListRow subtitle — line 462 (emerald "В библиотеке" pill after the "из визита" pill).
   - FileCardTile badge row — line 604 (inside new `flex flex-wrap gap-1` wrapper).
   - FilePreviewPanel footer — line 853 (emerald pill + explanatory text).

Edge cases:
- **null mediaFileId (legacy files)**: `{file.mediaFileId && ...}` — falsy short-circuit,
  badge omitted. Correct.
- **truthiness**: `mediaFileId` is a UUID string when set; empty string is not a valid UUID
  and never produced (mapRow uses `?? null`, DB stores UUID or NULL), so no "empty-string
  renders badge" hazard.
- Conditional polarity is correct in all 3 surfaces (badge shows only when backed by media lib).

---

## Clause B: Upload → lands in both tab + patient library folder
Verdict: **PASS**

How verified:
- **Scope check**: ST-05 did NOT touch `route.ts` (confirmed `git diff feat..auto/pfi-st-05 -- route.ts` is empty). ST-04 wiring is intact on the baseline.
- **POST route** (`route.ts:121,133`): `pgEnsureClientPatientFolder(userId)` →
  `createFile({ ..., folderId: patientFolder.id })`. Non-optional folderId is passed.
- **createFile** (`pgPatientFiles.ts:60-97`): because `params.folderId` is truthy, it
  co-inserts a `media_files` row in that folder (status "ready") and captures
  `mediaFileId = mf?.id ?? null`, then inserts the `patient_files` row with that
  `mediaFileId`. So the upload simultaneously (a) appears in the patient's media library
  folder and (b) carries a non-null `mediaFileId`.
- **Client refresh after upload**: `handleUploaded()` (line 942) → `loadFiles()` →
  GET re-fetch → fresh row has non-null `mediaFileId` → badge renders. The ST-05 display
  correctly surfaces after reload. Verified the upload handler chains:
  `uploadSingleFile` (line 213) POSTs metadata, then on completion the caller path reaches
  `handleUploaded`/`loadFiles`.
- Note (not a defect): the optimistic in-state updates (`handleLinked`, `handleRenamed`)
  don't set `mediaFileId`, but upload uses a full `loadFiles()` re-fetch, not optimistic
  insert, so the badge is correct post-upload without an optimistic path.

---

## Clause C: Preview/download work (previewUrl path unchanged)
Verdict: **PASS**

How verified:
- Diff touches `previewUrl` in exactly one place — a context line inside the
  FilePreviewPanel footer hunk; the `previewUrl` logic itself (presign attach at
  `route.ts:74-86`, and the FilePreviewPanel `href={file.previewUrl}` download/open at
  lines ~785-836) is unmodified.
- The new mediaFileId footer block (line 849-857) is inserted as a sibling `<p>` after the
  size line and before the existing "Файлы из визитов…" hint; it does not wrap or gate the
  preview `<img>/<iframe>` or the Скачать/Открыть links.
- Edge case (file with no previewUrl, S3 off): unchanged behavior — preview falls back to
  the no-preview branch; mediaFileId badge is independent of previewUrl, so it still renders
  if mediaFileId is set. Correct decoupling.

---

## Clause D: No new one-off components; reuses shared primitives
Verdict: **PASS**

How verified:
- Imports unchanged by the diff: still uses `CatalogSplitLayout`, `CatalogLeftPane`,
  `CatalogRightPane` (lines 36-38) and `doctorSectionTitleClass` etc. (lines 30-35).
- The three additions are inline `<span>`/`<p>` badges with Tailwind classes — no new
  React component, no new file. Badge styling mirrors the existing "из визита" pill pattern
  (rounded bg-* px-1 py-px text-[10px]) with emerald palette, consistent with the codebase.

---

## Clause E: Scope + no raw SQL
Verdict: **PASS**

How verified:
- `git diff --stat feat..auto/pfi-st-05 -- apps/` = 1 file only (PatientTabFiles.tsx),
  +27/-5. No route.ts / service / repo / schema changes in this commit (schema/repo/ports
  mediaFileId support is ST-04 baseline, not re-touched here).
- No raw SQL in the changed file (grep for ``sql` ``/`execute(`/`raw(` → none). It is a
  client React file with no DB access by design (clean-architecture: UI → fetch → route).

---

## Minor observations (non-blocking, no action required)
1. **Empty wrapper div in FileCardTile** (line 598): the refactor wraps both badges in a
   permanent `<div className="flex flex-wrap gap-1">`. When neither `visitId` nor
   `mediaFileId` is set, this renders an empty zero-content flex div. Harmless (no
   visible artifact, `gap` has no effect with 0 children), but slightly less tidy than the
   previous fully-conditional span. Cosmetic only.
2. **No runtime validation of the API JSON** — `data.files` is cast to `FileRecord[]`
   without a zod parse. Pre-existing pattern in this file (visitId, previewUrl all rely on
   the same trust), not introduced by ST-05. Out of scope.

---

## Overall Verdict: **CLEAN** (0 blocking issues)

The ST-05 change is a minimal, correct display-only addition. Independent end-to-end trace
confirms the `mediaFileId` field flows DB schema → ports → mapRow (every path) → route GET
spread → client FileRecord → conditional render in all three UI surfaces, with correct
null-handling for legacy files. Upload (ST-04 wiring, untouched) co-creates the media_files
row and sets mediaFileId; the badge surfaces correctly after the post-upload `loadFiles()`
re-fetch. Preview/download path is untouched. Scope is clean (1 client file), no new
components, no raw SQL. Two cosmetic observations noted; neither blocks.
