# AUDIT_PHASE_1

## 1. Verdict: PASS WITH MINOR NOTES

Phase 1 implementation is present and functionally aligned with the initiative scope:

- `content_sections` has only new media fields `cover_image_url` and `icon_image_url`.
- No `home_slot`, `home_sort_order`, `access_type` were added to `content_sections`.
- `patient_home_blocks` and `patient_home_block_items` exist in Drizzle schema and migration.
- Fixed block seed exists in `0008_material_frightful_four.sql`.
- `target_ref` is polymorphic (no FK to `content_pages`/`content_sections`/`courses`; only FK to `patient_home_blocks.code`).
- New patient-home domain port/service and infra repo are implemented and wired through DI.
- `/app/settings/patient-home` exists with preview, actions menu, item dialogs, and block reorder modal.
- Preview items are non-clickable.
- Runtime hardcode of slugs from `CONTENT_PLAN.md` not found in `apps/webapp/src`.
- Phase 1 tests exist and pass.

## 2. Mandatory fixes

None.

## 3. Minor notes

1. **Module isolation (repo-wide legacy context):**
   - New Phase 1 patient-home module files (`blocks.ts`, `ports.ts`, `service.ts`) follow isolation rules.
   - At the same time, repository still contains pre-existing legacy imports from `modules/*` to infra (for example legacy `modules/patient-home/newsMotivation.ts`, `modules/patient-home/repository.ts` and other older modules). This is not introduced by Phase 1 changes, but remains technical debt.

2. **Phase 1 test matrix coverage gaps vs text spec:**
   - `actions.test.ts` validates invalid block code and invalid target type, but does not explicitly assert `reorder items` failure for foreign item IDs of another block (the repo/service logic enforces this at runtime).
   - `pgPatientHomeBlocks.test.ts` verifies behavior via in-memory port; explicit static assertion for absence of `getPool`/`pool.query` in `pgPatientHomeBlocks.ts` is not implemented as a separate test (manual audit confirms Drizzle-only implementation).

## 4. Tests reviewed/run

### Reviewed test files

- `apps/webapp/src/infra/repos/pgContentSections.test.ts`
- `apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts`
- `apps/webapp/src/modules/patient-home/service.test.ts`
- `apps/webapp/src/app/app/doctor/content/sections/SectionForm.test.tsx`
- `apps/webapp/src/app/app/doctor/content/sections/actions.test.ts`
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.test.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.test.tsx`

### Executed during audit

- Command:
  - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgContentSections.test.ts src/infra/repos/pgPatientHomeBlocks.test.ts src/modules/patient-home/service.test.ts src/app/app/doctor/content/sections/SectionForm.test.tsx src/app/app/doctor/content/sections/actions.test.ts src/app/app/settings/patient-home/actions.test.ts src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.test.tsx src/app/app/settings/patient-home/PatientHomeBlockPreview.test.tsx`
- Result:
  - `Test Files 8 passed (8)`
  - `Tests 25 passed (25)`

## 5. Explicit confirmation

**No `CONTENT_PLAN.md` slug hardcode found** in runtime code (`apps/webapp/src`).

