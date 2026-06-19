# Code Audit 4 — QW-E10/batch1 (spot-check)
agentId: audit4-qw-e10-batch1
Commit: 657c373ba11b482fbbcb33b0f7b958a90966db58
Date: 2026-06-19
Focus: 4 previously-failing components (A1 fix2 verification)

## MergeCandidates — PASS
- Imports `apiJson` from `@/shared/lib/apiJson` (line 8)
- Zero raw `fetch` / `res.ok` patterns
- All catch blocks call `setError` (lines 27-32, 49-50)

## PatientPackages — PASS
- Imports `apiJson` from `@/shared/lib/apiJson` (line 8)
- Zero raw `fetch` / `res.ok` patterns
- Silent catch at line 78 is intentional non-critical reference load (services/packages catalog for selects); comment confirms it. All user-triggered mutations (addItem/deleteItem/assignPackage) call `setError` in their catch blocks (lines 110-111, 139-140, 170-171)

## PublicWidget — PASS
- Imports `apiJson` from `@/shared/lib/apiJson` (line 9)
- Zero raw `fetch` / `res.ok` patterns in this component
- Silent catch at line 57: non-critical overview load for branch/service selects (comment confirms). Silent catch at line 136: clipboard copy failure (acceptable to ignore). User-triggered saves all propagate errors

## ScheduleBlocks.removeBlock — PASS
- Imports `apiJson` from `@/shared/lib/apiJson` (line 17)
- `removeBlock()` at line 172 uses `apiJson(BASE + "?id=...", { method: "DELETE" })` (line 175)
- Wrapped in try/catch that calls `setError(e instanceof Error ? e.message : "delete_failed")` (lines 176-177)
- Silent catch at line 110 is a non-critical specialist catalog pre-load for selects; user-facing load (lines 127-129) does call `setError`

## bookingSoloAdminApi — no dup — PASS
- Imports and re-exports `apiJson` from `@/shared/lib/apiJson` (lines 1-2); does NOT define its own `apiJson` function
- NOTE (pre-existing, out of fix2 scope): `fetchSoloOverview()` (line 48) uses a raw `fetch` with manual `res.ok` check. This function is in the shared API helper, predates fix2, and has specific error-handling logic (returns `null` on `booking_engine_unavailable` rather than throwing). This was not a fix2 target and is outside the 4-file audit scope.

## apiJson.ts — helper correct — PASS
- Located at `apps/webapp/src/shared/lib/apiJson.ts`
- Throws on HTTP error (`!res.ok`) or business error (`body.ok === false`), surfacing `body.message ?? body.error ?? "http_${status}"`
- Callers wrap in try/catch and route to toast or `setError` — pattern is clean

## tsc — PASS
- `npx tsc --noEmit` produced zero errors matching any of the 4 focus files

## Overall: PASS
