# Code Audit 1 — PFI-ST-06 (Sonnet, independent)
Auditor: code-auditor-1-pfi-st-06 (Sonnet)
Date: 2026-06-19

## Finding summary
| # | Clause | Result | Notes |
|---|---|---|---|
| C1 | pgValidatePatientFolderRename kind check | PASS | client_patient → void (allow); anything else → throws 409 system_folder_readonly |
| C2 | Error object: statusCode + message | PASS | `Object.assign(new Error("system_folder_readonly"), { statusCode: 409 })` |
| C3 | Route: client_files_root name change → 409 system_folder_readonly | PASS | Line 51–53 |
| C4 | Route: client_files_root parentId change → 409 system_folder_readonly | PASS | Lines 61–63 (unreachable for root via C3 if both fields sent, but guarded independently) |
| C5 | Route: client_patient name change → calls pgValidatePatientFolderRename (allows) | PASS | Lines 54–60; mock resolved undefined → 200 in test |
| C6 | Route: client_patient parentId change → 409 patient_folder_move_out | PASS | Lines 64–66 |
| C7 | standard kind: no regression, passes through | PASS | Guards are kind-specific; existing "returns 200 on rename" test uses standard folder |
| C8 | Thin route (no business logic beyond kind-gate) | PASS | Gate is 4 if-blocks; all execution delegated to deps.media.renameFolder / moveFolder |
| C9 | Drizzle-only query in pgValidatePatientFolderRename | PASS | db.select().from().where(eq()).limit(1); no raw SQL |
| C10 | pgValidatePatientFolderRename exported from app-layer | PASS | clientMediaFolders.ts line 6 |
| C11 | All tests pass | PASS | 14/14 (all 3 new + 11 existing) — verified via run-tests.sh mutex |
| C12 | TypeScript clean | PASS | `pnpm exec tsc --noEmit` produced no output (zero errors) |
| C13 | Scope — only expected files in b117a136 | PASS | 4 files, 101 insertions, 5 deletions; no unrelated edits |

---

## Detail

### C1 — pgValidatePatientFolderRename kind check
**File:** `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` lines 198–220

The function queries `mediaFolders.kind` for the given `folderId`. Two rejection branches:
1. `!row` (folder not found) → throws `system_folder_readonly` 409
2. `row.kind !== "client_patient"` → throws `system_folder_readonly` 409

Only if `row.kind === "client_patient"` does the function return `void` (allow). The kind guard matches the DoD requirement.

**Minor observation (advisory, not a defect):** The function re-fetches the folder's kind from the DB even though the route already resolved the folder via `pgGetMediaFolderById` before calling this function. The kind is therefore known at the call site (`existing.kind === "client_patient"` is the guard that reaches this call), making the inner DB query redundant for the current caller. The function is correct and safe; the redundant query just costs one extra DB round-trip per client_patient rename. The DoD does not specify query minimization, so this does not affect the verdict.

### C2 — Error object: statusCode + message
Both throw sites in `pgValidatePatientFolderRename` use:
```ts
const err = Object.assign(new Error("system_folder_readonly"), { statusCode: 409 });
throw err;
```
`statusCode: 409` and message `"system_folder_readonly"` are present. PASS.

Note: the route's catch block (line 57–59) does not read `err.message` — it always returns `{ error: "system_folder_readonly" }` on any throw. So the error message on the thrown object is informational only, but it is still correct.

### C3 — client_files_root name change → 409 system_folder_readonly
Route lines 51–53:
```ts
if (parsed.data.name !== undefined && existing.kind === "client_files_root") {
  return NextResponse.json({ ok: false, error: "system_folder_readonly" }, { status: 409 });
}
```
Test "returns 409 when renaming client_files_root folder" verifies `status === 409` and `j.error === "system_folder_readonly"`, and that `renameFolderMock` was not called. PASS.

### C4 — client_files_root parentId change → 409 system_folder_readonly
Route lines 61–63:
```ts
if (parsed.data.parentId !== undefined && existing.kind === "client_files_root") {
  return NextResponse.json({ ok: false, error: "system_folder_readonly" }, { status: 409 });
}
```
The root rename test (C3) sends only `name`, so this branch is not covered by the new tests. However the logic is a direct parallel of C3 and is structurally correct. No dedicated test for root parentId change exists, but this is not a DoD test requirement. PASS (logic correct).

### C5 — client_patient name change → calls pgValidatePatientFolderRename (allows)
Route lines 54–60:
```ts
if (parsed.data.name !== undefined && existing.kind === "client_patient") {
  try {
    await pgValidatePatientFolderRename(id, parsed.data.name);
  } catch {
    return NextResponse.json({ ok: false, error: "system_folder_readonly" }, { status: 409 });
  }
}
```
Test "returns 200 when renaming client_patient folder (rule 2: allowed)": `validatePatientFolderRenameMock` resolves `undefined`; `renameFolderMock` resolves `true`; response is 200 and `renameFolderMock` called with the new name. PASS.

### C6 — client_patient parentId change → 409 patient_folder_move_out
Route lines 64–66:
```ts
if (parsed.data.parentId !== undefined && existing.kind === "client_patient") {
  return NextResponse.json({ ok: false, error: "patient_folder_move_out" }, { status: 409 });
}
```
Test "returns 409 patient_folder_move_out when reparenting client_patient folder (rule 4: forbidden)": verifies `status === 409`, `j.error === "patient_folder_move_out"`, and `moveFolderMock` not called. PASS.

**Combined field edge case:** If a request sends both `name` and `parentId` for a `client_patient` folder, the name check (C5) passes first (pgValidatePatientFolderRename allows), then the parentId check (C6) fires and returns 409 `patient_folder_move_out`. This is correct — reparenting is always blocked regardless of whether a name change is also requested.

### C7 — standard folder: no regression
The existing "returns 200 on rename" test uses `standardFolder` (kind `"standard"`). None of the four new gates trigger for `standard` kind. `renameFolderMock` is called normally. PASS.

### C8 — Thin route
The PATCH handler's gate is 4 conditional early-return blocks (C3–C6). After the gate, all mutation is delegated to `deps.media.moveFolder` and `deps.media.renameFolder` (the domain layer). No business logic beyond the kind-gate is embedded in the route. PASS.

### C9 — Drizzle-only query
`pgValidatePatientFolderRename` uses:
```ts
const [row] = await db
  .select({ kind: mediaFolders.kind })
  .from(mediaFolders)
  .where(eq(mediaFolders.id, folderId))
  .limit(1);
```
This is pure Drizzle query builder with `eq()` — no `sql.raw()`, no `db.execute(string)`. PASS.

### C10 — Export from app-layer
`apps/webapp/src/app-layer/media/clientMediaFolders.ts` line 6 explicitly re-exports `pgValidatePatientFolderRename`. PASS.

### C11 — Tests
Ran via `/home/dev/orch/run-tests.sh` mutex. Result: 14/14 tests pass (2 test files). Output:
```
✓ PATCH /api/admin/media/folders/[id] > returns 409 when renaming client_files_root folder
✓ PATCH /api/admin/media/folders/[id] > returns 200 when renaming client_patient folder (rule 2: allowed)
✓ PATCH /api/admin/media/folders/[id] > returns 409 patient_folder_move_out when reparenting client_patient folder (rule 4: forbidden)
✓ PATCH /api/admin/media/folders/[id] > returns 200 on rename   ← existing, not broken
```
All 3 new tests + all pre-existing tests green. PASS.

### C12 — TypeScript
`pnpm -C apps/webapp exec tsc --noEmit` produced no output — zero errors. PASS.

### C13 — Scope
`git show b117a136 --stat` confirms exactly 4 files, 101 insertions, 5 deletions:
- `apps/webapp/src/app-layer/media/clientMediaFolders.ts` (+1 export line)
- `apps/webapp/src/app/api/admin/media/folders/[id]/route.test.ts` (+49 / -3)
- `apps/webapp/src/app/api/admin/media/folders/[id]/route.ts` (+22 / -2)
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` (+32)

No unrelated files touched. PASS.

---

## Advisory (non-blocking)

**Redundant DB query in pgValidatePatientFolderRename:** The route fetches `existing` (including its `kind`) via `pgGetMediaFolderById` before entering the gate. The gate only calls `pgValidatePatientFolderRename` when `existing.kind === "client_patient"` is already confirmed. The function then re-queries the same kind from the DB. This costs one extra SELECT per client_patient rename. A future refactor could accept the already-resolved `kind` as a parameter (or be simplified to a no-op guard) to eliminate the round-trip. Not a correctness issue; the current behavior is safe and the DoD is silent on this.

---

## Verdict: PASS

All 13 checklist clauses pass. No correctness defects found. One advisory (redundant DB query) noted for future consideration but does not affect correctness, security, or the DoD requirements.
