# Code Audit 1 — PFI-ST-05
**Auditor:** Sonnet (1st independent)  
**Date:** 2026-06-19  
**Branch:** `auto/pfi-st-05`  
**Base commit:** `aa4b9414` (feat/doctor-ui-rebuild)  
**Commit audited:** `f9ebf36b`  
**File changed:** `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFiles.tsx` (+27/-5)

---

## Trace Summary

Full chain traced:

1. `pgPatientFiles.ts` `mapRow()` — `mediaFileId: row.mediaFileId ?? null` → `PatientFileRecord.mediaFileId`
2. `route.ts` GET `listFiles()` → `{ ...f, previewUrl }` → spread includes `mediaFileId` from `PatientFileRecord`
3. `PatientTabFiles.tsx` `FileRecord` type — now declares `mediaFileId: string | null` (line 55)
4. Badges render in all three locations when `file.mediaFileId` is truthy

---

## Clause A: `mediaFileId` field flows from route → type → UI

**Verdict: PASS**

**How verified:**

- `ports.ts` (feat/doctor-ui-rebuild): `PatientFileRecord.mediaFileId: string | null` — field declared at type level. ✓
- `pgPatientFiles.ts` `mapRow()` (line ~28): `mediaFileId: row.mediaFileId ?? null` — DB row correctly mapped into the port type. ✓
- `route.ts` GET handler (feat/doctor-ui-rebuild, line ~76): `return { ...f, previewUrl }` — object spread of a `PatientFileRecord`, which includes `mediaFileId`; no field is stripped. ✓
- `PatientTabFiles.tsx` line 55 (auto/pfi-st-05): `mediaFileId: string | null` added to `FileRecord` local type — matches the API shape. ✓
- Badge renders confirmed at:
  - `FileListRow` — lines 462–466: `{file.mediaFileId && <span>В библиотеке</span>}` inside the subtitle `<div>`. ✓
  - `FileCardTile` — lines 604–608: same conditional inside `<div className="flex flex-wrap gap-1">`. ✓
  - `FilePreviewPanel` — lines 852–859: `{file.mediaFileId && <p>…В библиотеке…</p>}` in footer. ✓

All three render locations use truthiness check (`file.mediaFileId &&`), which correctly suppresses the badge when `mediaFileId` is `null` (legacy files not uploaded through ST-04 path).

---

## Clause B: Uploads appear in both tab and library

**Verdict: PASS**

**How verified:**

Chain is complete across ST-04 + ST-05:

- `route.ts` POST (feat/doctor-ui-rebuild): calls `pgEnsureClientPatientFolder(userId)` → gets `patientFolder.id`; passes `folderId: patientFolder.id` to `deps.patientFiles.createFile(...)`. ✓
- `pgPatientFiles.ts` `createFile()`: when `params.folderId` is present (truthy), inserts a `media_files` row via `db.insert(mediaFiles)…` and sets `mediaFileId = mf?.id` on the `patient_files` row. ✓
- After upload, the component calls `handleUploaded()` → `loadFiles()` (line 943) which re-fetches the GET endpoint; the newly created record now has `mediaFileId != null`, so the badge appears. ✓
- The upload code in `UploadPanel` (lines 213–295) is **untouched** by ST-05 — it was verified that the diff only adds `mediaFileId` to the local type and badge renders. ✓

The ST-04 `folderId` routing is already in `route.ts` (not part of this diff); ST-05 correctly adds only the display side.

---

## Clause C: Preview / download work

**Verdict: PASS**

**How verified:**

- `FilePreviewPanel` header (lines 785–807): `{file.previewUrl && (<> <a href={file.previewUrl} download={file.fileName}>Скачать</a> · <a href={file.previewUrl} target="_blank">Открыть</a> · </>)}` — download and open-in-tab both use presigned `previewUrl`. ✓
- `FilePreviewPanel` preview area (lines 819–841): `{file.previewUrl && isImage ? (<img src={file.previewUrl} …/>)` renders the presigned URL in an `<img>` tag; PDF falls back to `<iframe src={file.previewUrl}>`. ✓
- `previewUrl` is included in the GET response via route.ts (presigned via `presignGetUrl(f.s3Key, 3600)`). ✓
- ST-05 did not alter any download/open/preview logic — those paths remain from the pre-ST-05 implementation.

---

## Clause D: No new one-off UI components / reuses primitives

**Verdict: PASS (with minor observation)**

**How verified:**

- All three "В библиотеке" badges are `<span>` / `<p>` elements using Tailwind utility classes (`bg-emerald-50`, `text-emerald-700`, `dark:bg-emerald-950/40`, `dark:text-emerald-400`) — no new imported components, no custom-styled CSS-in-JS. ✓
- These inline badge elements follow the exact same pattern as the pre-existing "из визита" badge (e.g., `FileListRow` line 458: `<span className="ml-1.5 inline-flex items-center rounded bg-primary/8 px-1 py-px text-[10px] text-primary/70">`). Consistent style idiom, not a deviation. ✓
- `CatalogSplitLayout` (line 1046), `CatalogLeftPane` (line 947), `CatalogRightPane` (line 1035) are all still in use — no split layout was replaced. ✓
- Shared doctor primitives (`doctorSectionTitleClass`, `doctorSectionSubtitleClass`, `doctorCatalogRowClass`, `doctorCatalogRowActiveClass`) are all still imported and used (lines 31–35, 447–448, 454). ✓
- No new component file was added (diff is limited to one file, no imports added). ✓

**Minor observation (non-blocking):** The "В библиотеке" badge uses `bg-emerald-50` rather than a shared semantic token (e.g., `bg-success/8`). This is a cosmetic/token-hygiene note; the DoD does not require token-layer usage for status badges. Not a defect.

---

## Clause E: Scope violations / raw SQL

**Verdict: PASS**

**How verified:**

- The diff touches exactly one file: `PatientTabFiles.tsx`. Confirmed by `git diff aa4b9414..f9ebf36b` — single `diff --git` block, no other file. ✓
- `PatientTabFiles.tsx` is a client component (`"use client"` at line 1) — no DB/ORM access possible in this file. ✓
- No `import` of Drizzle, `pg`, `getDrizzle`, or any infra module exists or was added. ✓
- `route.ts` was correctly left unchanged (ST-04 had already wired `folderId` in POST; GET already spreads the full `PatientFileRecord`).

---

## Overall Verdict: PASS

All 5 clauses pass. The implementation is minimal, correctly scoped, and complete:

- The `mediaFileId` field propagates from DB row → port type → service → route spread → client type → conditional render in all three UI surfaces (list row, card tile, preview panel footer).
- The upload flow (ST-04) is intact and untouched; the badge appears after reload because the GET now returns `mediaFileId != null` for newly uploaded files.
- Preview/download use the presigned `previewUrl` already wired in `route.ts`.
- No new components, no raw SQL, no scope creep.

**No defects found.**
