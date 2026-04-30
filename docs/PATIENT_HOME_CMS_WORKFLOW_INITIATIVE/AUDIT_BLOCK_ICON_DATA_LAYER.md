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

6. **In-memory vs pg parity** — `listBlocksWithItems` maps `iconImageUrl` with `row.iconImageUrl ?? null` (pg) vs explicit `null` seed + assignment (in-memory). `setBlockIcon`: in-memory no-ops if `blocks.get(code)` is missing; pg runs `UPDATE … WHERE code = …` (0 rows updated if code absent). For valid `PatientHomeBlockCode` both paths persist URL or null consistently. Hypothetical direct port use with an invalid code string is not representable in TypeScript on the port API; behavior differs only for impossible map misses (in-memory guard vs silent pg no-op).

7. **Drizzle meta continuity** — Journal lists `0012_content_section_slug_history` but `meta/0012_snapshot.json` is absent in the tree; a prior `drizzle-kit generate` for the icon column produced spurious DDL until the migration file was trimmed to a single `ALTER TABLE` (see `LOG.md` 2026-04-30). Operational note for future generates: repair snapshot lineage so diffs stay minimal (not a runtime defect of the icon column).

8. **PostgreSQL integration tests** — `apps/webapp/package.json` `test:with-db` does not include `pgPatientHomeBlocks.test.ts`; that file exercises the in-memory port. Read/write/null for the icon field are covered at port level (in-memory) and service level, not via `USE_REAL_DATABASE` against `createPgPatientHomeBlocksPort`.

## Verdict

**PASS WITH NOTES** — Data layer matches intended design (nullable column, isolated migration, no env/settings keys, module/repo boundaries respected, tests cover read / write / null for the contract exercised). Notes: pg vs in-memory edge for absent block code (non-issue for typed callers); no dedicated DB-backed test for `icon_image_url` on PostgreSQL; Drizzle meta gap is a tooling hygiene follow-up.

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

Result: **2 files, 18 tests passed.** (Vitest `globalSetup` reported Drizzle migrate failure in this environment; tests still green.)

**Not run:** root `pnpm run ci` (per audit instructions).
