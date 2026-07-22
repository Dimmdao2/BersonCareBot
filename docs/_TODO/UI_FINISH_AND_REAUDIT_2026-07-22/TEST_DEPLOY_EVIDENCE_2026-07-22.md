# Incremental TEST deploy evidence — 2026-07-22

## Boundary

- Source branch: `feat/doctor-ui-rebuild`.
- Deployed source SHA: `0eda771fe2d9152f9252248ebe11f586737b0eed`.
- Canonical command: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`.
- Existing `bersoncarebot_test` database was preserved. No fresh PROD dump, full reset, SaaS cutover, historical
  backfill, PROD access, `main` push or `test` push was performed.

## Result

- Checkout/build/forward migrations/strict closure completed on the exact SHA.
- All five TEST units reached active state, application health checks passed and nginx checks passed before the
  locked product smoke.
- Locked product smoke: **21/22 passed**.
- The only failed scenario was `public.booking.slots`, HTTP 400.
- The deploy wrapper then executed its fail-closed trap and stopped all five TEST units. External TEST intentionally
  remained in maintenance state; no manual systemd recovery was attempted.

## Root cause and evidence classification

- Product runtime correctly required the canonical public-slots contract:
  `branchId + serviceId + orgSlug`.
- The protected smoke fixture/runner still rendered the removed legacy `branchServiceId` contract. The 400 occurred
  before a database query and was not a product, migration or TEST-data regression.
- The smoke contract was corrected and independently audited in commits `9e358902a` and `41d624bdd`; integration
  merge `bd5bf1600` is on the feature branch.
- A protected updater for the two canonical fixture refs was implemented and passed a high-risk audit plus closure
  audit (`64befab96` + `4a9de212d`), then integrated as `ed44f7f40`.

## Remaining recovery sequence

1. Put the integrated revision into the canonical TEST checkout through the ordinary deploy path.
2. Run the root-only protected fixture updater from that checkout; it performs a read-only exact-TEST lookup,
   validates before and after replacement, preserves a protected `.previous` copy and rolls back automatically.
3. Repeat the same ordinary incremental deploy.
4. Require all five services active, health/nginx green and locked smoke **22/22** before live UI/OTP/Rubitime
   acceptance.

## NOT DONE

- TEST recovery and 22/22 rerun are not yet complete in this record.
- This failure is not counted as owner acceptance or plan closure.
