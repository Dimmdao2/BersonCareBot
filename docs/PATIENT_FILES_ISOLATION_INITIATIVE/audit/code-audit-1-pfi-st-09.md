# PFI-ST-09 Code Audit 1 — Sonnet

auditor: CODE-AUDITOR-1 (Sonnet)
commit: 3319e259
branch: auto/pfi-st-09
base: b7481aaf (auto/pfi-st-07 merged)

**VERDICT: PASS**

---

## Summary

PFI-ST-09 requirement: displayName-only PATCH on `/api/admin/media/[id]` must NOT be blocked when a file lives in a patient folder. Only `folderId` moves are guarded by the ST-07 move-out gate (`pgIsFolderInClientSubtree`).

The executor correctly determined no production code change was needed. The existing ST-07 gate in `route.ts` is already gated inside `if (parsedBody.data.folderId !== undefined)` (line 126). A displayName-only body leaves `folderId` as `undefined` in the parsed schema, so the gate block is never entered and `pgIsFolderInClientSubtree` is never called.

ST-09 is therefore test-only: commit `3319e259` adds exactly 52 lines to `route.test.ts` (2 new test cases in a new `describe` block). No changes to `route.ts` or any other production file.

---

## Findings

1. **Diff scope is clean.** `git show 3319e259 --stat` confirms exactly 1 file changed: `apps/webapp/src/app/api/admin/media/[id]/route.test.ts` — 52 insertions, 0 deletions. `route.ts` diff is empty. No production code was modified.

2. **Both new tests correctly target the displayName-only path.**
   - Test 1 (`renames video in patient folder — returns 200, not blocked by any folder guard`): sends body `{ displayName: "Видео ЛФК для плеча" }` with file mocked at `patientFolderId`. Asserts `res.status === 200`, `body.ok === true`, `body.displayName === "Видео ЛФК для плеча"`, `updateDisplayNameMock` called with correct args, and crucially: `expect(isInSubtreeMock).not.toHaveBeenCalled()`.
   - Test 2 (`rename in patient folder with null clears displayName — not blocked`): sends body `{ displayName: null }` with same patient folder setup. Asserts `res.status === 200`, `updateDisplayNameMock` called with `null`, and `expect(isInSubtreeMock).not.toHaveBeenCalled()`.

3. **`pgIsFolderInClientSubtree` is NOT called for displayName-only PATCH.** Verified by tracing through `route.ts`:
   - `patchBodySchema.safeParse({ displayName: "X" })` → `folderId` field is `.optional()` and absent → `parsedBody.data.folderId === undefined`
   - Line 126: `if (parsedBody.data.folderId !== undefined)` → **false** → the entire ST-07 gate block (lines 126–162 including both `pgIsFolderInClientSubtree` calls at lines 144 and 149) is skipped entirely
   - There are no other calls to `pgIsFolderInClientSubtree` in the PATCH handler
   - `isInSubtreeMock` is properly wired via `vi.mock` at line 55; the `.not.toHaveBeenCalled()` assertion is airtight

4. **Mock setup is correct.**
   - `isInSubtreeMock` is `mockReset()` in ST-09's `beforeEach` (line 359) — no bleedover from ST-07 tests
   - `updateDisplayNameMock.mockResolvedValue(true)` set in `beforeEach` — properly pre-armed
   - `getByIdMock.mockResolvedValue({ id: mediaId, folderId: patientFolderId })` is set in each test to simulate a file that lives in a patient folder. While `getById` is not called by the displayName-only path (it's inside the `folderId` gate block), having it set is defensively correct and does not affect test validity

5. **No security regression.** No new raw SQL, no new bypass paths, no removal of any guard. The only change is additive test coverage. The structural invariant (`folderId !== undefined` gating all subtree checks) remains intact.

6. **Edge case `{ displayName: "X", folderId: null }` is intentionally not covered by ST-09.** This body would have `folderId = null`, which satisfies `null !== undefined`, entering the gate block. This is correct behavior — unsetting folder (moving to root) while renaming is a move operation and must be guarded. ST-09 only targets displayName-only requests.

---

## Test Results

All tests pass: **42/42** (full `src/app/api/admin/media` suite including the 2 new ST-09 cases).

Test breakdown for `route.test.ts`:
- `GET /api/admin/media/[id]` — 4 tests
- `DELETE /api/admin/media/[id]` — 9 tests (includes pre-existing displayName PATCH tests)
- `PATCH ... ST-07 move-out gate` — 3 tests
- `PATCH ... ST-09 displayName rename in patient folder` — **2 new tests** (both PASS)

Verified by temporarily applying the ST-09 test file to the main worktree and running:
```
pnpm -C apps/webapp exec vitest run "src/app/api/admin/media"
```
Output: `Test Files 5 passed (5), Tests 42 passed (42)`

Pre-existing failures in the broader codebase (22 unrelated test files in the `auto/pfi-st-06` base) are not related to this commit.
