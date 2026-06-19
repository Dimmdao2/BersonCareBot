# Code Audit 1 — PFI-ST-08 (Sonnet, independent)
date: 2026-06-19T12:30:00Z
branch: auto/pfi-st-08 @ a5e11023 vs feat @ 258500e6

## Checklist

### Clause 1: pgEnsureClientPatientFolder re-exported from app-layer barrel
verdict: PASS
how-verified: `apps/webapp/src/app-layer/media/clientMediaFolders.ts` line 4 — `pgEnsureClientPatientFolder` is listed in the named re-export block sourcing from `@/infra/repos/pgClientMediaFolders`. The file is a 9-line pure re-export barrel. No logic, no DB access.

Note: this file is pre-existing (it was not added by commit a5e11023 — the diff shows 0 changes to it). ST-08's DoD says "confirm the export exists" and it does. The commit adds only the test + LOG.md.

### Clause 2: Test proves correct folder shape (kind, parentId, patientUserId)
verdict: PASS
how-verified:
- Test 2 (line 76): `expect(folder.kind).toBe("client_patient")` — verifies kind field.
- Test 3 (line 81): `const root = await pgEnsureClientFilesRootFolder(); expect(folder.parentId).toBe(root.id)` — verifies parentId = root.id by calling the root helper and comparing.
- Test 4 (line 87): `expect(folder.patientUserId).toBe(PATIENT_USER_ID)` — verifies patientUserId round-trips the argument.
- Test 6 (line 98): verifies all three fields for a second distinct patientUserId, including explicit check `expect(folder.parentId).toBe(STUB_ROOT_ID)`.

The mock shape (`id`, `parentId`, `name`, `kind`, `patientUserId`, `createdAt`) matches the real `MediaFolderRecord` type at `apps/webapp/src/modules/media/types.ts` lines 62–69 exactly. The type has `kind?` and `patientUserId?` as optional; the mock supplies concrete values, which is correct for test assertions.

### Clause 3: Test idempotency verified
verdict: PASS
how-verified: Test 5 (line 92–95): calls `pgEnsureClientPatientFolder(PATIENT_USER_ID)` twice and asserts `second.id === first.id`. The mock uses a `Map<string, MediaFolderRecord>` (module-level, line 30) that stores the record on first call and returns it on subsequent calls — same semantics as the real implementation's SELECT-before-INSERT + upsert conflict handling (lines 124–129 and 143–158 of `pgClientMediaFolders.ts`). Idempotency verified.

Caveat (non-blocking): The map is module-level and persists across all `it()` calls within the describe block. This means tests 1, 2, 4 also re-use the same cached folder for `PATIENT_USER_ID`. This is intentional behavior and makes the idempotency test meaningful (the second call genuinely hits the cache, not a fresh factory call). No defect.

### Clause 4: LOG.md documents gap clearly (O3 — future task, patientUserId pattern)
verdict: PASS
how-verified: `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` (26 lines):
- Section header "O3 — Doctor individual-exercise video entry point (Rule 5)" — named gap.
- `Status: GAP documented (plan A from ESCALATIONS.md)` — honest; no false "done" claim.
- `Finding: No doctor-side route/UI … exists in the codebase as of 2026-06-19` — accurate.
- `Connection point: … must call pgEnsureClientPatientFolder(patientUserId, ...) — using the patient's userId (not the doctor's)` — the critical patientUserId-not-doctorUserId distinction is explicitly called out.
- `Future task:` block with 4 numbered steps including: authenticate doctor, resolve patientUserId from instanceId, call `pgEnsureClientPatientFolder(patientUserId)`, use `folder.id` as `folderId`. All DoD-required elements present.

### Clause 5: §6 compliance (no raw SQL, DI, no dup, test scoped to own code only)
verdict: PASS
how-verified:
- **No raw SQL**: `clientMediaFolders.ts` (app-layer barrel) contains zero SQL. The infra layer `pgClientMediaFolders.ts` (pre-existing, not modified by ST-08) uses Drizzle ORM query builder (`db.select()`, `db.insert()`) — no `pool.query(string)` or `db.execute(sql.raw(...))` calls. The `sql` template tag usages are Drizzle typed helpers for expressions, not raw string queries.
- **DI**: The app-layer barrel re-exports from infra correctly; no service directly instantiates DB connections. The infra implementation uses `getDrizzle()` — pre-existing pattern.
- **No duplication**: Single re-export barrel. No helper duplicated in test vs source.
- **Test scoped to own code**: `vi.mock("@/infra/repos/pgClientMediaFolders", ...)` stubs only the infra layer. The test imports the subject under test via `./clientMediaFolders` (app-layer). No imports of unrelated modules or page files.

### Clause 6: Doctor-side entry point gap honestly documented (O3)
verdict: PASS
how-verified: Confirmed no doctor-side individual-exercise presign route exists by checking the diff (no route.ts files changed) and the LOG.md entry. The LOG.md correctly describes the gap as future work, gives a concrete suggested route path (`/api/doctor/treatment-program-instances/[instanceId]/media-presign`), and specifies that the route must use `patientUserId` (not `doctorUserId`) to call `pgEnsureClientPatientFolder`. The distinction is critical to Rule 5 correctness and is documented.

## Tests

Run via `/home/dev/orch/run-tests.sh` mutex, using main webapp node_modules (worktree lacks independent install; test file was copied temporarily to `apps/webapp/src/app-layer/media/` for execution, then removed). The test ran against the correct module via `vi.mock`.

```
 RUN  v4.1.6 /home/dev/dev-projects/BersonCareBot/apps/webapp

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  14:28:23
   Duration  3.25s (transform 37ms, setup 62ms, import 45ms, tests 3ms, environment 0ms)
```

6/6 tests pass. No failures, no skips.

## Additional observations (non-blocking)

1. **`clientMediaFolders.ts` pre-existing**: The commit diff shows 0 changes to `clientMediaFolders.ts` — this file existed before ST-08. The barrel already exported `pgEnsureClientPatientFolder` from a prior step. ST-08's contribution is the test + LOG.md, which prove the export works and document the O3 gap. This is the correct "plan A" approach per the QUEUE.md spec.

2. **Mock fidelity to real implementation**: The real `pgEnsureClientPatientFolder` (line 122–159 of `pgClientMediaFolders.ts`) does SELECT-then-INSERT-with-upsert. The mock mirrors this with a Map-based cache. The real function always sets `parentId = root.id` (line 139) — the mock sets `parentId: STUB_ROOT_ID` (line 47) where `STUB_ROOT_ID` is returned by the root helper mock. The shapes are consistent.

3. **Type safety**: The mock is typed as `Promise<MediaFolderRecord>`, matching the real function's return type. TypeScript does not find type errors (no `tsc` errors reported during test run setup).

## Overall verdict: PASS

All 6 DoD clauses pass. The re-export is confirmed (Clause 1), the 6 tests prove the correct folder shape, idempotency, and doctor-use pattern (Clauses 2–3 and 6), LOG.md honestly documents the O3 gap with the patientUserId distinction explicitly called out (Clause 4), and §6 compliance is clean throughout (Clause 5).
