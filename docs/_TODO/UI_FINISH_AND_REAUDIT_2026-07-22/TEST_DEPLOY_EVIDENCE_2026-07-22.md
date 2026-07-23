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

## Recovery completion — exact SHA `45ffed731`

- Final accumulated CI on `45ffed7318c584cf501d6972e231d197bebce6f6` passed after two stale/isolation test
  corrections: lint, typecheck, integrator 1,352 tests, targeted webapp 42 tests, media-worker 67 tests,
  production builds and the complete audit/registry gate.
- The first ordinary deploy put that exact SHA into `/opt/projects/bersoncarebot-test`; as expected, the old
  protected fixture failed preflight on missing `publicBookingBranchId`, and the fail-closed trap stopped TEST.
- The root-only updater completed without printing opaque refs. Both live and `.previous` fixtures are regular
  `root:deploy 0640` files; the deploy user then passed the offline fixture preflight.
- The repeated ordinary deploy preserved the existing TEST database, completed build/migrations/strict closure,
  left all five TEST units active, and passed health/nginx.
- Locked product smoke: **22/22 PASS**, including `public.booking.slots` HTTP 200. The separate global-admin
  clinical-write deny smoke passed HTTP 403.
- The diagnostic-only E1 post-runtime gate remained WARN because of two historical active/unexplained isolation
  events (10 occurrences, last seen 2026-07-21); current 24-hour count was zero. Per the deploy contract this did
  not stop TEST. It remains an operational triage residual and is not hidden as PASS.

## NOT DONE

- Live owner UI acceptance, a populated Today/Messages click-through and real owner email OTP/PWA verification remain
  open.
- TEST has no complete `smtp_outbound` configuration. `admin_emails=dimmdao@gmail.com` was added to public,
  server-runtime and integrator mirrors by an owner-authorized TEST-only transaction; the account remains unverified
  until a real OTP succeeds.
- Rubitime R5/R6 runtime/cutoff evidence and every R7 archive/drop owner gate remain separate.
- Deployment/smoke PASS is not counted as owner acceptance or whole-plan closure.

## Overnight UI correction deploy — exact SHA `2c3b40e77`

- The UI-4 client-list correction was accumulated and validated before deployment: flat borderless selected/empty
  preview, whole-row pointer activation at 97.9% row width, keyboard activation and full-card navigation all passed
  on DEV. A populated fixture also proved the three visible states together: active package, supervision and one
  future appointment. Desktop/mobile PNGs and their hashes are recorded in `TRACK_A_UI4_LIVE_EVIDENCE.md`.
- The identical product tree at `bf49f629b` / docs-only descendants through `2c3b40e77` passed lint, typecheck,
  HLS helper sync, 1,352 integrator tests (2 skipped), 8,985 webapp tests (55 skipped), 67 media-worker tests,
  integrator build and webapp production build. The audit suite passed; its final B4 env-example check, unavailable
  inside the Sonnet sandbox because `.env.example` was projected as a device node, passed separately on the normal
  host checkout.
- Canonical command: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`.
- `/opt/projects/bersoncarebot-test` resolves exactly to
  `2c3b40e7738a1fe45a713f7f9f6d0a39db707f7e`. The existing `bersoncarebot_test` database was preserved; no dump,
  reset, historical backfill, PROD access, PROD service action, `main` push or `test` push was performed.
- All five canonical TEST units are active. Health and nginx gates passed.
- Locked product smoke: **22/22 PASS**. The separate global-admin clinical-write deny smoke passed HTTP 403.
- The diagnostic-only E1 isolation post-runtime gate again reported
  `saas_isolation_post_runtime_gate_active_unexplained_before_coverage`; the canonical deploy contract kept TEST
  active. This remains an operational diagnostic residual, not a failed product smoke and not a hidden PASS.

## Overnight NOT DONE

- Owner visual/click acceptance remains open even though UI-4 source-bound DEV evidence is complete.
- UI-1 Schedule remains partial: the single permitted live pass had an empty work-grid fixture, only one location,
  no mobile populated state and no appointment-detail state. No audit/fix retry loop was started.
- Email OTP/PWA and Rubitime owner gates remain recorded in taskdb tasks `#985` and `#981` respectively.
