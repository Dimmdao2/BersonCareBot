# Code Audit 1 — PFI-ST-06 (Sonnet, independent)
date: 2026-06-19T14:25Z UTC
branch: auto/pfi-st-06 @ b117a136 vs feat @ 258500e6
auditor: CODE-AUDITOR #1 (Sonnet)

## Checklist

### Clause 1: client_patient rename allowed (200)
verdict: PASS
how-verified:
- route.ts lines 54–60: guard fires only when `parsed.data.name !== undefined && existing.kind === "client_patient"`. Calls `pgValidatePatientFolderRename(id, parsed.data.name)`. On success (no throw) → falls through to `deps.media.renameFolder(id, parsed.data.name)` at line 97.
- `pgValidatePatientFolderRename` (pgClientMediaFolders.ts lines 198–220): fetches `row.kind`; if `row.kind === "client_patient"` → returns void (no throw). Route catch block is not triggered, so rename proceeds.
- Test "returns 200 when renaming client_patient folder (rule 2: allowed)": mock `pgGetByIdMock` returns `kind: "client_patient"`, `validatePatientFolderRenameMock.mockResolvedValue(undefined)`, `renameFolderMock.mockResolvedValue(true)`. Response is 200, `renameFolderMock` called with correct args `(FOLDER_ID, "Иван Иванов")`. Test passes.
- Edge case — `name` only (no `parentId`): parentId gate at line 64 does not fire (parentId is undefined). Rename executes.

### Clause 2: client_files_root rename → 409 system_folder_readonly
verdict: PASS
how-verified:
- route.ts line 51: `if (parsed.data.name !== undefined && existing.kind === "client_files_root")` → returns 409 with `error: "system_folder_readonly"` immediately. No further execution.
- Also covers parentId change for client_files_root: route.ts line 61: `if (parsed.data.parentId !== undefined && existing.kind === "client_files_root")` → 409 `system_folder_readonly`. This guard is independent and correctly fires for parentId changes even when no name is sent.
- Test "returns 409 when renaming client_files_root folder": mock returns `kind: "client_files_root"`, body `{name: "Hack"}`. Asserts `status === 409`, `j.error === "system_folder_readonly"`, `renameFolderMock` not called. Test passes.
- Note: no separate test for parentId change on client_files_root, but that branch (line 61) is parallel to the name branch and structurally correct. The required test for "root rename 409" covers the main required case.

### Clause 3: client_patient reparent → 409 patient_folder_move_out
verdict: PASS
how-verified:
- route.ts line 64: `if (parsed.data.parentId !== undefined && existing.kind === "client_patient")` → returns 409 `patient_folder_move_out` immediately.
- Critical edge case `parentId: null` (move to root): `null !== undefined` is TRUE, so line 64 fires. A `client_patient` folder cannot be moved to root either. Correct.
- Combined request with both `name` and `parentId` for `client_patient`: line 54 name check fires first — `pgValidatePatientFolderRename` resolves (returns void for client_patient) → no early return. Then line 64 parentId check fires → 409 `patient_folder_move_out`. Correct: rename side is never reached when parentId is also requested.
- Test "returns 409 patient_folder_move_out when reparenting client_patient folder (rule 4: forbidden)": body `{parentId: PARENT_ID}`, mock returns `kind: "client_patient"`. Asserts `status === 409`, `j.error === "patient_folder_move_out"`, `moveFolderMock` not called. Test passes.

### Clause 4: pgValidatePatientFolderRename helper correct
verdict: PASS
how-verified:
- Function signature: `pgValidatePatientFolderRename(folderId: string, _newName: string): Promise<void>` (pgClientMediaFolders.ts lines 198–220). `_newName` is accepted but unused (correct: validation is kind-based, not content-based).
- Logic: fetches `mediaFolders.kind` for `folderId`. Three outcomes:
  1. `!row` → throws `Object.assign(new Error("system_folder_readonly"), { statusCode: 409 })`
  2. `row.kind !== "client_patient"` → throws same error
  3. `row.kind === "client_patient"` → returns void (allow)
- Exported correctly through app-layer barrel `apps/webapp/src/app-layer/media/clientMediaFolders.ts` (line 6 adds `pgValidatePatientFolderRename` to re-exports).
- Route imports from `@/app-layer/media/clientMediaFolders`, not from `@/infra/repos/...` directly — correct Clean Architecture path. No ESLint violation.
- Advisory (non-blocking): function does a redundant DB round-trip. The route already fetches `existing` (including `kind`) via `pgGetMediaFolderById` before calling this. The gate at line 54 only fires when `existing.kind === "client_patient"` is already confirmed. The inner SELECT will always return `client_patient` (barring a concurrent delete/update race), making it a no-op validation that costs one extra query per rename. Not a correctness or security issue; DoD does not require query minimization.
- `pgValidateManualFolderParent` (lines 232–240): unchanged from the feat branch. Requirement says "extend/verify" — existing function already prevents moving any folder INTO a system-managed parent. No modification was needed; the requirement's `client_patient` parentId gate was instead implemented directly in the route (line 64). This is an acceptable implementation choice.

### Clause 5: Tests cover all 3 required cases
verdict: PASS
how-verified:
- Required case 1 — client_patient rename succeeds (200): test at line 120–137 of route.test.ts. PRESENT. Asserts 200, `renameFolderMock` called.
- Required case 2 — root rename 409: test at line 100–118. PRESENT. Asserts 409, `error === "system_folder_readonly"`, `renameFolderMock` not called.
- Required case 3 — reparent patient folder out → 409: test at line 139–157. PRESENT. Asserts 409, `error === "patient_folder_move_out"`, `moveFolderMock` not called.
- `validatePatientFolderRenameMock` is declared at file top (line 35), hoisted in `vi.mock` factory (line 41), and reset + configured in `beforeEach` at lines 70–71. Reset is correct: `validatePatientFolderRenameMock.mockReset()` at line 70, then `mockResolvedValue(undefined)` at line 71. Resets happen before every test — correct.
- All 14 tests pass (2 test files, 14 tests).

### Clause 6: §6 compliance (drizzle-only, no raw SQL, DI, route thin, no dup)
verdict: PASS
how-verified:
- Drizzle only: `pgValidatePatientFolderRename` uses `db.select({kind:...}).from(mediaFolders).where(eq(...)).limit(1)`. No `sql.raw()`, no `pool.query()`, no raw SQL strings.
- DI: `pgValidatePatientFolderRename` imported via `@/app-layer/media/clientMediaFolders` barrel. Route does NOT import from `@/infra/repos/` directly (confirmed by grep — no such import in route.ts). Correct architecture.
- Route thin: PATCH handler does parse → auth → fetch → 4 if-gate blocks → delegate to `deps.media.*`. No business logic in route. PASS.
- `isSystemManagedMediaFolder` import at route.ts line 5: NOT dead. Still used by the DELETE handler at line 125 (correct — DELETE remains blanket-blocked for all system-managed folders). No dead import.
- No duplication: `client_patient` parentId gate implemented once (route.ts line 64), not duplicated in the helper. Helper solely validates the rename case.

### Clause 7: Edge cases / security
verdict: PASS
how-verified:
- IDOR: route requires session (line 24) and `canAccessDoctor` role check (line 26) before any folder access. Folder-level ownership is not checked (pre-existing limitation noted in IDOR memory — deferred to SaaS, not in scope for PFI-ST-06).
- UUID injection: route validates `id` via UUID_RE regex (line 11, 31–33) before use in DB query. Safe.
- `parentId: null` for client_patient: correctly caught by line 64 (`null !== undefined === true`). Cannot move to root.
- `parentId: null` for client_files_root: correctly caught by line 61. Cannot move to root.
- Combined `name + parentId` for `client_patient`: name validation passes (returns void), then parentId gate fires → 409 `patient_folder_move_out`. Rename is NOT executed. Correct.
- Combined `name + parentId` for `client_files_root`: name check at line 51 fires first → 409 `system_folder_readonly`. Never reaches parentId check. Correct — both are blocked.
- No `"standard"` kind regression: guards are kind-specific, standard folders bypass all gates. Existing "returns 200 on rename" test confirms.
- Concurrent delete race (minor, non-blocking): if folder is deleted between `pgGetMediaFolderById` and `pgValidatePatientFolderRename`, the inner function throws → route returns 409 `system_folder_readonly` instead of 404. This is a benign race condition (false 409 vs correct 404) and is not a security concern.

## Tests

```
RUN  v4.1.6 /home/dev/dev-projects/BersonCareBot/apps/webapp

 Test Files  2 passed (2)
      Tests  14 passed (14)
   Start at  14:25:08
   Duration  3.87s (transform 64ms, setup 161ms, import 770ms, tests 30ms, environment 0ms)
```

Ran via `/home/dev/orch/run-tests.sh` flock mutex. All 14 tests pass including all 3 new tests and all 11 pre-existing tests. No regressions.

## Overall verdict: PASS

All 7 clauses pass. The implementation correctly:
- Allows `client_patient` folder renames (200)
- Blocks `client_files_root` any change (409 `system_folder_readonly`)
- Blocks `client_patient` reparenting including move-to-root via `parentId: null` (409 `patient_folder_move_out`)
- Guards combined `name + parentId` requests correctly
- Uses Drizzle-only queries, correct DI path, thin route
- Covers all 3 required test cases with proper mock reset in `beforeEach`

One advisory (non-blocking): `pgValidatePatientFolderRename` performs a redundant DB SELECT since the route already has `existing.kind` confirmed before calling it. This is a minor inefficiency, not a correctness issue.
