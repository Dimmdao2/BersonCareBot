# Code Audit 2 — PFI-ST-02 + PFI-ST-03 (Chief/Opus)
Auditor: code-auditor-2-pfi-st-02-03 (Opus, independent)
Date: 2026-06-19

Branch: `auto/pfi-st-03` — commits a0f9de97 (ST-02) + 92404aa9 (ST-03), above feat base 109c3c16.
Tests: ran both target files locally — **21/21 PASS** (`vitest --run`).

## ST-02 summary
| Check | Result | Notes |
|---|---|---|
| 1. Last4 correctness | PASS | `replace(/\D/g,"").slice(-4)` + `length===4` guard handles all boundaries (clientFilesFolders.ts:48-49). |
| 2. Phone DB query | PASS | Drizzle select of `platformUsers.phoneNormalized`; return type `{ displayName; phoneNormalized: string \| null }` (pgClientMediaFolders.ts:84-103). |
| 3. Pass-through scope | PASS | Phone flows only into `fallbackName`; `primaryName` (the primary insert) never uses it (pgClientMediaFolders.ts:133-141). |
| 4. No raw SQL | PASS | Phone selection uses Drizzle ORM `.select({...})`, no `sql\`\`` template. |
| 5. Test coverage | PASS | 4 boundary cases: ≥4 digits, null, <4 digits, no-digits (clientFilesFolders.test.ts:48-72). |

## ST-03 summary
| Check | Result | Notes |
|---|---|---|
| 6. Filter semantics | PASS | Hide applies only when `excludeClientFiles !== false` AND `folderId === undefined` (mockMediaStorage.ts:66-69). Explicit folder bypasses. |
| 7. seedFolderForTest safety | PASS | Exported test-only helper; no production call sites (only the test file imports it). |
| 8. Test correctness | PASS | 5 tests: root-hide, patient-hide, explicit-scope-show, override-show, count 0 vs 2 (mockMediaStorage.test.ts:21-90). |
| 9. Scope | PASS | Exactly 5 files changed across the two commits — matches the expected set. |

## Detail

### ST-02

**Check 1 — Last4 correctness (clientFilesFolders.ts:48-50)**
```
const last4Raw = phoneNormalized ? phoneNormalized.replace(/\D/g, "").slice(-4) : null;
const last4 = last4Raw && last4Raw.length === 4 ? last4Raw : null;
const suffix = last4 ?? patientUserId.slice(0, 8);
```
Boundary analysis:
- `"+79991234567"` → digits `79991234567` → slice(-4) = `4567`, length 4 → used. (test :49-53 ✓)
- `null` phone → `last4Raw = null` → uuid8. (test :55-59 ✓)
- `"+799"` → digits `799` → slice(-4) = `799`, length 3 → guard rejects → uuid8. (test :61-65 ✓)
- `"abc"` → digits `""` → slice(-4) = `""`, length 0 → uuid8. (test :67-71 ✓)
- Edge not tested but correct: exactly 4 digits `"1234"` → `1234` used; non-digit separators inside (`"12-34"`) → stripped to `1234`. The `length===4` guard correctly forces uuid8 fallback for any phone yielding <4 digits, avoiding weak 1–3 digit suffixes. Sound.

**Check 2 — Phone DB query (pgClientMediaFolders.ts:84-103)**
Drizzle `.select({...phoneNormalized: platformUsers.phoneNormalized})`. Verified `platformUsers.phoneNormalized` exists in schema (apps/webapp/db/schema/schema.ts:52, `text("phone_normalized")`, nullable). Return normalizes with `row.phoneNormalized ?? null` and the no-row branch returns `phoneNormalized: null` (line 99). Return type explicitly annotated `string | null`. Correct.

**Check 3 — Pass-through (pgClientMediaFolders.ts:131-145)**
`primaryName = clientPatientFolderBaseName(displayName)` — no phone. The primary insert (line 137-141) uses `primaryName`. Phone is consumed only by `fallbackName` (line 134), which is used solely in the 23505-collision branch (line 147-153). Exactly as specified — phone never affects the primary-name insert.

**Check 4 — No raw SQL**
The new phone selection is pure Drizzle ORM column selection. No `sql\`...\`` added by this change. (Pre-existing `sql` usage in the file is unrelated, in `promoteLegacy...`/subtree helpers.)

**Check 5 — Test coverage (clientFilesFolders.test.ts:48-72)**
4 cases cover the meaningful branches: valid ≥4-digit phone (last4 path), null, sub-4-digit, zero-digit (all three uuid8 fallback triggers). The existing `formatClientPatientFolderName` deprecated wrapper now passes `null` (clientFilesFolders.ts:57) and remains covered by the prior `· abcd1234` test (:42-46). Good coverage.

### ST-03

**Check 6 — Filter semantics (mockMediaStorage.ts:66-69)**
```
if (params.excludeClientFiles !== false && params.folderId === undefined) {
  const folder = item.folderId ? folders.get(item.folderId) : null;
  if (folder?.kind === "client_files_root" || folder?.kind === "client_patient") return false;
}
```
The hide branch fires only when (a) caller did not opt out (`!== false`, so default `undefined` → hide) and (b) `folderId === undefined` (no explicit scope). When an explicit `folderId` (incl. `null` for root-only) is passed, the guard is skipped and the separate folder-scope block (lines 70-89) governs visibility. Matches `MediaListParams.excludeClientFiles` doc (types.ts:88-92): "Defaults to true". Semantics correct and consistent with the documented contract.

**Check 7 — seedFolderForTest safety (mockMediaStorage.ts:234-249)**
Exported helper, clearly marked `TEST ONLY ... Never call this in production code`. Grep/import check: only `mockMediaStorage.test.ts:12` imports it. No production call site. It writes into the same module-level `folders` Map used by `list()`, which is exactly what the regression guard needs. Safe — it is in the prod source file (mockMediaStorage.ts) but the mock itself is the dev/test storage adapter, so no prod-bundle concern for the real S3 path.

**Check 8 — Test correctness (mockMediaStorage.test.ts:21-90)**
- (a) root-folder file hidden, library file shown — default list (:22-35).
- (b) client_patient subfolder file hidden (:37-50).
- (c) explicit `folderId` scope shows the patient file — override-by-scope (:52-63).
- (d) `excludeClientFiles:false` shows patient file without scope (:65-75).
- (e) `total` reflects rule: 0 hidden vs 2 with override (:77-89).
Covers hide / show / scope-override / flag-override / count. Cross-test state pollution is mitigated by unique `Date.now()` filename tags + `query:` filtering — sound given the module-level Maps. Note: `seedFolderForTest` accumulates folders across tests, but that is harmless since assertions filter by per-test tag.

**Check 9 — Scope (git diff 109c3c16..92404aa9)**
Exactly 5 files: pgClientMediaFolders.ts, clientFilesFolders.ts, clientFilesFolders.test.ts (ST-02); mockMediaStorage.ts, mockMediaStorage.test.ts (ST-03). No collateral changes. ST-03 commit (92404aa9) is purely additive test + test-only helper (107 insertions, 0 source-behavior change to `list()`).

## Minor observations (non-blocking)
- ST-03 commit message and the test header comment reference the filter "already implements the filter" — accurate; `list()` behavior was unchanged, only the `seedFolderForTest` export was added to enable the guard. No production-logic risk.
- `seedFolderForTest` lives in the production source file rather than a `__test__` helper; acceptable because this is the mock adapter and it is dead code on the real S3 path, but a future cleanup could move it. Not a defect.

## ST-02 Verdict: PASS
## ST-03 Verdict: PASS
