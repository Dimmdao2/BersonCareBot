# Code Audit 2 — PFI-ST-08 (Chief/Opus, independent)

Auditor: opus-auditor-pfi-st-08 (Opus, independent 2nd audit)
Date: 2026-06-19
Commit: `a5e11023` on branch `auto/pfi-st-08`

Method: independent re-derivation from source; audit-1 conclusions not read or assumed.
Verification performed against the worktree
`/home/dev/dev-projects/BersonCareBot/.claude/worktrees/agent-ae2a1bd0f46ea689c`,
with tests executed via the shared mutex (`/home/dev/orch/run-tests.sh`).

## Finding summary

| #   | Clause                                                              | Result   | How verified |
|-----|--------------------------------------------------------------------|----------|--------------|
| C1  | `pgEnsureClientPatientFolder` exported from app-layer barrel        | PASS     | Read `app-layer/media/clientMediaFolders.ts` line 4 |
| C2  | Test verifies `kind === "client_patient"`                          | PASS     | test lines 76–79, 104 |
| C3  | Test verifies `parentId === systemRoot.id`                        | PASS     | test lines 81–85, 107 |
| C4  | Test verifies patient-specificity (`patientUserId`)               | PASS     | test lines 87–90, 105 |
| C5  | Idempotency test confirms same folder (no duplicate)              | PASS     | test lines 92–96 |
| C6  | Doctor-use pattern test confirms folderId usable for scoping       | PASS     | test lines 98–108 |
| C7  | All 6 tests pass                                                    | PASS     | mutex vitest run: 6 passed (6) |
| C8  | Helper implementation uses Drizzle only (no raw SQL)               | PASS     | `infra/repos/pgClientMediaFolders.ts` lines 105–167 |
| C9  | LOG.md honestly documents the gap (no false "done" claim)          | PASS     | Read LOG.md; route absence confirmed in code |
| C10 | TypeScript clean                                                    | PASS     | `tsc --noEmit` exit 0 |
| C11 | Scope — exactly 2 new files added, nothing else changed            | PASS     | `git show --name-status`: 2× `A` |

## Detail

### C1 — App-layer export (PASS)
`apps/webapp/src/app-layer/media/clientMediaFolders.ts` is a barrel re-export. Line 4
re-exports `pgEnsureClientPatientFolder` from `@/infra/repos/pgClientMediaFolders`. The
underlying definition is `infra/repos/pgClientMediaFolders.ts:122`:
`export async function pgEnsureClientPatientFolder(patientUserId: string): Promise<MediaFolderRecord>`.
The commit message claims the export was "already present, confirmed" — verified true: the
barrel on the base tree already carried it; this commit added no source change to the barrel,
only the test + LOG. DoD ("exported from app-layer/media/clientMediaFolders.ts") is satisfied.

### C2 — kind === "client_patient" (PASS)
Asserted in two independent tests: line 78 (`expect(folder.kind).toBe("client_patient")`)
and line 104 (doctor-pattern test). The infra implementation hard-codes `kind: "client_patient"`
on insert (`infra/...:114`), so the assertion reflects real behaviour, not just the stub.

### C3 — parentId === root.id (PASS)
Test lines 81–85 fetch the root via `pgEnsureClientFilesRootFolder()` and assert
`folder.parentId === root.id`. Line 107 additionally pins `parentId` to the stub root id and
the comment correctly notes it is "NOT null, NOT some arbitrary folder". The real infra inserts
with `parentId: root.id` (lines 131, 138), so the property is genuine.

### C4 — patient-specificity (PASS)
Lines 87–90 assert `folder.patientUserId === PATIENT_USER_ID`; line 105 repeats for a second
id. Real infra sets `patientUserId: patientUserId` on insert and the lookup filter is
`eq(mediaFolders.patientUserId, patientUserId)` (lines 115, 127) — folders are keyed per patient.

### C5 — idempotency (PASS)
Lines 92–96 call the helper twice for the same patient and assert equal `id`. The real infra
backs this with a pre-insert `SELECT ... WHERE kind = 'client_patient' AND patientUserId = ?`
returning the existing row (lines 124–129), plus a 23505 unique-violation retry path (lines
142–166) for concurrent creation. The stub mirrors the first-call-creates / subsequent-returns
behaviour via a `Map`. Behaviour is correctly proven.

### C6 — doctor-use pattern (PASS)
Lines 98–108 explicitly model the future doctor presign route: call the helper with the
*patient's* userId, then use `folder.id` as the scoping `folderId`. Asserts cover kind,
patientUserId, and parentId. This is the load-bearing "connection point" proof for the gap.

### C7 — tests pass (PASS)
Run via mutex. The worktree has no `node_modules`; the single self-contained test file (it
`vi.mock`s the infra module, so no DB and no other source coupling) was copied into the main
webapp tree, executed, and the copy removed (main worktree left clean). Result:

```
Test Files  1 passed (1)
     Tests  6 passed (6)
```

All six named tests passed. The test is hermetic (mocked DB), so the result is environment-independent.

### C8 — Drizzle only, no raw SQL (PASS)
`pgEnsureClientPatientFolder` and its helper `insertClientPatientFolder`
(`infra/repos/pgClientMediaFolders.ts:105–167`) use only the Drizzle query builder:
`db.select().from(mediaFolders).where(and(eq(...), eq(...)))`, `db.insert(mediaFolders).values(...).returning()`.
No `sql\`...\`` template appears inside this helper.
Note (ADVISORY, not a defect): a *separate* exported helper `clientFilesSubtreeFolderIdsSql`
(lines 169–179) uses a raw recursive-CTE `sql\`...\`` fragment, but it is unrelated to PFI-ST-08,
pre-exists this commit, and is not in scope. The ST-08 helper itself is Drizzle-pure.

### C9 — LOG.md honesty (PASS)
LOG.md (`docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md`) documents O3 with
`Status: GAP documented (plan A from ESCALATIONS.md)`. It does NOT claim the doctor route is
done; it states plainly "No doctor-side route/UI ... exists in the codebase as of 2026-06-19"
and lists the route as a "Future task". I independently verified:
- The patient-side route it cites **does** exist and **does** call the helper:
  `app/api/patient/media/program-submission/presign/route.ts:12` imports it and `:75` calls
  `pgEnsureClientPatientFolder(gate.session.user.userId)`. Claim accurate.
- No doctor-side individual-exercise presign route exists (grep of the api tree for a doctor
  treatment-program media-presign route returns nothing). Gap claim accurate.
The log is truthful — no false "done".

### C10 — TypeScript (PASS)
`pnpm -C apps/webapp exec tsc --noEmit` → exit 0, zero diagnostics. The barrel and infra files
the test depends on type-check cleanly; the test's imports (`MediaFolderRecord`,
`pgEnsureClientPatientFolder`, `pgEnsureClientFilesRootFolder`) resolve against those exports.
(The main tree's barrel/infra is a superset of the worktree's — it additionally carries a later
`pgValidatePatientFolderRename` export not present on `auto/pfi-st-08` — but the ST-08 helper and
its signature are byte-identical across both, so the type result transfers.)

### C11 — Scope (PASS)
`git show a5e11023 --name-status` reports exactly:
```
A  apps/webapp/src/app-layer/media/clientMediaFolders.test.ts
A  docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md
```
Two additions, zero modifications/deletions. 135 insertions total. No source production code was
touched — consistent with the DoD ("helper already present; add test + document gap"). Scope clean.

## Verdict

- **PFI-ST-08: CLEAN** — all 11 clauses PASS (one ADVISORY note under C8 about an unrelated,
  out-of-scope raw-SQL helper that does not affect this story).

The DoD is met: `pgEnsureClientPatientFolder` is exported from the app-layer barrel; tests assert
the returned folder is patient-specific (`kind === "client_patient"`, `parentId === root.id`,
`patientUserId` matches) and prove the doctor-use scoping pattern; the missing doctor-side UI
entry point is honestly documented as a gap in LOG.md with the helper + connection point landed.
Recommend PFI-ST-08 → CLOSED-backend.
