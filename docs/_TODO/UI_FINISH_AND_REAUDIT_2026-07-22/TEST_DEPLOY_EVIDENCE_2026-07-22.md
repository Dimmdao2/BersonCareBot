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

## Final DNA/settings delta deploy — exact SHA `b993883e6`

- The only product delta from the accumulated-CI/deployed tree `2c3b40e77` is
  `TeamSection.tsx` plus its focused test: existing `/app/settings?tab=team` member and pending-invite lists now
  reuse the shared flat DNA row without adding a second settings tab tree or changing API/DB/entitlement behavior.
- Delta gate on exact integration SHA `b993883e62aa3889d54ed9081df909ce2187c724`: focused Vitest
  **3 files / 18 tests PASS**, touched-file ESLint PASS, webapp typecheck PASS, `git diff --check` PASS. The full
  167-row matrix validator passed with unchanged owner text and product totals `45 real / 44 partial / 9 deferred /
  50 blocked`; the accumulated full CI was not redundantly repeated for this two-file product delta.
- Canonical command: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`. The existing
  `bersoncarebot_test` database was preserved; no dump/reset/PROD read or action, `main` push or `test` push occurred.
- `/opt/projects/bersoncarebot-test` resolves exactly to `b993883e62aa3889d54ed9081df909ce2187c724`.
  Build, controlled forward migrations, strict closure, health and nginx passed; all five TEST units are active.
- Locked product smoke: **22/22 PASS**. The separate global-admin clinical-write deny smoke passed HTTP 403.
- The diagnostic-only E1 post-runtime gate again stopped before current coverage on the two already recorded
  historical active/unexplained aggregates: `role_pool_mismatch` (7 occurrences, last 2026-07-19) and
  `invalid_signature_or_install` (3 occurrences, last 2026-07-21). Current 24-hour count is zero and both groups
  predate this deploy by more than 32 hours, but neither has evidence-backed benign triage; they were not resolved
  or coverage-completed automatically. FORCE-RLS and product smoke remained hard-green per the TEST deploy contract.

## Final delta NOT DONE

- The new Team shared-row consumer is code/test/deployed, but its DEV live page redirects because the current clinic
  lacks the `clinic_team` entitlement; its DNA owner row therefore remains partial rather than being inferred closed.
- Track B still needs a complete TEST `smtp_outbound` plus owner OTP/PWA browser acceptance (`#985`).
- Patient Messages needs owner authorization for the bounded current-patient security capability (`#986`) before a
  populated Messages live pass. Rubitime provider/cutoff/archive decisions remain in `#981`.

## U6A public-entry delta deploy — exact SHA `531699942`

- Integrated product delta: calendar `.ics` UID domains now derive from the existing DB-backed `app_base_url`, and
  an authenticated server-boundary test proves that landing `intent` cannot steer post-auth role routing.
- Exact integration gate on `531699942148fb458e338ad7d8ab48fee7479f61`: focused Vitest **6 files / 75 passed /
  1 skipped**, touched-file ESLint PASS, webapp typecheck PASS and clean HEAD/origin/diff checks.
- Canonical incremental command: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`. The existing
  `bersoncarebot_test` database was preserved; no fresh dump/reset/PROD action, `main` push or `test` push occurred.
- `/opt/projects/bersoncarebot-test` resolves exactly to the integrated SHA. Build, migration ledger/strict closure,
  nginx and health passed; all five TEST units are active.
- Locked product smoke passed **22/22**. The separate global-admin clinical-write deny smoke passed HTTP 403.
- TEST `public.system_settings` and `integrator.system_settings` both hold the same global `app_base_url` value,
  `https://test.bersoncare.ru`; live root HTML renders the same OpenGraph URL, proving the metadata path consumes the
  deployed DB-backed value.
- The diagnostic-only E1 post-runtime gate again reported the already-recorded historical active/unexplained groups.
  FORCE-RLS and product smoke stayed hard-green; no group was auto-resolved or falsely coverage-completed.

## U6A delta NOT DONE

- Manual authenticated non-installed TEST patient browser click remains an owner/live gate.
- Live `.ics` download plus authorized Settings `app_base_url` change/reload proof remains open; tests and deployed
  metadata prove the code path but do not substitute for that UI acceptance.
- U5A dependency, public pricing/acquisition analytics/public status owner contracts, U6B dependency closure, full
  repo CI and owner acceptance remain open. See `U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md`.

## Populated Messages / Track B live acceptance — exact deployed SHA `5d6e83c56`

- `/opt/projects/bersoncarebot-test` resolved to
  `5d6e83c569e300744f5840a2687b335db5445c8c`. All five TEST services were active; webapp, integrator and public
  health returned HTTP 200.
- Locked product smoke passed **22/22**. The separate global-admin clinical-write denial passed HTTP 403.
- The canonical patient TEST session sent one synthetic message through the ordinary patient API with HTTP 200 and
  read it back. A random conversation remained HTTP 404.
- One presentation audit captured populated Today/Clients/Messages desktop+mobile and the selected Messages thread.
  Whole-row far-right pointer and keyboard activation passed for Today, Clients and Messages; live style evidence
  matched exact DNA canvas `#F6F4EF`, no list side borders, `#f0efeb` divider color and `16px/400` primary text.
  Evidence directory:
  `/home/dev/dev-projects/.lead/runs/ui-finish-984/5d6e83c56/test-live-20260723T1434Z`.
- Patient send/display is green, but patient mark-read is not: the UI's
  `POST /api/patient/messages/read` returned HTTP 500 repeatedly. TEST journal records
  `permission denied for table support_conversation_messages` on the direct UPDATE (`aclcheck_error`).
- The authorized owner OTP start at `2026-07-23T14:41:22.978Z` returned HTTP 503 `email_send_failed`. Integrator
  logged `restricted_setting_read_failed` for `smtp_outbound`; no OTP challenge or code was obtained.
- Staff PWA manifest, service worker, install page, VAPID public-key status and global Web Push enablement passed.
  The owner still had no subscription; subscribe/unsubscribe/browser permission/test notification remained blocked
  by the failed ordinary OTP login and the absent constrained global-admin visual handoff.
- The canonical isolation diagnostics `read` command was run without mutation. It reported **critical**, three
  active unexplained groups / 17 occurrences, stale coverage, seven occurrences in the current 24-hour window and
  latest `role_pool_mismatch` at `2026-07-23T14:36:59.638Z`. The latest signal aligns with the live Messages
  mark-read failures and must not be reclassified as only historical or coverage-complete.

## Populated Messages / Track B NOT DONE

- Patient mark-read requires its own correction and independent verification.
- SMTP restricted-accessor runtime execution/read remains broken on TEST; owner OTP login is not accepted.
- Staff PWA browser subscription, unsubscribe, notification receipt and owner acceptance remain open.
- Diagnostics were not resolved, cleaned or coverage-completed by this acceptance pass.
