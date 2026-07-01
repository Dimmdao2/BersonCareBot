# Code Audit 1 — EXTRA-02

**Branch**: `auto/extra-02`
**Commits**: `ea35f816` (fix) + `eadabcce` (test mock isolation)
**Auditor**: Claude Sonnet 4.6 (read-only)
**Date**: 2026-06-19

## Scope

Five changed files: `ports.ts`, `pgDoctorClients.ts`, `conversations/route.ts`, `route.test.ts`, `pgDoctorClients.repo.test.ts`.

---

## Findings

**E1 — PASS** — `DoctorClientsFilters.userIds?: string[]` is declared in ports.ts and consumed identically in `pgDoctorClients.ts`; no other `listClients` caller passes `userIds`, so they all receive `undefined` → unchanged behaviour.

**E2 — PASS** — `pgDoctorClients.ts:95` returns `[]` immediately when `filters.userIds !== undefined && filters.userIds.length === 0`; no `runWebappPgText` call is issued (confirmed by repo test `expect(runWebappPgTextMock).not.toHaveBeenCalled()`).

**E3 — PASS** — `filters.userIds` is pushed as a single element into `userIdsParams` (`userIdsParams.push(filters.userIds)`), then passed as the parameter array to `runWebappPgText`; the SQL literal is `$1::uuid[]`. No string interpolation of user data occurs.

**E4 — PASS** — `appendSqlExcludeUserIds` uses `params.length + 1` to derive the next parameter index. When `userIds` is provided, `userIdsParams = [filters.userIds]` (length 1), so `appendSqlExcludeUserIds` assigns `$2::uuid[]` for the excluded-user-ids clause — correctly offset by 1. When `userIds` is absent, `userIdsParams = []` (length 0), so excluded users get `$1::uuid[]` as before.

**E5 — PASS** — The route uses `list.flatMap((c) => { const uid = parsePlatformUserIdFromWebappConversationId(c.integratorConversationId); return uid ? [uid] : []; })`, explicitly filtering out nulls. Non-webapp conversations (where `parsePlatformUserIdFromWebappConversationId` returns null) are excluded from `patientUserIds`. Additionally `patientUserIds.length > 0` guards the `listClients` call; when empty, `scopedClients = []` without any DB call. At response-mapping time, conversations whose `integratorConversationId` parses to null produce `clientInfo = null`, and the output fields fall back to `null`/`false` — consistent with prior behaviour.

**E6 — PASS** — Four new tests cover all required cases:
  - (a) `route.test.ts`: scoped call asserts `listClientsMock` called once with `{ userIds: [p1, p2] }`.
  - (b) `route.test.ts`: empty list asserts `listClientsMock` not called at all.
  - (c) `pgDoctorClients.repo.test.ts`: `{ userIds: [] }` returns `[]` and `runWebappPgTextMock` not called.
  - (d) `pgDoctorClients.repo.test.ts`: `{ userIds: ["uid-1","uid-2"] }` results in SQL containing `"ANY"` and `"uuid[]"`, and params containing both ids.

**E7 — PASS** — `npx tsc --noEmit` exits 0 with no output on branch `auto/extra-02`.

**E8 — PASS** — The only new raw SQL added is `AND pu.id = ANY($1::uuid[])` with the array fully parameterised. No other raw SQL was introduced.

---

## Notes

- `inMemoryDoctorClients` (stub/dev port) does not implement `userIds` filtering — it silently ignores the field and returns unfiltered stubs. This is acceptable: the in-memory stub is not used in the conversations route's test (which mocks `buildAppDeps`) and is not a production path. However, if the stub were ever used in a test that relies on `userIds` scoping it would return incorrect results. Low risk; no production impact.

---

## Overall: PASS — all 8 clauses pass; fix is correct, safe, and well-tested.
