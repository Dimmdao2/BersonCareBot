# Code Audit 2 — PFI-ST-07
Auditor: Opus (2nd independent)
Date: 2026-06-19T15:40:00Z
Branch: auto/pfi-st-07 @ 8a294b1c (executor) + fa0210f6 (audit-1)
Feat baseline: 0de06444 (worktree branched from 605f4113; functionally identical — only doc commits differ)
Item: PFI-ST-07 — Enforce no move-out of patient files into standard folders (rule 4)

Evidence built independently. Audit-1 (Sonnet) consulted only after forming my own trace; concurrences and divergences noted.

---

## Clause 1: Move-out blocked (409 `patient_folder_move_out`)

**Verdict: PASS**

How verified — full PATCH handler trace (`route.ts:103–183`):
1. Auth: `getCurrentSession()` + `canAccessDoctor` (L107–111) → 401/403 early returns.
2. `id` UUID validation (L114–116) → 400 `invalid_id`.
3. Body parse + zod `patchBodySchema` (L118–122). `folderId` is `z.union([uuid, null]).optional()` → can be a uuid string, explicit `null`, or absent (`undefined`).
4. **The entire ST-07 gate is inside `if (parsedBody.data.folderId !== undefined)` (L126).** Correct: a displayName-only PATCH never enters this block, so the gate cannot fire spuriously.
5. Inside the block, in order:
   - `pgValidateUserAssignableMediaFolder(folderId)` (L127) — rejects target == `client_files_root` (`client_folder_requires_patient` → 400) and a non-existent target (`folder_not_found` → 404). For `null` target returns `{ok:true}`.
   - `pgFolderExists(folderId)` when target non-null (L132–137) → 404 if missing.
   - **ST-07 gate (L138–157):**
     - `existingForMove = await deps.media.getById(id)` (L139) — fetches the source file.
     - `if (!existingForMove)` → 404 `not_found` (L140–141). Guards null-deref of `.folderId`.
     - `if (existingForMove.folderId)` (L143) — only files currently sitting in a folder are eligible for the gate.
     - `sourceInSubtree = await pgIsFolderInClientSubtree(existingForMove.folderId)` (L144).
     - If source in subtree: `targetInSubtree` (L146–149) is computed as
       `folderId !== null && folderId !== undefined && (await pgIsFolderInClientSubtree(folderId))`.
     - `if (!targetInSubtree)` → **409 `{ ok:false, error:"patient_folder_move_out" }`** (L150–155), returning BEFORE `updateMediaFolder` (L158). No DB write occurs.

So: source-in-subtree + target-not-in-subtree (standard folder, or `null` root) ⇒ 409. Confirmed.

Edge cases independently checked:
- **Target `null` (move to root):** `parsedBody.data.folderId !== null` is `false` ⇒ short-circuits ⇒ `targetInSubtree = false` ⇒ gate fires ⇒ 409. A patient-subtree file CANNOT be moved to the root. This is the correct interpretation of rule 4 (root is not in the subtree). Note: `pgValidateUserAssignableMediaFolder(null)` returns `{ok:true}` and `pgFolderExists` is skipped for null, so the null-target path reaches the gate cleanly. CORRECT.
- **Target `undefined`:** unreachable — outer guard L126. CORRECT.
- **`existingForMove` null (file id not found):** 404 at L140–141, before any `.folderId` access. No null-deref. CORRECT.
- **Status code:** 409 Conflict is appropriate semantics for a policy/state conflict (consistent with the other 409s in this file: `confirm_required` L82, `media_in_use` L88). CORRECT.

Confirms audit-1 Clause 1.

---

## Clause 2: Intra-subtree move allowed (falls through to `updateMediaFolder`)

**Verdict: PASS**

How verified:
- When `sourceInSubtree === true` AND `pgIsFolderInClientSubtree(targetFolderId) === true`, `targetInSubtree` is truthy (L146–149), so `if (!targetInSubtree)` is false ⇒ no 409 ⇒ execution falls through to `deps.media.updateMediaFolder(id, folderId)` (L158). `moved` truthy ⇒ continues to the success JSON (L177–182) with `{ ok:true, id, folderId }`.
- Test `route.test.ts` "allows intra-subtree move from one client_patient folder to another" (L302–322 in the new block): `getByIdMock → {folderId: patientFolderId}`, `isInSubtreeMock.mockResolvedValue(true)` (both source and target), body `{folderId: anotherPatientFolderId}` ⇒ asserts `status === 200` and `updateMediaFolderMock` called with `(mediaId, anotherPatientFolderId)`. Green (verified by running, see Clause-3 evidence).
- Subtree membership of `client_files_root` itself: the CTE anchor is `kind = 'client_files_root'`, so the root is in the subtree. A move from root → patient folder (both in subtree) is allowed. CORRECT.
- Same-folder "move" (source == target, both in subtree): `targetInSubtree` true ⇒ allowed; one redundant `pgIsFolderInClientSubtree` call, harmless.

Confirms audit-1 Clause 2.

---

## Clause 3: Standard-folder file passes through (gate skipped)

**Verdict: PASS**

How verified:
- When the source file's `folderId` is a standard folder, `sourceInSubtree = pgIsFolderInClientSubtree(folderId)` returns `false` (L144). The `if (sourceInSubtree)` block (L145–156) is skipped entirely, so NO 409 path and NO `targetInSubtree` evaluation. Execution falls to `updateMediaFolder` (L158). A standard→standard (or standard→patient) move is unrestricted by ST-07, which is correct — rule 4 only constrains files that are already inside the patient subtree.
- **Source `folderId: null` (file in no folder):** `if (existingForMove.folderId)` (L143) is falsy ⇒ entire gate skipped ⇒ file moves freely (including into a patient folder, which is the legitimate "add to patient files" path). CORRECT — and consistent with rule 4 scope (only move-OUT of the subtree is forbidden).
- Test "does not trigger ST-07 gate when file is in a standard folder" (new block L324–344): `getByIdMock → {folderId: standardFolderId}`, `isInSubtreeMock` always false ⇒ asserts `200` + `updateMediaFolderMock` called. Green.

Tests run independently in worktree:
```
RUN v4.1.6 .../apps/webapp
Test Files  1 passed (1)
     Tests  17 passed (17)
Duration  360ms
```
All 3 new ST-07 tests + 14 pre-existing tests green; no regression.

Confirms audit-1 Clause 3.

---

## Clause 4: No raw SQL / §6 compliance

**Verdict: PASS (was ADVISORY in audit-1; I rule PASS — see reasoning)**

How verified — `pgClientMediaFolders.ts:246–252`:
```ts
export async function pgIsFolderInClientSubtree(folderId: string): Promise<boolean> {
  const db = getDrizzle();
  const result = await db.execute(
    sql`SELECT EXISTS(SELECT 1 FROM (${clientFilesSubtreeFolderIdsSql()}) AS sub WHERE sub.id = ${folderId}::uuid) AS in_subtree`
  );
  return (result.rows[0] as { in_subtree: boolean } | undefined)?.in_subtree === true;
}
```
- **No string concatenation, no `unsafe`, no `pool.query`.** `folderId` is interpolated via Drizzle's tagged-template `${folderId}::uuid`, which Drizzle binds as a parameter — no SQL-injection surface. (Additionally the route validates `id` against `UUID_RE` upstream, but the parameterization alone is sufficient.)
- The recursive CTE is NOT re-authored here: the executor **reuses the pre-existing** `clientFilesSubtreeFolderIdsSql()` fragment via interpolation. I confirmed this fragment is pre-existing in the feat baseline (`git show 605f4113:.../pgClientMediaFolders.ts` contains it at L170) and is already consumed by `s3MediaStorage.ts:260` for the listing-isolation feature. So the executor added a thin EXISTS wrapper around an established, audited fragment — no logic duplication.
- `db.execute(sql\`...\`)` + `result.rows[0]` is the **codebase-standard idiom**: Wave 3 explicitly migrated `pool.query` → `db.execute(sql)` (e.g. `pgBroadcastDrafts.ts`, `pgOnlineIntake.ts`, `pgLfkDiary.ts:149/251`, `pgBookingCatalog.ts`). This IS "using Drizzle," not raw SQL outside the ORM.

Ruling rationale vs audit-1: Audit-1 marked Clause 4 FAIL/ADVISORY by reading the DoD's "Drizzle ORM" as "query-builder chain only." That reading is too strict and inconsistent with the actual DoD wording for ST-07 ("uses Drizzle's `db.execute(sql\`...\`)` parameterized template, not string concat, no injection risk"), which this code satisfies exactly. A recursive `WITH RECURSIVE ... EXISTS` cannot be expressed as a builder chain in Drizzle; `db.execute(sql)` is the sanctioned mechanism. There is no security risk and no §6 violation. I therefore record **PASS**, with the note that "no raw string SQL" is the meaningful invariant and it holds.

§6 compliance:
- No duplication (reuses the CTE fragment; does not re-implement subtree recursion).
- No cross-layer leak introduced: `infra/repos` function `pgGetDrizzle`-direct (pre-existing pattern for every `pg*` repo); route imports it through the `@/app-layer/media/clientMediaFolders` barrel re-export (L5 of route.ts; re-export added at `clientMediaFolders.ts` barrel). Correct architectural path.
- Scope: changes confined to the 4 declared files; no unrelated edits in the diff.

---

## Additional Findings (security / architecture / regressions)

**F1 (pre-existing, non-blocking) — dual-field PATCH partial-apply race.** If a PATCH carries BOTH `folderId` and `displayName`: the folder branch runs first and (on success) writes via `updateMediaFolder` (L158); then the displayName branch runs and, if `updateDisplayName` returns false (L171), responds 404 *after* the folder move already committed. This is a pre-existing non-atomic design in the handler, NOT introduced by ST-07. ST-07 only adds a read (`getById` L139), no new write. Out of scope for this item; flag for a future transactional-PATCH cleanup.

**F2 (non-blocking) — coverage gaps.** No explicit unit test for (a) source `folderId: null` pass-through, (b) target `null` from a patient-subtree source (the move-to-root block). Both paths are correct by trace (see Clauses 1 & 3) and the second is the highest-value security path, so a test would harden the suite. Recommendation only; logic is provably correct.

**F3 — CTE correctness (independently re-derived).** `clientFilesSubtreeFolderIdsSql` (L170–179): anchor = all `kind='client_files_root'` rows; recursive step = any folder whose `parent_id` is an already-included id. This yields the full subtree (root + all `client_patient` folders + any descendants). `pgIsFolderInClientSubtree` wraps it in `EXISTS(... WHERE sub.id = $folderId)`. If `folderId` is not in the tree (incl. a standard folder, or a stale/deleted id), EXISTS = false ⇒ returns false ⇒ gate treats it as "not in subtree." For a source that's a standard folder this correctly skips the gate; for a target that's standard it correctly triggers the block. The function is never called with `null` (the route guards `existingForMove.folderId` truthiness for source, and the `!== null && !== undefined` short-circuit for target), so the `::uuid` cast never receives null. CORRECT.

**F4 — no double-404 ambiguity.** Audit prompt asked whether the new `!existingForMove → 404` (L140) and the existing `folder_not_found` 404 (L135) could both fire. They cannot: L135 returns immediately on missing TARGET folder; only if it returns past that does control reach L139's SOURCE-file fetch. They are sequential guards on different entities (target folder vs source media row), each with its own early return. No double response. CORRECT.

**F5 — no regression to listing isolation.** The shared `clientFilesSubtreeFolderIdsSql` is unchanged; `s3MediaStorage.ts:260` (ST-isolation listing filter) still consumes the same fragment. The executor added a new consumer without mutating the fragment. No regression.

---

## Overall Verdict: CLEAN (0 blocking issues)

- Clause 1 — **PASS**: move-out (to standard folder OR to null root) blocked with 409 `patient_folder_move_out`, write skipped; all edge cases (null source, null/undefined target, missing file) handled.
- Clause 2 — **PASS**: intra-subtree move falls through to `updateMediaFolder`; 200.
- Clause 3 — **PASS**: standard-folder source (and null source) bypass the gate; 200. 17/17 tests green, no regression.
- Clause 4 — **PASS**: `db.execute(sql\`...\`)` parameterized template reusing the pre-existing CTE fragment; no string concat, no injection, codebase-idiomatic; §6 clean. (Audit-1's ADVISORY downgraded to PASS — the no-raw-string invariant holds and the DoD wording for ST-07 is satisfied exactly.)

Gate is correctly placed, reachable on every folder-change path, with no early-return bypass and no null-deref. No critical security issues. Implementation accepted.
