# Code Audit 2 — PFI-ST-02 + PFI-ST-03 (Chief/Opus, independent)
Auditor: opus-auditor-pfi-st-02-03 (Opus, independent 2nd audit, §4A step 9)
Date: 2026-06-19

Method: independent deep trace of the full data flow (not a re-verification of audit 1).
Each clause re-derived from source; the prior audits' conclusions were not assumed.

- ST-02 commit: `a0f9de97` — replace uuid8 dedup suffix with last4 phone digits.
- ST-03 commit: `92404aa9` — regression guard for `excludeClientFiles` hiding patient subtree.
- Base: `feat/doctor-ui-rebuild` (`258500e6…`, HEAD of base at audit time `109c3c16`).
- Tests: ran both target files via the orch mutex — **21/21 PASS** (`vitest run`, 3.26s).
  - `src/modules/media/clientFilesFolders.test.ts` (16) + `src/infra/repos/mockMediaStorage.test.ts` (5).
- Note: the working branch has since advanced to PFI-ST-06; the ST-02/ST-03 functions
  audited here are unchanged by later working-tree edits (the only uncommitted diff to
  `pgClientMediaFolders.ts` adds `pgValidatePatientFolderRename`, which does not touch
  `resolvePatientDisplayNameAndPhone`, `pgEnsureClientPatientFolder`, or the fallback name).

## ST-02 — last4 phone dedup

| # | Clause | Result | How verified |
|---|---|---|---|
| 1 | Last4 extraction handles all branches (null / "" / <4 digits / no digits / exactly 4 / ≥4) | PASS | clientFilesFolders.ts:48-50, traced below |
| 2 | Phone selected via Drizzle (no raw SQL), null-safe return | PASS | pgClientMediaFolders.ts:84-103; schema col confirmed |
| 3 | `resolvePatientDisplayNameAndPhone` called and phone passed to fallback | PASS | pgClientMediaFolders.ts:132-134 |
| 4 | Phone affects only the collision-fallback path, never primary insert | PASS | pgClientMediaFolders.ts:133-153 |
| 5 | Deprecated shim passes `null` for legacy compat | PASS | clientFilesFolders.ts:56-58 |
| 6 | Tests run and cover the meaningful branches | PASS | 21/21 PASS; test cases :42-72 |
| 7 | No new `any` / type assertion / raw SQL introduced | PASS | reviewed full diff of both source files |

### Detail

**Clause 1 — last4 extraction (clientFilesFolders.ts:48-50)**
```ts
const last4Raw = phoneNormalized ? phoneNormalized.replace(/\D/g, "").slice(-4) : null;
const last4 = last4Raw && last4Raw.length === 4 ? last4Raw : null;
const suffix = last4 ?? patientUserId.slice(0, 8);
```
Branch trace (each evaluated by hand):
- `null` → ternary false → `last4Raw = null` → `last4 = null` → suffix = uuid8. ✓
- `""` (empty) → falsy → `last4Raw = null` → uuid8. ✓ (guards the DB null-string case)
- `"+799"` → `replace(/\D/g,"")` = `"799"` → `slice(-4)` on a 3-char string returns the whole `"799"` (JS slice does not pad) → `length===4` false → uuid8. ✓
- `"abc"` → strip = `""` → `slice(-4)` = `""` → `length===4` false → uuid8. ✓
- `"1234"` (exactly 4) → strip = `"1234"` → length 4 → uses `"1234"`. ✓ (boundary correct; only covered by manual trace — see observation O1)
- `"+79991234567"` → strip = `"79991234567"` → `slice(-4)` = `"4567"` → length 4 → uses `"4567"`. ✓
- Mixed separators `"+7 (999) 123-45-67"` → strip = `"79991234567"` → `"4567"`. ✓ (regex strips all non-digits before slicing — robust to formatting)

The `length===4` guard is the critical correctness point: `slice(-4)` never throws and never pads, so a phone yielding 0–3 digits would otherwise produce a weak 0–3 char suffix. The guard forces uuid8 in exactly those cases. Logic is sound across every input class.

**Clause 2 — phone DB query (pgClientMediaFolders.ts:84-103)**
`resolvePatientDisplayNameAndPhone` uses Drizzle `.select({... phoneNormalized: platformUsers.phoneNormalized})` — column object form, no `sql\`\`` template. Verified the column exists: `apps/webapp/db/schema/schema.ts:52` → `phoneNormalized: text("phone_normalized")` (nullable; also has a unique constraint at schema.ts:103). Return type is explicitly annotated `{ displayName: string; phoneNormalized: string | null }`. Null-safety: the no-row branch returns `phoneNormalized: null` (line 99); the row branch coalesces with `row.phoneNormalized ?? null` (line 102). Both paths type-safe. ✓

**Clause 3/4 — wiring + scope (pgClientMediaFolders.ts:122-167)**
`pgEnsureClientPatientFolder` calls `resolvePatientDisplayNameAndPhone(patientUserId)` (line 132), destructures `{ displayName, phoneNormalized }`. `primaryName = clientPatientFolderBaseName(displayName)` (line 133, no phone). `fallbackName = clientPatientFolderFallbackName(displayName, patientUserId, phoneNormalized)` (line 134). The primary insert (lines 137-141) uses **`primaryName`**; the fallback insert (lines 149-153) uses **`fallbackName`** and is only reached after a `23505` unique-violation on the primary (lines 142-145) AND guarded by `primaryName !== fallbackName` (line 147). So the phone-derived suffix surfaces strictly on real name collisions. ✓ This matches Rule 2's intent (dedup only on collision).

**Clause 5 — deprecated shim (clientFilesFolders.ts:56-58)**
`formatClientPatientFolderName(displayName, patientUserId)` → `clientPatientFolderFallbackName(displayName, patientUserId, null)`. Passing `null` reproduces the pre-ST-02 uuid8 behaviour. Grep confirms this shim has **zero call sites** in `apps/webapp/src` (only its own definition) — it is dead code, harmless, retained for API compat. ✓

**Clause 6 — tests (clientFilesFolders.test.ts:42-72)**
Cases: collision fallback with `null` → `· abcd1234` (:42-46); ≥4 digits → `· 4567` (:49-53); null → uuid8 (:55-59); <4 digits → uuid8 (:61-65); no digits → uuid8 (:67-71). The three uuid8-fallback triggers and the happy last4 path are all locked. Ran: PASS.

**Clause 7 — type/SQL hygiene**
Reviewed the full source diff of both ST-02 files. No `any`, no `as`-assertions beyond the pre-existing `row.kind as MediaFolderRecord["kind"]` in `mapFolderRow` (unrelated to this change). The phone path is pure Drizzle column selection. ✓

## ST-03 — mockMediaStorage regression guard

| # | Clause | Result | How verified |
|---|---|---|---|
| 8 | Mock `list()` filter mirrors production semantics | PASS (with fidelity note F1) | mockMediaStorage.ts:66-69 vs s3MediaStorage.ts:259-261 |
| 9 | `seedFolderForTest` is test-only, no prod call site | PASS | grep across `apps/webapp/src` |
| 10 | Tests lock Rule 3 (root-hide / patient-hide / scope-bypass / flag-override / count) | PASS | mockMediaStorage.test.ts:21-90 |
| 11 | Module-level Map sharing — no test-isolation defect | PASS (with note O2) | tag + query isolation analysed |
| 12 | Scope: only the expected files changed | PASS | git diff of commit 92404aa9 |

### Detail

**Clause 8 — filter fidelity vs production (the real comparison)**
The production storage adapter is **`s3MediaStorage.ts`**, not `pgClientMediaFolders.ts`. Its filter (s3MediaStorage.ts:244-261):
```sql
if (params.folderId !== undefined) { ... }          -- explicit scope wins
else if (params.excludeClientFiles !== false) {
  whereParts.push(sql`(m.folder_id IS NULL OR m.folder_id NOT IN ${clientFilesSubtreeFolderIdsSql()})`);
}
```
where `clientFilesSubtreeFolderIdsSql()` (pgClientMediaFolders.ts:170-178) is a **recursive** walk from `kind='client_files_root'` down every `parent_id`.

The mock (mockMediaStorage.ts:66-69):
```ts
if (params.excludeClientFiles !== false && params.folderId === undefined) {
  const folder = item.folderId ? folders.get(item.folderId) : null;
  if (folder?.kind === "client_files_root" || folder?.kind === "client_patient") return false;
}
```

Both agree on the structural contract:
- Gate is identical: hide only when `excludeClientFiles !== false` AND no explicit `folderId` (S3 uses `else if` to the `folderId !== undefined` block; mock uses `folderId === undefined`). ✓
- Files with `folderId == null` are never hidden: S3 keeps them via `folder_id IS NULL`; mock's `item.folderId ? … : null` yields `folder = null`, kind check fails. ✓
- For the real data shape (root `client_files_root` → children `client_patient`), every hidden file's folder has kind `client_files_root`/`client_patient`, exactly the mock's predicate. ✓

**Fidelity note F1 (non-blocking):** the two use *different mechanisms* — S3 hides by **recursive subtree membership**, the mock by **folder `kind`**. They diverge only for a folder shape that does not occur in production: a `standard`-kind (or otherwise non-system) folder nested *under* the client-files root. S3 would hide such a folder's files (it's in the subtree); the mock would not (kind ≠ system). Patient folders are always created with `kind: "client_patient"` (pgClientMediaFolders.ts:114) directly under the root, and `pgValidateManualFolderParent` (lines 232-240) blocks users from nesting standard folders under a system-managed parent. So the divergent shape is unreachable by design and the regression guard is faithful for all real inputs. Worth a one-line code comment but not a defect.

**Clause 9 — seedFolderForTest safety (mockMediaStorage.ts:234-249)**
Named export, doc-commented `TEST ONLY … Never call this in production code`. Grep across `apps/webapp/src`: the only importer is `mockMediaStorage.test.ts:12`. No production call site. It writes into the same module-level `folders` Map that `list()` reads, which is precisely what is needed to seed a `kind`-bearing folder (the public `createFolder` deliberately omits `kind` — mockMediaStorage.ts:184-195 — so users cannot mint system folders). The helper lives in the prod source file, but `mockMediaStoragePort` is the dev/test storage adapter (real path is S3), so there is no production-bundle exposure for the live system. ✓

**Clause 10 — tests lock the right behaviour (mockMediaStorage.test.ts:21-90)**
- (a) :22-35 — default list (folderId omitted) hides a file under a `client_files_root` folder, shows the root-level library file. ✓
- (b) :37-50 — default list hides a file in a `client_patient` subfolder. ✓ (covers the second kind)
- (c) :52-63 — explicit `folderId: patientFolder.id` shows the patient file (scope bypass). ✓
- (d) :65-75 — `excludeClientFiles: false` (no scope) shows the patient file (flag override). ✓
- (e) :77-89 — `total` = 0 when hidden, 2 with override. ✓ (verifies the count, not just the page slice)
These assert hide / hide-second-kind / scope-override / flag-override / total-correctness — the full truth table of Rule 3. They are testing the right thing.

**Clause 11 — module-state isolation (note O2, non-blocking)**
`store` and `folders` are module-level singletons (mockMediaStorage.ts:14-15) shared by every test in the run; `seedFolderForTest` and `upload` accumulate, never reset. Isolation is achieved by a unique `Date.now()` filename tag per test plus `query: tag` filtering in every assertion, so accumulated rows from other tests are filtered out. This is sound for the count assertions in (e) because the query tag is unique. Theoretical fragility: two tests created in the same millisecond could collide tags — but each `Date.now()` is suffixed to a distinct per-test literal (`pfi-st03-a-`, `-b-`, …), so even same-ms runs stay disjoint. No real isolation defect. `seedFolderForTest` is idempotent enough — each call mints a fresh `folder-seed-${folderCounter++}` id, so repeated calls never clobber.

**Clause 12 — scope (git show 92404aa9 / a0f9de97)**
ST-03 commit touches only `mockMediaStorage.ts` (+`seedFolderForTest`) and the new `mockMediaStorage.test.ts`; `list()` runtime behaviour was unchanged (the filter pre-existed) — the commit is additive (test helper + tests). ST-02 commit touches `clientFilesFolders.ts`, `clientFilesFolders.test.ts`, `pgClientMediaFolders.ts`. Five files total, matching the expected set. No collateral changes.

## Observations (non-blocking)
- **O1** — No explicit test for a phone yielding *exactly* 4 digits (e.g. `"1234"`). Implementation is correct by trace (uses last4). A boundary test would document the inclusive edge. Advisory only.
- **O2** — Module-level `store`/`folders` Maps are never reset between tests; isolation relies on per-test tags. Standard for this mock and currently correct; if future tests assert global totals without a tag they would break. Advisory.
- **F1** — Mock hides by folder `kind`, production (S3) by recursive subtree membership. Equivalent for all reachable folder shapes; diverges only for a structurally-impossible nested standard folder. A clarifying comment on the mock filter would help future maintainers.
- `formatClientPatientFolderName` is now dead code (no call sites). Retained as a deprecated compat shim; harmless.

## Verdict
- **ST-02: CLEAN** (0 issues; observation O1 advisory)
- **ST-03: CLEAN** (0 issues; observations O2, F1 advisory)

Both items independently re-traced from source, tests executed (21/21 PASS). No bugs found.
