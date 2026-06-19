# Code-Audit-2 PFI-ST-09
auditor: opus-code-auditor-2 (Chief, independent)
model: Opus
item: PFI-ST-09 — Individual video rename capability (rule 6)
base: b7481aaf; head: 3319e259
prior-audit: code-audit-1-pfi-st-09.md (Sonnet, PASS 3/3)
date: 2026-06-19

## Summary
ST-09 adds **only tests** — no production code change. Verified independently:
`git diff b7481aaf 3319e259 -- '*.ts' '*.tsx' ':!*test*'` is **empty**. The PATCH
handler in `route.ts` already routes displayName-only requests around every
folder/subtree guard by design. The executor's "no code change" decision is
**correct**. All clauses PASS.

---

## Clause 1: Rename reachable
Verdict: **PASS**
How verified (trace of `PATCH`, route.ts:103–182 for body `{displayName:"X"}`):
- L107–111: session present + `canAccessDoctor("doctor")` → passes role gate.
- L113–116: `id` is a valid UUID → passes.
- L118–122: `patchBodySchema.safeParse({displayName:"X"})` succeeds. `folderId`
  is **absent**; the Zod field is `z.union([...]).optional()` (route.ts:18),
  which for an absent key yields **`undefined`** (NOT `null`) — confirmed by
  reading the schema. The `.refine` (L20–22) passes because `displayName !== undefined`.
- L126: `parsedBody.data.folderId !== undefined` → `undefined !== undefined` → **false**.
  The entire folder block L127–162 (validate, folderExists, ST-07 move-out gate,
  `updateMediaFolder`) is **skipped**.
- L165: `parsedBody.data.displayName !== undefined` → **true**. Normalizes
  `"Видео ЛФК для плеча"` (non-empty trim → kept), calls
  `deps.media.updateDisplayName(id, "Видео ЛФК для плеча")` (L170), returns 200
  with `{ok:true, id, displayName}` (L177–182).
- Test `route.test.ts:365–386` asserts status 200, `body.displayName`, and
  `updateDisplayNameMock` called with `(mediaId, "Видео ЛФК для плеча")`. Matches the trace.

## Clause 2: Not blocked
Verdict: **PASS**
How verified:
- `pgIsFolderInClientSubtree` is referenced **only** inside the
  `if (parsedBody.data.folderId !== undefined)` block — at route.ts:144 (source
  subtree check) and route.ts:149 (target subtree check). There are no other call
  sites in the file (grep-confirmed by full read). A displayName-only body keeps
  `folderId === undefined`, so neither line is reachable. The system-folder
  readonly guard / ST-07 move-out gate therefore cannot fire on a rename.
- Test `route.test.ts:365–386` + `:388–403` both assert
  `expect(isInSubtreeMock).not.toHaveBeenCalled()` — a precise lock on this
  invariant, including the `displayName:null` (clear) path. Both green.

## Clause 3: Tests green
Verdict: **PASS**
How verified: ran the exact ST-09 head test file (`git show auto/pfi-st-09:...route.test.ts`)
against the main repo deps (production `route.ts` is **byte-identical** between
main and ST-09 head — verified by diff, since prod diff is empty), via
`/home/dev/orch/run-tests.sh` flock mutex:

```
vitest --run --reporter=verbose 'src/app/api/admin/media/[id]/route.test.ts'
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

All 19 named tests pass, including the two new ST-09 cases:
- `... ST-09 displayName rename in patient folder > renames video in patient folder — returns 200, not blocked by any folder guard` ✓
- `... ST-09 displayName rename in patient folder > rename in patient folder with null clears displayName — not blocked` ✓

Note on the "17" claimed in commit msg / Sonnet audit: the file actually contains
**19** `it` blocks and vitest reports **19 passed** (base b7481aaf already had 17;
ST-09 adds 2 → 19). The commit message's "17/17" is a minor stale count, not a
functional defect. Regression check: base it-count = 17, head = 19, delta = +2
(exactly the two new ST-09 cases); no pre-existing test was removed or altered
(the commit diff is a pure +52-line append after the ST-07 describe block).

## Mock-wiring verification (audit step 3)
- `updateDisplayNameMock` → wired into `buildAppDeps().media.updateDisplayName`
  (route.test.ts:34) via `vi.mock("@/app-layer/di/buildAppDeps", ...)` (L49–51).
  Production calls `deps.media.updateDisplayName` (route.ts:170). Correct path.
- `isInSubtreeMock` → wired to `pgIsFolderInClientSubtree` via
  `vi.mock("@/app-layer/media/clientMediaFolders", ...)` (L53–56). Production
  imports `pgIsFolderInClientSubtree` from that exact module (route.ts:5). Correct path.
- `getByIdMock` → `buildAppDeps().media.getById` (L36). Used by ST-07's move
  branch (route.ts:139); harmless for displayName-only. Correct path.
- `getSessionMock` → `@/modules/auth/service` `getCurrentSession` (L45–47),
  matching route.ts:6 import. Correct path.
The `not.toHaveBeenCalled()` assertions are therefore meaningful (the mock is the
real seam the handler would hit), not vacuously-true against a never-imported symbol.

## Additional findings

1. **(INFO, pre-existing, out of scope) Role-gate only — no per-file ownership/org
   check.** The PATCH handler authorizes solely via `canAccessDoctor(session.user.role)`
   (route.ts:107–111). Any doctor/admin can rename any media by id, including a file
   in another patient's folder. This is the known IDOR pattern already deferred to
   the SaaS/multi-tenant initiative (per project memory: "IDOR patient routes →
   deferred to SaaS"). It is **not introduced by ST-09** (prod diff empty) and ST-09's
   scope is rule-6 reachability, not authorization. No action for this stage; flag
   only so the next reviewer is aware the rename route inherits the same multi-tenant
   gap as the rest of /api/admin/media.

2. **(INFO) Commit-message test count is stale ("17/17" vs actual 19/19).** Cosmetic;
   does not affect correctness or DoD.

3. **(POSITIVE) Test design is correct and non-vacuous.** The two ST-09 cases set
   `getByIdMock` to a patient-subtree folder yet assert `isInSubtreeMock` is never
   called — this is exactly the right way to prove the guard is bypassed *because of
   the displayName-only branch*, not because the file happens to be outside a subtree.
   The `null`-clear case additionally locks the second displayName code path.

4. **(VERIFIED) No production code changed.** `git diff b7481aaf 3319e259 -- '*.ts'
   '*.tsx' ':!*test*'` returns empty. `route.ts` identical in main and ST-09 head.
   The DoD ("not blocked by system-folder readonly guard; test green") is satisfied
   by the existing handler structure + the new locking tests. No requirement asks for
   anything to be *added* to production code; the executor's read is sound.

## Verdict
**CLEAN** — all 3 clauses PASS; the two additional findings are pre-existing /
cosmetic (INFO only) and do not block. ST-09 correctly proves and locks the
rename-not-blocked invariant with no production change.
