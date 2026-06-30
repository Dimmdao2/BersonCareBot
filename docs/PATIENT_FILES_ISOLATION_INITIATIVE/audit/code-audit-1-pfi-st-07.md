# Code Audit 1 — PFI-ST-07
Auditor: Sonnet (1st independent)
Date: 2026-06-19T13:30:00Z
Branch: auto/pfi-st-07 @ 8a294b1c vs feat @ aa4b9414

---

## Clause 1: Move-out blocked (409)

**Verdict: PASS**

How verified:
- `route.ts:126–162` — the entire ST-07 gate sits inside `if (parsedBody.data.folderId !== undefined)`. This is the correct placement: it only runs when a folder-change is requested, not on displayName-only PATCHes.
- Execution flow (traced fully):
  1. `pgValidateUserAssignableMediaFolder(parsedBody.data.folderId)` — checks target folder is not `client_files_root` (line 127)
  2. `pgFolderExists(parsedBody.data.folderId)` — confirms target folder exists (line 133)
  3. `deps.media.getById(id)` → `existingForMove` (line 139) — fetches source file's current folderId
  4. If `existingForMove` is null → 404 (line 140–141)
  5. If `existingForMove.folderId` is truthy (file has a current folder) → calls `pgIsFolderInClientSubtree(existingForMove.folderId)` (line 144)
  6. If source is in subtree: evaluates `targetInSubtree` (line 146–149) — requires target folderId to be non-null AND non-undefined AND in subtree
  7. If `!targetInSubtree` → returns 409 `patient_folder_move_out` (line 151–154)
- All 3 tests in the ST-07 describe block confirm correct 409 path + body `{ error: "patient_folder_move_out" }`.

Edge cases verified:
- **Target is `null` (move-to-root):** `parsedBody.data.folderId !== null` evaluates to `false`, so `targetInSubtree = false` via short-circuit. Gate fires → 409. Patient-subtree file cannot escape to the folder-less root. CORRECT.
- **Target is `undefined`:** Cannot reach ST-07 gate — the outer `if (parsedBody.data.folderId !== undefined)` at line 126 guards the entire block. CORRECT.
- **`existingForMove` null:** 404 returned at line 140–141 before gate. No double-response risk (this is the only `getById` call; the displayName branch has no `getById`). CORRECT.

---

## Clause 2: Intra-subtree move allowed

**Verdict: PASS**

How verified:
- `route.ts:146–149`: `targetInSubtree` is `true` when `pgIsFolderInClientSubtree(parsedBody.data.folderId)` returns `true`.
- `if (!targetInSubtree)` → does NOT enter the 409 branch → falls through to `updateMediaFolder` (line 158).
- Test "allows intra-subtree move" (`route.test.ts:312–329`): `isInSubtreeMock.mockResolvedValue(true)` for both source and target → `res.status === 200` + `updateMediaFolderMock.toHaveBeenCalledWith(mediaId, anotherPatientFolderId)`. Green.

Edge cases:
- **Source and target are the SAME patient folder** (no actual move): `pgIsFolderInClientSubtree` called twice with the same folderId, both return `true`. `targetInSubtree = true`. Move allowed — one extra DB query wasted but logically harmless. The `updateMediaFolder` repo call will update the row to the same folderId value; not blocked.
- **File in `client_files_root`** (edge-case subtree member): `clientFilesSubtreeFolderIdsSql` CTE starts `SELECT id FROM media_folders WHERE kind = 'client_files_root'` so the root itself IS in the subtree. Moving from `client_files_root` to a `client_patient` folder is correctly allowed (both in subtree).

---

## Clause 3: Tests cover all three cases and GREEN

**Verdict: PASS**

How verified (test run output, 2026-06-19 15:29):
```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  3.53s
```

The 3 new ST-07 tests (lines 287–352):
1. **"returns 409 patient_folder_move_out when moving from client_patient folder to standard folder"** — covers the blocked move-out case. Mocks `getByIdMock` returning `{ folderId: patientFolderId }`, `isInSubtreeMock` returning true for source, false for target. Asserts `status === 409`, `body.error === "patient_folder_move_out"`, `updateMediaFolderMock` NOT called.
2. **"allows intra-subtree move from one client_patient folder to another"** — covers allowed intra-subtree. Mocks `isInSubtreeMock.mockResolvedValue(true)`. Asserts `status === 200`, `updateMediaFolderMock` called with correct args.
3. **"does not trigger ST-07 gate when file is in a standard folder"** — covers pass-through for non-patient files. Mocks `getByIdMock` returning `{ folderId: standardFolderId }`, `isInSubtreeMock` always `false`. Asserts `status === 200`, `updateMediaFolderMock` called.

All three clauses are covered and GREEN. The 14 pre-existing tests also pass (no regression).

One test gap noted (not a FAIL — see §Additional findings):
- No test for source file with `folderId: null` (file currently in no folder). The gate is skipped via `if (existingForMove.folderId)` guard, so the file is moved freely. This is correct behavior but untested.
- No test for target `folderId: null` (move-to-root) from a patient-subtree source. This case is BLOCKED correctly (see Clause 1 edge cases), but no explicit test exists.

---

## Clause 4: No raw SQL — only Drizzle ORM

**Verdict: FAIL (advisory — raw SQL in `pgIsFolderInClientSubtree`, but it wraps an existing Drizzle CTE fragment)**

How verified:
- `pgClientMediaFolders.ts:248–251`:
  ```ts
  const result = await db.execute(
    sql`SELECT EXISTS(SELECT 1 FROM (${clientFilesSubtreeFolderIdsSql()}) AS sub WHERE sub.id = ${folderId}::uuid) AS in_subtree`
  );
  ```
- `db.execute(sql\`...\`)` is a raw Drizzle SQL execution — not a Drizzle query builder expression. This is raw SQL with Drizzle's `sql` template tag.
- The DoD states: "No raw SQL — only Drizzle ORM; `pgIsFolderInClientSubtree` uses existing Drizzle CTE, not a raw string query."
- The inner CTE `clientFilesSubtreeFolderIdsSql()` at line 170–179 is itself a `sql\`...\`` fragment — also raw SQL, though it was pre-existing and used in `pgValidateUserAssignableMediaFolder` context.
- The `folderId` parameter is safely interpolated via Drizzle's parameterized `sql` tag (`${folderId}::uuid`), so there is no SQL injection risk.

Assessment: The function uses `db.execute(sql\`...\`)` which is the standard Drizzle pattern for complex queries that cannot be expressed as a pure builder chain (recursive CTEs, EXISTS subqueries wrapping CTEs). The DoD clause says "uses existing Drizzle CTE, not a raw string query" — the CTE IS reused (`clientFilesSubtreeFolderIdsSql()` is interpolated), and the `sql` template tag is Drizzle's own facility (not a raw string concatenation). There is no string concatenation or `db.query.unsafe()`.

**Ruling:** ADVISORY — the implementation is consistent with all other CTE/EXISTS patterns in this codebase (e.g. `clientFilesSubtreeFolderIdsSql` itself at line 170–179), uses Drizzle's parameterized `sql` tag, and is not exploitable. The DoD clause is technically unmet if "Drizzle ORM" is read as "query builder only," but the pattern is the idiomatic way to handle this in Drizzle. No security risk.

---

## Additional Findings

### Finding A: Missing test for `folderId: null` source and target edge cases (coverage gap, non-blocking)

- No test for file with `existingForMove.folderId === null` (source in no folder). The gate is correctly skipped, but this path is untested.
- No test for `PATCH { folderId: null }` with a patient-subtree source file. The gate fires correctly (targetInSubtree = false → 409), but this is untested.
- Neither is a blocking defect — the logic is correct and provable by code trace — but test coverage is incomplete.
- Recommendation: add two tests for these cases.

### Finding B: Double `getById` when both `folderId` and `displayName` in PATCH body

- When PATCH sends both `folderId` and `displayName`, `getById` is called at `route.ts:139` (inside the folderId branch).
- The `displayName` branch (`route.ts:165–175`) calls only `updateDisplayName` — no second `getById`.
- If `updateMediaFolder` succeeds (line 158) but `updateDisplayName` later returns false (line 170–172) → 404 is returned AFTER the folder update has already been applied. The folder was moved but the response says "not_found." This is a pre-existing design inconsistency in the PATCH handler (not introduced by ST-07), but ST-07's addition of a getById call (line 139) means the file is confirmed to exist before the folder-move. If it then disappears before the displayName update, the 404 is a race condition. Not a blocker.

### Finding C: CTE correctness verification

- `clientFilesSubtreeFolderIdsSql()` at `pgClientMediaFolders.ts:170–179`:
  ```sql
  WITH RECURSIVE client_tree AS (
    SELECT id FROM media_folders WHERE kind = 'client_files_root'
    UNION ALL
    SELECT f.id FROM media_folders f INNER JOIN client_tree t ON f.parent_id = t.id
  )
  SELECT id FROM client_tree
  ```
- Anchor: all rows with `kind = 'client_files_root'` (should be exactly 1).
- Recursive step: all folders whose `parent_id` is any already-included folder.
- Result: all folders in the entire subtree rooted at the client-files root.
- `pgIsFolderInClientSubtree` wraps this with `EXISTS(... WHERE sub.id = $folderId::uuid)`.
- The CTE correctly includes both `client_files_root` and all `client_patient` folders (and any sub-folders if they exist). CORRECT.

### Finding D: Security — bypass via dual-field PATCH

- A PATCH body `{ folderId: "standard-id", displayName: "renamed" }` — both fields present.
- Flow: folderId branch runs first (ST-07 gate runs) → if blocked, 409 returned before displayName branch. No bypass.
- A PATCH body with only `displayName` — folderId branch is skipped entirely (line 126: `parsedBody.data.folderId !== undefined` is false). Gate not triggered — CORRECT, no folder change.

### Finding E: `pgIsFolderInClientSubtree` called from `infra/repos/` directly, not through a port

- The function bypasses DI (it calls `getDrizzle()` directly inside `infra/repos/pgClientMediaFolders.ts`).
- Route imports it via `@/app-layer/media/clientMediaFolders` re-export, which is the correct architectural path.
- Pre-existing pattern in this codebase (all `pg*` repo functions do the same). Not a new violation.

---

## Overall Verdict: PASS (0 blocking issues, 1 advisory on Clause 4)

Clause 1: **PASS** — move-out correctly blocked with 409, including edge case where target is null  
Clause 2: **PASS** — intra-subtree move correctly allowed  
Clause 3: **PASS** — all 17 tests green; all three DoD cases covered  
Clause 4: **ADVISORY** — uses `db.execute(sql\`...\`)` with parameterized CTE interpolation (Drizzle's idiomatic pattern for CTEs); no raw string concatenation; no injection risk; consistent with pre-existing codebase patterns

The implementation is functionally correct, the gate is correctly placed and reachable, all edge cases handled correctly, and tests pass. The Clause 4 advisory does not block acceptance.
