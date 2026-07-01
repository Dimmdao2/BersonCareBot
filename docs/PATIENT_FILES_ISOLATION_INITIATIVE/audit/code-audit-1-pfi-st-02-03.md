# Code Audit 1 — PFI-ST-02 + PFI-ST-03 (joint batch)
Auditor: code-auditor-1-pfi-st-02-03 (Sonnet, independent)
Date: 2026-06-19

## ST-02 finding summary

| Check | Result | Notes |
|---|---|---|
| ST-02-C1: Last4 logic — 10-digit phone → last4 | PASS | `replace(/\D/g,"").slice(-4)` then length===4 guard; "+79991234567" → "4567" |
| ST-02-C2: Last4 logic — null → uuid8 | PASS | null phoneNormalized short-circuits to uuid8 |
| ST-02-C3: Last4 logic — <4 digits after strip → uuid8 | PASS | "+799" strips to "799" (3 chars), length check fails → uuid8 |
| ST-02-C4: Last4 logic — no digits → uuid8 | PASS | "abc" strips to "" (0 chars), length check fails → uuid8 |
| ST-02-C5: Last4 logic — exactly 4 digits → last4 | PASS | "1234" strips to "1234", length===4 → uses last4 |
| ST-02-C6: Phone query uses Drizzle, not raw SQL | PASS | `platformUsers.phoneNormalized` column used in Drizzle `.select()` in `resolvePatientDisplayNameAndPhone` |
| ST-02-C7: phoneNormalized column exists in schema | PASS | `platformUsers.phoneNormalized: text("phone_normalized")` at schema.ts:52 |
| ST-02-C8: Return type updated correctly | PASS | Returns `{ displayName: string; phoneNormalized: string | null }` |
| ST-02-C9: phoneNormalized passed to fallback | PASS | `clientPatientFolderFallbackName(displayName, patientUserId, phoneNormalized)` at pgClientMediaFolders.ts:134 |
| ST-02-C10: Only on 23505 collision path | PASS | `fallbackName` is computed upfront but only used inside the second `catch` block; primary path uses `primaryName` |
| ST-02-C11: Deprecated shim updated | PASS | `formatClientPatientFolderName` updated to pass `null` as phoneNormalized |
| ST-02-C12: Test adequacy — 4 new test cases | PASS | phone≥4digits, null, <4digits, no-digits covered |
| ST-02-C13: Missing edge case — exactly 4 digits | NOTE | Test for exactly 4 digits boundary not explicitly written (e.g. "1234" or "+1234"). Implementation is correct per manual trace, but a test for exactly 4 could add clarity. Non-blocking. |
| ST-02-C14: TypeScript clean | PASS | `npx tsc --noEmit` exits 0 with no errors |

## ST-03 finding summary

| Check | Result | Notes |
|---|---|---|
| ST-03-C1: `list()` filter correct for client_files_root | PASS | Lines 66-69 of mockMediaStorage.ts: excludes when `excludeClientFiles !== false && folderId === undefined` and folder kind matches |
| ST-03-C2: `list()` filter correct for client_patient | PASS | Same condition covers both kinds |
| ST-03-C3: folderId=null does not trigger excludeClientFiles hide | PASS | Condition requires `params.folderId === undefined`; explicit `null` bypasses filter (correct — null = root-only scope) |
| ST-03-C4: seedFolderForTest safety | PASS | Only exported from mockMediaStorage.ts; not imported in any non-test file; doc comment warns "TEST ONLY — Never call this in production code" |
| ST-03-C5: seedFolderForTest bypasses invariants | NOTE | `seedFolderForTest` writes directly to module-level `folders` Map, bypassing `createFolder`. The mock is dev/test-only so this is acceptable. No prod risk. |
| ST-03-C6: Test (a) — default list hides client_files_root files | PASS | Test `pfi-st03-a` asserts lib file visible, client root file hidden |
| ST-03-C7: Test (b) — default list hides client_patient files | PASS | Test `pfi-st03-b` asserts lib file visible, patient subfolder file hidden |
| ST-03-C8: Test (c) — explicit folderId exposes patient files | PASS | Test `pfi-st03-c` scopes to `patientFolder.id` and asserts file visible |
| ST-03-C9: Test (d) — excludeClientFiles:false without scope exposes patient files | PASS | Test `pfi-st03-d` passes `excludeClientFiles: false` and asserts file visible |
| ST-03-C10: Test (e) — total count correct | PASS | Test `pfi-st03-e` verifies `hidden.total === 0` and `visible.total === 2` |
| ST-03-C11: Tests pass | PASS | All 41 tests pass including 5 new ST-03 tests |
| ST-03-C12: Scope — only listed files changed | PASS | Diff only touches: clientFilesFolders.ts, pgClientMediaFolders.ts, clientFilesFolders.test.ts, mockMediaStorage.ts (+seedFolderForTest), mockMediaStorage.test.ts (new file) |

## Detail

### ST-02 Detail

**Last4 logic** (`clientFilesFolders.ts:48-50`):
```
const last4Raw = phoneNormalized ? phoneNormalized.replace(/\D/g, "").slice(-4) : null;
const last4 = last4Raw && last4Raw.length === 4 ? last4Raw : null;
const suffix = last4 ?? patientUserId.slice(0, 8);
```
- Empty string `""`: falsy, `last4Raw = null` → uuid8. Correct.
- `"+799"`: truthy, `replace(/\D/g,"")` = `"799"`, `.slice(-4)` = `"799"` (3 chars), `length === 4` fails → uuid8. Correct.
- `"abc"`: truthy, `replace(/\D/g,"")` = `""` (0 chars), `length === 4` fails → uuid8. Correct.
- `"+79991234567"`: strips to `"79991234567"`, `.slice(-4)` = `"4567"`, length 4 → uses `"4567"`. Correct.
- Note: `.slice(-4)` on a string shorter than 4 characters returns the full string without error; the `length === 4` guard handles all short-digit cases correctly.

**Missing boundary test (non-blocking)**: No explicit test for a phone with exactly 4 digits (e.g., `"1234"` or `"+1234"`). The implementation handles it correctly (strips to `"1234"`, length 4 → uses last4), but a test would document the exact boundary. This is advisory only.

**Phone query** (`pgClientMediaFolders.ts:84-103`):
- Function renamed from `resolvePatientDisplayName` to `resolvePatientDisplayNameAndPhone`.
- Adds `phoneNormalized: platformUsers.phoneNormalized` to Drizzle `.select()`.
- Return type `{ displayName: string; phoneNormalized: string | null }` with `row.phoneNormalized ?? null` for null-safety.
- No raw SQL; uses Drizzle ORM throughout.

**Pass-through** (`pgClientMediaFolders.ts:129-134`):
- `fallbackName` is computed eagerly before the try/catch block (line 134), but this is inconsequential — `phoneNormalized` is already fetched. The fallback name is only *used* in the second `catch` block (23505 collision), not the primary path. Correct.

**Deprecated shim** (`clientFilesFolders.ts:56-58`):
- `formatClientPatientFolderName` now passes `null` as the third argument, preserving legacy uuid8 behavior. Correct.

### ST-03 Detail

**Filter logic** (`mockMediaStorage.ts:66-69`):
```js
if (params.excludeClientFiles !== false && params.folderId === undefined) {
  const folder = item.folderId ? folders.get(item.folderId) : null;
  if (folder?.kind === "client_files_root" || folder?.kind === "client_patient") return false;
}
```
- Default `excludeClientFiles` (undefined) is treated as true via `!== false`. Correct.
- Only applies when `folderId === undefined` (omitted), not when `folderId === null` (explicit root scope) or a string. This is correct behavior.
- Items with no folder (`folderId = null`) are never hidden (their folder lookup returns `null`, kind check doesn't match). Correct.

**seedFolderForTest** (`mockMediaStorage.ts:239-249`):
- Exported named export from mockMediaStorage.ts, currently only imported in mockMediaStorage.test.ts.
- Bypasses `createFolder` but that is appropriate: `createFolder` doesn't accept a `kind` parameter (by design — users can't create system-kind folders). The helper exists precisely to inject test fixtures with system kinds.
- No production code imports it. The `folders` Map is module-level and shared across all tests; tests isolate via unique `Date.now()` tags in filenames + `query:` parameter — a sound approach given module state isn't reset between tests.

**Test isolation note**: The `store` and `folders` Maps are module-level singletons. Tests share state. The tag-based isolation strategy (`Date.now()` suffix + query filter) works correctly but relies on tests not running in the same millisecond. This is standard vitest practice and acceptable.

## ST-02 Verdict: PASS

## ST-03 Verdict: PASS
