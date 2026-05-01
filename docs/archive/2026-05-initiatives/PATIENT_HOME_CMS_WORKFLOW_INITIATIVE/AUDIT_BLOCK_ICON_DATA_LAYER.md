# Audit: patient home block icon — data layer

**Scope:** storage and access for `patient_home_blocks.icon_image_url` / `PatientHomeBlock.iconImageUrl`, ports, service, pg and in-memory repos, migration, tests.  
**Branch:** `feat/patient-home-cms-editor-uxlift-2026-04-29` (as of audit).  
**Code / config:** no fixes applied in this pass — documentation only.

## Findings

1. **Schema and column shape** — `apps/webapp/db/schema/schema.ts` defines `patientHomeBlocks.iconImageUrl` as `text("icon_image_url")` with no `.notNull()`, i.e. nullable text. Matches product rule (NULL = Lucide fallback).

2. **Migration** — `apps/webapp/db/drizzle-migrations/0013_patient_home_block_icon_image_url.sql` contains only `ALTER TABLE "patient_home_blocks" ADD COLUMN "icon_image_url" text;`. Does not reference `patient_home_block_items`.

3. **Configuration** — No new env vars or `system_settings` / `ALLOWED_KEYS` entries for block icon URL. Value is per-row DB text (CMS media URL stored as stored elsewhere for sections/pages).

4. **Clean architecture** — `modules/patient-home/service.ts` depends on `PatientHomeBlocksPort` and `blocks.ts` only; no `@/infra/db` or `@/infra/repos` imports in the module. `pgPatientHomeBlocks.ts` / `inMemoryPatientHomeBlocks.ts` implement the port and use Drizzle or in-memory structures; no raw SQL in the module layer.

5. **Service vs port responsibility** — `setBlockIcon` on the service enforces `supportsConfigurablePatientHomeBlockIcon` (whitelist: `sos`, `next_reminder`, `booking`, `progress`, `plan`) and `sanitizeNullable` before calling the port. The port accepts any `PatientHomeBlockCode` and updates the row; unsupported codes are rejected at the service boundary (documented contract).

6. **In-memory vs pg parity** — `listBlocksWithItems` maps `iconImageUrl` with `row.iconImageUrl ?? null` (pg) vs explicit `null` seed + assignment (in-memory). `setBlockIcon`: previously in-memory no-opped if `blocks.get(code)` was missing while pg updated zero rows; **resolved** (see Fix follow-up): both throw `unknown_patient_home_block_code:${code}` when the block row / map entry is absent.

7. **Drizzle meta continuity** — Journal listed `0012_content_section_slug_history` but `meta/0012_snapshot.json` was absent; **resolved** (see Fix follow-up): snapshot file added and `0013_snapshot.prevId` re-linked.

8. **PostgreSQL integration tests** — `test:with-db` did not include `pgPatientHomeBlocks.test.ts`; **resolved** (see Fix follow-up): conditional pg test and `package.json` `test:with-db` entry.

## Verdict

**PASS** — Prior audit notes (findings 6–8) are addressed in **Fix follow-up** below. Schema, migration isolation, configuration, architecture, and service whitelist remain as documented in findings 1–5.

## Fix follow-up (2026-04-30)

- **Finding 6 (in-memory vs pg `setBlockIcon`):** Both implementations now fail consistently on an unknown block code: `createPgPatientHomeBlocksPort` uses `UPDATE … RETURNING` and throws `unknown_patient_home_block_code:${code}` when no row is updated; `createInMemoryPatientHomeBlocksPort` throws the same message when the code is missing from the seeded map. In-memory test added with an invalid code (type assertion).

- **Finding 7 (Drizzle meta continuity):** Added `apps/webapp/db/drizzle-migrations/meta/0012_snapshot.json` representing schema after migration `0012_content_section_slug_history` (derived from `0013_snapshot` with `public.patient_home_blocks.columns.icon_image_url` removed). Updated `apps/webapp/db/drizzle-migrations/meta/0013_snapshot.json` root `prevId` to point at the new 0012 snapshot id so the snapshot chain matches `_journal.json` (0011 → 0012 → 0013).

- **Finding 8 (PostgreSQL integration coverage):** `apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts` includes `describe("createPgPatientHomeBlocksPort (icon_image_url)")` with `it.skipIf(!hasRealDb)` exercising set URL, read via `listBlocksWithItems`, set `null`, and restore prior value in `finally`. `apps/webapp/package.json` script `test:with-db` now includes `src/infra/repos/pgPatientHomeBlocks.test.ts` so CI/manual DB runs pick up this test.

## Tests reviewed / run

**Reviewed (code):**

- `apps/webapp/src/modules/patient-home/service.test.ts` — `setBlockIcon` sets URL, clears with `null`, rejects unsupported block (`daily_warmup`).
- `apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts` — `setBlockIcon` on in-memory port: set URL, then `null`; `listBlocksWithItems` reflects `iconImageUrl`.

**Executed (this audit):**

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-home/service.test.ts \
  src/infra/repos/pgPatientHomeBlocks.test.ts
```

Result after fix follow-up: **2 files, 19 passed, 1 skipped** (pg integration `it.skipIf(!hasRealDb)` when `DATABASE_URL` unset / `USE_REAL_DATABASE` not `1`).

**Not run:** root `pnpm run ci` (per task instructions).
