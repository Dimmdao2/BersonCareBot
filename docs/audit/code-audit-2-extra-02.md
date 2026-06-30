# Code Audit 2 (Opus Final Gate) — EXTRA-02
- Branch: auto/extra-02 @ 887da533
- Auditor: Opus, READ-ONLY
- Date: 2026-06-19

## Verdict: PASS

- **O1 — PASS** — The old `Promise.all([listConversations, listClients({})])` was a *parallelism optimization only*; the two queries are independent and share no transaction or correctness dependency. The new sequential flow is strictly *more* correct: `listClients` now requires the conversation result (patient userIds) as input, so it cannot run before conversations are fetched. No correctness property is sacrificed — the only cost is one extra round-trip latency on non-empty lists, which is dwarfed by the full-table-scan that was eliminated. On empty lists the route is now *faster* (zero `listClients` calls). The old parallel approach was not unsafe per se; it was simply inefficient.

- **O2 — PASS** — Dedup is handled twice, defensively. Route-side: `Array.from(new Set(list.flatMap(...)))` collapses duplicate userIds before the repo ever sees them. Repo-side: even if duplicates leaked through, `pu.id = ANY($1::uuid[])` is a set-membership predicate (equivalent to `IN`), not a join — a value appearing twice in the array matches the same row exactly once, so no row duplication occurs. Both layers are safe.

- **O3 — PASS (not a real risk)** — `inMemoryDoctorClientsPort` indeed ignores `filters.userIds` (lines 28–60 implement search/hasTelegram/supportStatus/etc. but no userIds branch). However: (1) the conversations route test mocks `buildAppDeps` entirely, so the stub is never invoked there; (2) the only stub test, `inMemoryDoctorClients.supportFilter.test.ts`, contains no `userIds` references; (3) `buildAppDeps.ts:417` selects the stub only when `inMemoryRepos` is true (dev), and production uses `createPgDoctorClientsPort()`. No test relies on the stub for userIds scoping, so no false-positive is possible today. The gap is a latent stub-fidelity issue, not a production or test-correctness risk. Recommend (non-blocking) adding the filter to the stub for future-proofing.

- **O4 — PASS** — `appendSqlExcludeUserIds` (analyticsAudience.ts:166) computes `paramIndex = params.length + 1`. When `userIds` is provided, `userIdsParams` already holds 1 element (`[filters.userIds]`) so the excluded-users clause correctly binds to `$2`. When `userIds` is absent, `userIdsParams` is empty (length 0) so it binds to `$1`. The userIds clause itself is hardcoded `$1::uuid[]`, consistent with it being pushed first. No off-by-one.

- **O5 — PASS** — `userIds?: string[]` is correctly optional on `DoctorClientsFilters`. Callers omitting it pass `undefined`; the repo guards with `filters.userIds !== undefined && ...` before both the short-circuit and the clause-append, so `undefined` cleanly falls through to unrestricted behaviour. No type-narrowing issues; audit-1 confirmed `tsc --noEmit` exits 0 on the branch.

- **O6 — PASS** — `beforeEach` (route.test.ts:39–44) now calls `listClientsMock.mockReset()` followed by `mockResolvedValue([])`, restoring the default after reset. This isolates the "scoped userIds" test (asserts `toHaveBeenCalledTimes(1)`) and the "skips when empty" test (asserts `not.toHaveBeenCalled()`) from each other and from the onSupport tests that set custom resolved values. All 4 EXTRA-02-relevant tests (2 in route.test.ts, 2 in pgDoctorClients.repo.test.ts) are mutually isolated by inspection.

- **O7 — PASS** — All 14 other `listClients(` call sites (loadDoctorTodayDashboard, comments loaders, clients/search, patients route, exercise-comments, doctor-clients service, broadcastAudienceMetrics ×9) omit `userIds`. They therefore receive `undefined`, skipping both the short-circuit and the `ANY(...)` clause → behaviour byte-for-byte unchanged. No regression.

- **O8 — PASS (right fix)** — This is the correct minimal fix: it removes the per-poll full `platform_users` scan while preserving the existing data model and all other callers. The alternative of denormalizing the patient userId onto the conversation record would still require joining/looking up firstName/lastName/isOnSupport for display, so it would not eliminate the `listClients` lookup — it would only save the cheap `parsePlatformUserIdFromWebappConversationId` parse, at the cost of a schema migration, a backfill, and a write-path invariant to keep in sync. The conversation-id-encodes-userid convention already in place (`webapp:platform:<uid>`) makes the parse free. Bounding the lookup to ≤50 ids via `ANY(uuid[])` is the proportionate, lowest-risk solution. No better approach warranted.

## Defects (if any)

None blocking. One non-blocking observation: `inMemoryDoctorClientsPort.listClients` does not implement the `userIds` filter (see O3). Low risk; recommend adding for stub fidelity but not required for this fix.

## Overall: PASS — the sequential, userIds-scoped fix is correct, type-safe, well-tested, regression-free, and architecturally the right minimal solution.
