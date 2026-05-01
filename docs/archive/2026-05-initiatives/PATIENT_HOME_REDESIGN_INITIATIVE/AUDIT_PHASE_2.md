# AUDIT_PHASE_2

## 1. Verdict: PASS WITH MINOR NOTES

Phase 2 implementation matches the initiative README and the stated constraints:

- **`content_pages.linked_course_id`:** present in Drizzle schema ([`apps/webapp/db/schema/schema.ts`](apps/webapp/db/schema/schema.ts)), migration [`0009_content_pages_linked_course.sql`](apps/webapp/db/drizzle-migrations/0009_content_pages_linked_course.sql), `ContentPageRow` / upsert path in [`pgContentPages.ts`](apps/webapp/src/infra/repos/pgContentPages.ts), and CMS save path in [`actions.ts`](apps/webapp/src/app/app/doctor/content/actions.ts) (including published-course validation).
- **FK:** `content_pages_linked_course_fkey` on `linked_course_id` → `public.courses(id)` **ON DELETE SET NULL** (and index `idx_content_pages_linked_course`) in `0009_content_pages_linked_course.sql`.
- **Runtime SQL:** `pgContentPages.ts` uses **Drizzle** via `getDrizzle()` only; **no** `getPool` / `pool.query` / `client.query` in that file (verified by search).
- **CMS:** [`ContentForm.tsx`](apps/webapp/src/app/app/doctor/content/ContentForm.tsx) exposes `<select name="linked_course_id">` when `publishedCourses` is supplied; [`edit/[id]/page.tsx`](apps/webapp/src/app/app/doctor/content/edit/%5Bid%5D/page.tsx) and [`new/page.tsx`](apps/webapp/src/app/app/doctor/content/new/page.tsx) load published courses and pass them in.
- **Patient CTA:** [`patient/content/[slug]/page.tsx`](apps/webapp/src/app/app/patient/content/%5Bslug%5D/page.tsx) sets `courseCta` only when `dbRow.linkedCourseId` is set **and** `getCourseForDoctor` returns a row with `status === "published"`; otherwise the CTA block is not rendered (no thrown errors).
- **`patient_home_daily_practice_target`:** present in [`ALLOWED_KEYS`](apps/webapp/src/modules/system-settings/types.ts) and [`ADMIN_SCOPE_KEYS`](apps/webapp/src/app/api/admin/settings/route.ts); PATCH validates integer **1..10**.
- **`patient_home_daily_warmup_page_slug`:** **not** present under `apps/webapp/src` (search: no matches).
- **`getPatientHomeTodayConfig`:** [`todayConfig.ts`](apps/webapp/src/modules/patient-home/todayConfig.ts) reads `daily_warmup` via `deps.patientHomeBlocks.listBlocksWithItems()`, filters visible `content_page` items, resolves slug through `contentPages.getBySlug`; `practiceTarget` from `system_settings` only (not from a warmup slug key).
- **Phase 2 tests** exist and the targeted bundle was executed successfully during this audit (see §4).

## 2. Mandatory fixes

None.

## 3. Minor notes

1. **`getPatientHomeTodayConfig` wiring:** the function is implemented and tested, but **Phase 3** is expected to call it from the new patient home UI; absence of production call sites in Phase 2 is expected, not a defect.

2. **CTA course lookup API shape:** the patient page uses `deps.courses.getCourseForDoctor(id)` for read-only published checks. Semantically it is a doctor-named method on the shared service; acceptable for Phase 2 but could later be renamed or wrapped as `getPublishedCourseById` for clarity (non-blocking).

3. **DB-level verification of migration:** this audit reviewed SQL and Drizzle usage; applying `0009` on a live database and smoke-checking FK behavior remains an operator/deploy concern (not re-run here unless `DATABASE_URL` is available).

## 4. Tests reviewed/run

### Reviewed test files (Phase 2 scope)

- `apps/webapp/src/infra/repos/pgContentPages.test.ts`
- `apps/webapp/src/modules/patient-home/todayConfig.test.ts`
- `apps/webapp/src/app/app/doctor/content/actions.test.ts` (linked course cases)
- `apps/webapp/src/app/app/doctor/content/ContentForm.test.tsx` (linked course select / FormData)
- `apps/webapp/src/app/api/admin/settings/route.test.ts` (`patient_home_daily_practice_target` + `ALLOWED_KEYS` assertion)
- `apps/webapp/src/modules/content-catalog/service.test.ts` (mock rows extended with `linkedCourseId: null`)

### Executed during audit

- Command:

  `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgContentPages.test.ts src/modules/patient-home/todayConfig.test.ts src/app/app/doctor/content/actions.test.ts src/app/app/doctor/content/ContentForm.test.tsx src/app/api/admin/settings/route.test.ts`

- Result:

  - `Test Files 5 passed (5)`
  - `Tests 48 passed (48)`

*(Full `pnpm test:webapp` was reported green in `LOG.md` at Phase 2 completion; this audit re-ran the Phase 2–focused subset only.)*

## 5. Explicit confirmation — no `CONTENT_PLAN.md` slug hardcode

- Searched `apps/webapp/src` for illustrative slugs from [`CONTENT_PLAN.md`](docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md) (`office-work`, `office-neck`, `face-self-massage`, `standing-work`, `young-mom`, `breathing-gymnastics`, `antistress-sleep`, `posture-exercises`): **no matches**.
- **`patient_home_daily_warmup_page_slug`:** **not** present in `apps/webapp/src`.

**Conclusion:** no runtime hardcoding of editorial slugs from `CONTENT_PLAN.md` was found in `apps/webapp/src` for Phase 2 scope.
