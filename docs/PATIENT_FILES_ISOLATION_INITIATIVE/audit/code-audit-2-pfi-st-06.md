# Code Audit 2 — PFI-ST-06 (Chief/Opus, independent)
Auditor: opus-auditor-pfi-st-06 (Opus, independent 2nd audit)
Date: 2026-06-19

Method: independent deep trace from source; audit-1 conclusions NOT read or assumed.
Commit under audit: `b117a136` ("feat(PFI-ST-06): allow client_patient folder rename; deny reparent/root rename").

## Finding summary
| # | Clause | Result | How verified |
|---|---|---|---|
| C1 | `pgValidatePatientFolderRename` passes `client_patient`, rejects all other kinds | PASS | Source trace: `if (row.kind !== "client_patient")` throws; only `client_patient` falls through |
| C2 | Throws `statusCode: 409` + sensible message `system_folder_readonly` | PASS | `Object.assign(new Error("system_folder_readonly"), { statusCode: 409 })` |
| C3 | Route guard: `client_files_root` + name change → 409 | PASS | route.ts L51-53 + test "returns 409 when renaming client_files_root folder" |
| C4 | Route guard: `client_files_root` + parentId change → 409 | PASS | route.ts L61-63 |
| C5 | Route guard: `client_patient` + name change → allowed (validator passes) | PASS | route.ts L54-60 + test "returns 200 when renaming client_patient folder" |
| C6 | Route guard: `client_patient` + parentId change → 409 `patient_folder_move_out` | PASS | route.ts L64-66 + test "returns 409 patient_folder_move_out…" |
| C7 | `standard` / `null` kind unaffected by new gate (no regression) | PASS | All four new guards are gated on `=== "client_files_root"` / `=== "client_patient"`; standard skips all; "returns 200 on rename" still green |
| C8 | Route thin — no business logic beyond kind-gate | PASS | Route only branches on kind + delegates to validator / `deps.media.*`; rules live in repo layer |
| C9 | Drizzle query uses column objects (no `sql` template) | PASS | `.select({ kind: mediaFolders.kind }).where(eq(mediaFolders.id, folderId))` — pure column API |
| C10 | `pgValidatePatientFolderRename` re-exported from app-layer | PASS | clientMediaFolders.ts L6 re-export |
| C11 | All route tests pass incl. 3 new ST-06 tests | PASS | `vitest run` → 14 passed (2 files) |
| C12 | TypeScript clean | PASS | `tsc --noEmit` exit 0 |
| C13 | Scope — only the expected 4 files | PASS | `git show --name-only` → exactly the 4 target files |

## Detail

### C1 / C2 — `pgValidatePatientFolderRename` (pgClientMediaFolders.ts L198-220)
The function selects only the `kind` column for the folder id. Two reject paths:
- `!row` (folder gone) → throws `Error("system_folder_readonly")` with `statusCode: 409`.
- `row.kind !== "client_patient"` → same throw. This covers `client_files_root`, `standard`, and any unknown kind.
Only `client_patient` reaches the trailing comment and returns `void`. Behaviour is exactly the documented contract. The `_newName` param is intentionally unused (prefixed underscore) — the validator gates on kind, not name content, which matches DoD ("name changes are allowed" for patient folders). PASS.

Note (advisory, non-blocking): the not-found branch returns `system_folder_readonly` rather than a not-found signal. This is harmless here because the route already does its own `pgGetMediaFolderById` existence check (route.ts L42-45) and returns 404 before ever calling the validator, so the validator's not-found branch is effectively unreachable in the live path. The in-function comment acknowledges this ("not_found is handled upstream; treat as readonly here to be safe"). No action required.

### C3 / C4 — `client_files_root` fully read-only (route.ts L51-53, L61-63)
Name change on root → 409 `system_folder_readonly` (L51-53). ParentId change on root → 409 `system_folder_readonly` (L61-63). Both fire before any `deps.media.*` call, so the root can be neither renamed nor reparented. Test "returns 409 when renaming client_files_root folder" asserts status 409, error key `system_folder_readonly`, and `renameFolderMock` NOT called. PASS.

### C5 — `client_patient` rename allowed (route.ts L54-60)
For `client_patient` + name change, the route calls `pgValidatePatientFolderRename`; on success it falls through to `deps.media.renameFolder(id, name)` (L96-101). The validator returns void for `client_patient`, so the rename proceeds → 200. Test "returns 200 when renaming client_patient folder" asserts 200 and `renameFolderMock` called with `(FOLDER_ID, "Иван Иванов")`. PASS.

One observation: the route wraps the validator in `try/catch` and on any throw maps to 409 `system_folder_readonly`. Since the validator only throws on non-`client_patient` rows — and the route has already confirmed `existing.kind === "client_patient"` before entering this branch — the catch is defensive-only and won't trigger in normal flow. It does not introduce incorrect behaviour. Minor double-fetch (route fetched `existing`, validator re-fetches the row) — acceptable, not a correctness issue.

### C6 — `client_patient` reparent forbidden (route.ts L64-66)
`parsed.data.parentId !== undefined && existing.kind === "client_patient"` → 409 `patient_folder_move_out`, returned before any move. This distinct error key (not `system_folder_readonly`) precisely matches the DoD. Test "returns 409 patient_folder_move_out…" asserts 409, key `patient_folder_move_out`, and `moveFolderMock` NOT called. PASS.

### C7 — no standard-folder regression
The four new guards each require `existing.kind === "client_files_root"` or `=== "client_patient"`. A `standard` (or null-kind) folder matches none of them and flows through to the pre-existing parent/self/move/rename logic unchanged. The retained "returns 200 on rename" and "returns 400 for self parent" / "returns 404 when new parent missing" tests (default `standardFolder` fixture) remain green, confirming no regression. PASS.

### C8 — route thinness
The route's responsibilities are: auth, id/body validation, existence check, kind-based branching, and delegation to `pgValidatePatientFolderRename` / `pgValidateManualFolderParent` / `deps.media.*`. The rename-permission rule itself lives in the repo layer (`pgValidatePatientFolderRename`). The inline kind-gate is a thin routing decision over already-fetched data, not business logic. Acceptable per clean-architecture norms. PASS.

### C9 — no raw SQL in the new query
`db.select({ kind: mediaFolders.kind }).from(mediaFolders).where(eq(mediaFolders.id, folderId)).limit(1)` — entirely the Drizzle column/operator API. No `sql\`\`` template in the new validator. (Pre-existing `sql` usage elsewhere in the file is untouched by this commit.) PASS.

### C10 — app-layer re-export
`apps/webapp/src/app-layer/media/clientMediaFolders.ts` line 6 re-exports `pgValidatePatientFolderRename` from `@/infra/repos/pgClientMediaFolders`, and the route imports it from the app-layer path (route.ts L5). Layering respected. PASS.

### C11 — tests
`pnpm vitest run src/app/api/admin/media/folders --reporter=verbose` → **14 passed (2 files)**, including all 3 new ST-06 tests:
- returns 409 when renaming client_files_root folder
- returns 200 when renaming client_patient folder (rule 2: allowed)
- returns 409 patient_folder_move_out when reparenting client_patient folder (rule 4: forbidden)
PASS.

### C12 — TypeScript
`pnpm -C apps/webapp exec tsc --noEmit` → exit 0, no diagnostics. PASS.

### C13 — scope
`git show b117a136 --name-only` → exactly:
- app-layer/media/clientMediaFolders.ts (+1 re-export)
- app/api/admin/media/folders/[id]/route.test.ts (+3 tests)
- app/api/admin/media/folders/[id]/route.ts (granular gate)
- infra/repos/pgClientMediaFolders.ts (new validator)
No stray files. PASS.

## DoD cross-check
- client_patient rename succeeds (HTTP 200) — PASS (C5)
- client_files_root rename → 409 system_folder_readonly — PASS (C3)
- Reparent client_patient → 409 patient_folder_move_out — PASS (C6)
- Tests cover all three cases — PASS (C11)
- Route thin — PASS (C8)

## Verdict
- **PFI-ST-06: CLEAN**

All 13 clauses PASS. Two non-blocking advisories: (1) the validator's unreachable not-found branch returns `system_folder_readonly` instead of a not-found signal — harmless because the route pre-checks existence; (2) the route both fetches `existing` and the validator re-fetches the kind row (minor redundant DB read). Neither affects correctness or the DoD. No FAIL conditions present (correct 409 status, correct error keys `system_folder_readonly` / `patient_folder_move_out`, no standard-folder regression, no raw SQL, tsc clean).
