# Code Audit 1 — PFI-ST-04 (Sonnet, independent)
date: 2026-06-19T14:55:00Z
branch: auto/pfi-st-04 @ 04705875 vs feat @ 21051398

## Checklist

### Clause 1: nullable media_file_id FK to media_files.id (onDelete: set null) in schema
verdict: PASS
how-verified:
- `patientFiles.ts:35` — `mediaFileId: uuid("media_file_id")` with no `.notNull()` → nullable
- `patientFiles.ts:63-67` — `foreignKey({ columns: [table.mediaFileId], foreignColumns: [mediaFiles.id], name: "patient_files_media_file_id_fkey" }).onDelete("set null")`
- `patientFiles.ts:45-47` — partial index on `mediaFileId` WHERE NOT NULL
- Import of `mediaFiles` from `./schema` added at line 12
- All three elements (column, FK, index) consistent with DoD requirement

### Clause 2: Migration correctness + drizzle-kit vs handwritten
verdict: FAIL (advisory — functionally correct SQL, but DoD requires drizzle-kit generated)
how-verified:
- Migration `0131_patient_files_media_file_id_fk.sql` is handwritten raw SQL
- Confirmed handwritten: no `0131_snapshot.json` in `meta/` directory (drizzle-kit generates a snapshot per migration); only 24 snapshots exist for 132 SQL files
- The `-->  statement-breakpoint` delimiter is absent. The drizzle-orm migrator (`migrator.js:16`) splits on `"--> statement-breakpoint"`. Without the markers, all 3 statements (ADD COLUMN, ADD CONSTRAINT, CREATE INDEX) are sent as one query string. PostgreSQL's `pg` driver supports multi-statement queries via simple query protocol — execution succeeds, but bypasses drizzle-kit's per-statement execution model.
- SQL correctness: ADD COLUMN IF NOT EXISTS (idempotent ✓), ADD CONSTRAINT without IF NOT EXISTS (not idempotent — PostgreSQL does not support IF NOT EXISTS on ADD CONSTRAINT; drizzle-kit also omits it), CREATE INDEX IF NOT EXISTS (idempotent ✓)
- Constraint and index names match schema definition exactly: `patient_files_media_file_id_fkey`, `idx_patient_files_media_file_id`
- The project has a de-facto precedent of handwritten migrations from ~0113 onwards (no snapshots beyond 0035); however, DoD explicitly requires drizzle-kit generated
- Missing snapshot is a maintenance hazard: next `drizzle-kit generate` will re-detect these schema changes and create a duplicate migration
- drizzle-kit requires a live DATABASE_URL to run `generate` — cannot run without credentials, making CI-based generation impractical (executor's stated reason)

**Verdict**: FAIL on DoD strictness (handwritten, not drizzle-kit generated). SQL is functionally correct and executes successfully on first application. Missing snapshot creates a drift risk for future migrations.

**If fixing**: Run `drizzle-kit generate` with a real DATABASE_URL to produce official snapshot+SQL, or owner formally accepts handwritten migrations as the project standard (de-facto true from migration ~0113).

### Clause 3: Route POST calls pgEnsureClientPatientFolder + passes folderId
verdict: PASS
how-verified:
- `route.ts:20` — imports `pgEnsureClientPatientFolder` from `@/app-layer/media/clientMediaFolders`
- `route.ts:121` — `const patientFolder = await pgEnsureClientPatientFolder(userId)` called unconditionally
- `route.ts:133` — `folderId: patientFolder.id` passed into `createFile` params
- `pgEnsureClientPatientFolder` implementation: looks up existing `client_patient` folder by patientUserId, creates under `client_files_root` if absent (with name collision retry via last4-phone suffix)
- Pattern of calling this from routes via app-layer re-export is established (see `presign/route.ts:75`)

### Clause 4: media_files row created in patient folder before patient_files insert
verdict: PASS
how-verified:
- `pgPatientFiles.ts:65-79` — when `params.folderId` truthy: `db.insert(mediaFiles).values({...}).returning({ id: mediaFiles.id })` executes first
- All required non-nullable fields provided: `originalName`, `storedPath`, `mimeType`, `sizeBytes` (all `.notNull()` in schema)
- `status: "ready"` passes `media_files_status_check` constraint ✓
- No `usagePurpose` set → NULL → passes `media_files_usage_purpose_check` (`IS NULL` is allowed) ✓
- `folderId` set → `media_files_folder_id_fkey` FK satisfied (folder guaranteed by pgEnsureClientPatientFolder) ✓
- `mediaFileId = mf?.id ?? null` handles empty-return edge case
- Returned `mediaFileId` flows into second `patient_files` insert

### Clause 4b: Dual-insert transaction safety
verdict: FAIL (defect)
how-verified:
- `pgPatientFiles.ts:60-96` — no `db.transaction()` wrapping the two inserts
- If `media_files` INSERT succeeds (line 66-78) but `patient_files` INSERT fails (line 80-93), the `media_files` row is orphaned in the patient's media library folder with no linked `patient_files` record
- Orphaned rows appear as ghost files in the patient's media library (visible as folder contents but unreachable from patient files UI)
- Reproduction: any constraint violation, timeout, or network error on the second INSERT
- Risk: MEDIUM — silent data inconsistency accumulates
- Fix: `db.transaction(async (tx) => { [both inserts using tx instead of db] })`

### Clause 5: Route stays thin (no business logic in route)
verdict: PASS
how-verified:
- Route: auth, UUID validation, JSON parse, Zod validation, `pgEnsureClientPatientFolder` (app-layer), `deps.patientFiles.createFile` (service), presign URL (app-layer), response
- Business logic (dual-insert, mediaFileId linking) entirely in `pgPatientFiles.createFile` (repo layer)
- No DB queries or business conditions in the route handler itself

### Clause 6: G3 consistency tests meaningful (join + set-null semantics)
verdict: PASS with NOTE
how-verified:

G3a (join verify) — `pgPatientFiles.g3.test.ts`:
- Mocks drizzle DB; verifies two inserts when folderId provided (toHaveBeenCalledTimes(2))
- `result.mediaFileId === MOCK_MEDIA_FILE_ID` confirms id flows from media_files insert → patient_files result (mocked join-verify)
- Verifies `patientInsertBuilder.values` called with `{ mediaFileId: MOCK_MEDIA_FILE_ID }` — confirms correct wiring
- Backward-compat: single insert + null mediaFileId when no folderId (3 tests total in G3a)

G3b (set-null semantics) — schema-level assertion only, NOT actual DB delete test:
1. `patientFiles.mediaFileId` column `.notNull` property is false (drizzle runtime metadata check)
2. Schema source file contains `patient_files_media_file_id_fkey` and `.onDelete("set null")` (file-read regression guard)

NOTE: G3b does not execute an actual DB DELETE to prove the FK ON DELETE SET NULL fires in PostgreSQL. The DoD's "deleting patient_files row → media_files.id becomes null" is also semantically inverted — the FK is on patient_files.media_file_id pointing TO media_files.id, so it's the REVERSE (media_files deletion → patient_files.media_file_id becomes null, not the other way). G3b tests are schema-definition guards only, which is acceptable for a CI context without a DB.

NOTE: `insertCalls` array at `g3.test.ts:25` is declared and cleared in `beforeEach` but never populated or asserted — dead code, non-harmful.

### Clause 7: inMemoryPatientFiles.ts scope — necessary or out-of-scope leak?
verdict: PASS (necessary, safe)
how-verified:
- `inMemoryPatientFiles.ts:42-43`: `mediaFileId: params.folderId ? randomUUID() : null`
- Required: `PatientFileRecord.mediaFileId: string | null` is now part of the port type; inMemory store MUST mirror it for TypeScript compliance and for `pgPatientFiles.test.ts` (which tests the inMemory port)
- Without this change, TypeScript would error on the missing field, and tests using the inMemory port would fail
- Modification is minimal, correct, and follows existing inMemory field patterns

### Clause 8: service.ts not modified — is layering correct?
verdict: PASS
how-verified:
- `service.ts:28` — `createFile(params)` delegates directly to `patientFilesPort.createFile(params)` (pass-through)
- `folderId` added to `CreatePatientFileParams` in ports.ts; service.ts passes params through unchanged
- No modification needed: the service is a thin delegator; the new field automatically flows through
- Route calls `deps.patientFiles` (which is `patientFilesService`) → service → port → repo: correct chain
- DoD files list mentions `service.ts` should be modified, but executor correctly identified it was unnecessary

### Clause 9: §6 compliance (drizzle-only in repo; DI via ports; no dup; imports clean)
verdict: PASS
how-verified:
- `pgPatientFiles.ts` — all DML via drizzle `.insert()`, `.select()`, `.update()` — no raw SQL
- `mediaFiles` imported from `"../../../db/schema/schema"` (correct)
- Port interface in `modules/patient-files/ports.ts`; implementation in `infra/repos/pgPatientFiles.ts`
- No duplicate folder logic; existing `pgEnsureClientPatientFolder` reused
- ESLint no-restricted-imports: route imports from `@/app-layer/media/clientMediaFolders` (allowed); repo imports from schema (allowed)

### Clause 10: Auth + security in route (no IDOR — uploads go to correct patient folder)
verdict: PASS with NOTE (pre-existing IDOR, not introduced by this PR)
how-verified:
- `requireDoctorApiSession()` enforces doctor or admin role (JWT session check)
- `userId` validated as UUID format before use
- `pgEnsureClientPatientFolder(userId)` routes upload to the specific patient's folder
- `uploadedByUserId: auth.session.user.userId` correctly records the authenticated doctor as uploader
- NOTE: No verification that `userId` is a patient assigned to this doctor — pre-existing IDOR on all `/api/doctor/patients/[userId]/*` routes; explicitly deferred by owner to SaaS initiative; PFI-ST-04 does NOT worsen this

## Tests
```
[2026-06-19T14:50:00+02:00] ACQUIRED test lock
pnpm --filter webapp exec vitest run src/infra/repos/pgPatientFiles src/app/api/doctor/patients

 RUN  v4.1.6 .../apps/webapp

 Test Files  3 passed (3)
      Tests  26 passed (26)
   Start at  14:50:01
   Duration  899ms (transform 324ms, setup 249ms, import 795ms, tests 37ms, environment 0ms)
```

All 26 tests pass across 3 test files (inMemory contract tests, G3 mock tests, route tests).

## Overall verdict: FAIL+2

**DEFECT-1 (Clause 2 — Migration handwritten, not drizzle-kit generated)**
- DoD requires drizzle-kit generated migration; 0131 is handwritten SQL
- No snapshot file (`0131_snapshot.json`) in `meta/` — next `drizzle-kit generate` will re-detect the column/FK/index and create a duplicate migration
- `-->  statement-breakpoint` markers absent — all 3 statements execute as one query string (works via PostgreSQL multi-statement support but bypasses drizzle-kit's statement model)
- SQL is functionally correct on first application; no runtime bug on first run
- Severity: MEDIUM (maintenance hazard, not a runtime defect)
- Fix: run `drizzle-kit generate` with DATABASE_URL, or owner formally accepts handwritten as project standard

**DEFECT-2 (Clause 4b — No transaction on dual-insert)**
- `media_files` + `patient_files` inserts in `pgPatientFiles.createFile` are NOT in a DB transaction
- If the first insert (media_files) succeeds but second (patient_files) fails, an orphaned `media_files` row is left in the patient's folder
- Orphaned rows appear as ghost files in the media library
- Severity: MEDIUM (silent data inconsistency)
- Fix: `db.transaction(async (tx) => { /* both inserts */ })`

**Non-blocking:**
- G3b tests schema-definition only, not actual DB delete behavior (acceptable for CI-without-DB context)
- `insertCalls` array in g3.test.ts is dead code (declared but never used in assertions)
- Pre-existing IDOR on userId ownership (owner-deferred, not introduced by this PR)
