# Owner-ready TEST — execution log

## 2026-07-16 — durable pre-live audit ledger

- Owner-intent critic `/root/owner_intent_reconciliation`: eight gap classes found; all routed through correction
  and re-audit. Report: `audit/owner-intent-reconciliation.md`.
- ST-01 final auditor `/root/strict_test_finalizer_review`: PASS for code/scratch after two correction rounds.
  Report: `audit/ST-01-final-PASS.md`.
- ST-02 final auditor `/root/fixture_deep_audit`: PASS for code after fixture/runtime/owner-intent recovery.
  Latest focused evidence: `3 files / 51 tests`. Report: `audit/ST-02-final-PASS.md`.
- ST-03 final auditor `/root/e1_security_audit`: PASS for code/scratch after privilege/runtime/trend convergence.
  Latest focused evidence: `10 files / 88 tests`. Report: `audit/ST-03-final-PASS.md`.
- ST-04 fixer `/root/locked_matrix_smoke_fixer`; final auditor `/root/owner_ready_integration_audit`: PASS for the
  combined pre-live integration code gate, `11 files / 95 tests`; `НАШЁЛ=0`, `ИЗМЕНИЛ=нет` in final re-audit.
  Report: `audit/ST-04-integration-PASS.md`.
- Process auditor `/root/owner_ready_process_audit`: initial FAIL on missing durable reports/combined audit; those
  findings are recovered, but an independent post-recovery process PASS is still pending. Report:
  `audit/process-audit-status.md`.
- Not claimed: full CI, commit/push, live TEST deploy, double-seed/locked smoke/matrix, role walkthrough, visual
  reviews or owner handoff.

## ST-04 recovery — locked matrix and product-smoke contract (`/root/locked_matrix_smoke_fixer`)

- Run ID: `/root/locked_matrix_smoke_fixer`; acceptance: `audit/acceptance-ST-04.md`; no commit/push/deploy or live
  TEST/PROD mutation performed.

- НАШЁЛ: legacy product smoke treated clinic-admin as System Health authority, had no distinct global-admin/admin-mode
  fixture, no negative doctor/clinic-admin probes, no public registration/login coverage, and no executable A/B
  live-fixture matrix. Seeder convergence was asserted only once and the deploy closure did not reassert exact FORCE
  state after behavioral probes.
- ИЗМЕНИЛ: product contract now requires a separate `global_admin` cookie marked `adminMode=true`; positive System
  Health checks versioned `saasIsolation` status/coverage/trend, doctor and clinic-admin must get 403, and public
  `/app`, login config, specialist/clinic registration, `/book`, exact slots and authenticated media remain no-cookie
  or exact-auth probes. An opt-in POST proves global admin cannot acquire a tenant clinical write implicitly.
- ИЗМЕНИЛ: added a TEST-only transactional PostgreSQL matrix for symmetric A/B read/write denial, shared-patient A/B
  selected contexts and an allowed org-scoped booking write. Deploy runs the seeder twice with an unrelated sentinel,
  runs the matrix, rolls every probe write back, then reruns the canonical strict finalizer for exact 163-table
  ENABLE+FORCE proof before restart. No live TEST/PROD action was performed in this pass.
- ИЗМЕНИЛ: strict closure now idempotently creates or rotates the distinct diagnostic PostgreSQL LOGIN from the
  protected `SAAS_ISOLATION_OPERATOR_DATABASE_URL`, converges it to LOGIN/INHERIT/NOSUPER/NOBYPASS without ambient
  app-role memberships, and only then applies the operator capability overlay and its effective privilege assertions.
  Credential-bearing SQL is pipe-only and refuses terminal output; secret values are never logged.
- Re-audit F1/F2: canonical closure now runs the E1 normal state sequence, repeats it with an injected failure and
  guaranteed cleanup, then performs a separate clean-only assertion before strict finalization/restart/product smoke.
  The product-smoke contract checker now has mutations for global-admin authority/admin-mode and a deliberately
  invalid fixture; its normal+self-test chain is part of root `audit`, therefore also the full CI audit stage.
- Follow-up correction: the stale mixed `/app/doctor/analytics` global-admin page probe was replaced by the existing
  tenant-scoped doctor program action-log endpoint. Smoke now requires a successful non-empty seeded `entries`
  history under the specialist workspace; the global-versus-tenant analytics IA split remains deferred to task #800.

## 2026-07-15 — старт

- Owner requirements captured in `REQUIREMENTS.md`.
- Stages and final checklist captured in `ROADMAP.md`.
- Active taskdb: #770 strict finalizer, #797 E1 diagnostics, #798 rich fixture.
- Orchestration correction: `docs/ORCHESTRATION_BINDINGS.md` and its three master files reread after owner notice.
- Existing workers instructed to reread canon, keep stage logs, and return the mandatory minimum report.

## ST-03 — E1 diagnostics (`e1_system_health_impl`)

- Log artifact: this section; acceptance: `audit/acceptance-ST-03.md`.
- Canon reread: `docs/ORCHESTRATION_BINDINGS.md` plus the three exact `/home/dev/brain/host-orch/` master files.
- Checklist in progress: six-class closed/redacted model; independent INFRA persistence; true-global bounded aggregates;
  versioned health read/API; Global Admin System Health card; fault/redaction/admin/aggregation/UI tests.
- Code audit, re-audit, visual acceptance, commit/push and owner acceptance are intentionally not claimed by this worker.
- Implemented evidence: migration `0185`; closed six-class event contract; dedicated non-request INFRA pool; bounded
  aggregate keys plus 90-day coverage retention; webapp DB checkout/install/query/cleanup fault hooks; versioned
  `saasIsolation` health payload; allowlisted event/coverage/read CLI; Global Admin accordion with service/operation,
  active/resolved, explained/unexplained, counts, first/last seen and last E2 coverage.
- Checks: targeted Vitest `6 files / 49 tests` PASS; webapp typecheck PASS; targeted ESLint PASS; journal tail check
  PASS; `git diff --check` PASS.
- Visual detail route and filters were not added in the bounded MVP: details live in the existing System Health
  accordion. Native automatic hooks outside webapp (integrator/worker/scheduler/media-worker) remain a follow-up;
  the closed reporter/CLI already accepts those service families without arbitrary identifiers.
- НАШЁЛ: existing health archives are semantically unsafe for tenant-wall telemetry; request/scoped DB clients can be
  poisoned by the very failures being reported. ИЗМЕНИЛ: introduced separate true-global redacted storage and a
  dedicated INFRA connection; did not repurpose incidents/jobs/failure archives.

### ST-03 correction after independent FAIL audit (`/root/e1_convergence_fixer`)

- Run artifact: this section; acceptance: `audit/acceptance-ST-03.md`; no commit/push/deploy performed.
- НАШЁЛ: first E1 pass used ordinary runtime table privileges, awaited telemetry in the primary failure path,
  accepted arbitrary persisted service/operation strings on read, could mark empty/partial E2 green, globally
  resolved unrelated families, omitted native non-webapp hooks, merged stale/incomplete UI state, and guarded the
  page less strictly than the API.
- ИЗМЕНИЛ: added an EXECUTE-only SECURITY DEFINER API owned by NOLOGIN/NOBYPASSRLS
  `saas_telemetry_owner`, revoked direct tables including `app_owner`, and bound its runtime role discovery/order
  into the shared strict closure before FORCE. Reporter writes use independent pools, bounded queue, total timeout
  and circuit breaker; the primary error path only enqueues.
- ИЗМЕНИЛ: schema v2 has closed service→route/job-template pairs and defensive CHECKs/read validators. Complete
  coverage explicitly requires webapp/integrator/worker/scheduler/media-worker/cron, has a UUID idempotency key,
  and atomically resolves only checked service families. Explanation aggregation is conservative: an unexplained
  occurrence can downgrade an aggregate and an explained occurrence never auto-upgrades it.
- ИЗМЕНИЛ: native hooks now report recognized webapp/integrator failures and background worker/scheduler/media/cron
  failures. Global Admin System Health has distinct critical/incomplete/stale/okay reasons, all six class totals,
  service/class/lifecycle/explanation filters, expandable details and safe Copy-for-AI. Page and API both require
  global admin + admin mode.
- Proof PASS: disposable PostgreSQL scratch (migration+overlay, least privilege, exact aggregate increment, unsafe
  operation rejection, coverage idempotency); 8 targeted Vitest files / 58 tests; db-principal, integrator,
  media-worker and webapp typechecks; targeted ESLint; `check:saas-isolation-diagnostics`; `git diff --check`.
- Independent re-audit and live TEST visual acceptance remain required; no worker self-seal is claimed.

### ST-03 correction round 2 after authority/false-positive FAIL (`/root/e1_convergence_fixer`)

- Run artifact: this section; acceptance: `audit/acceptance-ST-03.md`; no commit/push/deploy or live TEST/PROD
  mutation performed.
- НАШЁЛ: the previous HTTP Global Admin guard did not create a separate database authority. Ambient app/bootstrap
  roles could still inherit diagnostics read/coverage functions; the operator credential was not an explicit
  deploy prerequisite. Background top-level catches could turn ordinary business failures into unclassified SaaS
  events, cron treated generic `success=false` as telemetry, route/job labels were too generic, and a conflicting
  retry of the same coverage UUID was silently accepted.
- ИЗМЕНИЛ: split the DB API into an ambient event-writer credential and a separate
  `SAAS_ISOLATION_OPERATOR_DATABASE_URL`. The overlay rejects superuser/BYPASS/non-login/non-inheriting or app-role
  operator credentials, revokes direct tables and historical function grants, and proves ambient writer-only versus
  operator read/coverage-only effective privileges. C2 preflight and TEST strict closure require the distinct URL
  and print only masked URL shapes.
- ИЗМЕНИЛ: background reporters now gate on recognized DB principal/signature/permission/RLS/cleanup failures at
  existing request/job chokepoints. Cron classifies the caught error only; ordinary provider/ffmpeg/business errors
  are ignored. Persisted source operations are closed normalized route/job-family keys. Coverage accepts an exact
  UUID retry but raises `saas_isolation_coverage_id_conflict` for different content under the same ID.
- ИЗМЕНИЛ: telemetry uses max-one dedicated pools with 200 ms query/statement limits inside a 250 ms reporter
  timeout, bounded queues and circuit breaking, so a timed-out query cannot create an unbounded outstanding-write
  tail.
- Proof PASS: guarded PostgreSQL scratch rehearsal (effective role matrix, initial count 1, four concurrent writers
  produce count 5, exact retry, conflicting retry, business false-positive rejection); targeted Vitest `9 files / 62
tests`; db-principal/integrator/media-worker/webapp typechecks; per-app targeted ESLint; C2/isolation/strict/hard
  checkers and their mutation self-tests.
- Residual gate: TEST must be provisioned with a distinct least-privilege operator login/secret before deployment.
  Independent deep re-audit and live TEST visual acceptance remain required; no worker self-seal is claimed.

### ST-03 correction round 3 after membership/chokepoint re-audit (`/root/e1_convergence_fixer`)

- No commit/push/deploy or live TEST/PROD mutation performed.
- НАШЁЛ: revoking known app roles did not converge arbitrary stale or nested memberships previously granted to
  `saas_telemetry_operator`; `app_owner` was not named in the function-level read/coverage revoke. Cron still
  inspected the business-result `success/error` before attempting its own status DB write, rather than observing an
  isolation failure at that write chokepoint.
- ИЗМЕНИЛ: the overlay enumerates every direct `pg_auth_members` edge into the operator group, revokes all except the
  discovered operator, grants that operator explicitly, and fail-closed asserts it is the sole non-superuser
  MEMBER/USAGE role. Read/coverage EXECUTE is explicitly revoked from `app_owner`. The guarded rehearsal creates a
  stale LOGIN member, proves the overlay removes its membership and read access, then removes scratch resources and
  restores any pre-existing host membership snapshot.
- ИЗМЕНИЛ: cron telemetry moved inside the status write-port catch. A failed cron business result emits nothing;
  ordinary status-write rejection emits nothing; only a recognized caught DB isolation rejection emits the closed
  normalized cron family event.
- Proof PASS: PostgreSQL rehearsal with stale-member convergence plus the existing role/concurrency/UUID/business
  proofs; targeted Vitest `9 files / 63 tests`; four typechecks; per-app targeted ESLint; isolation/C2/strict/hard
  checkers and `git diff --check`. Independent re-audit and live TEST visual acceptance remain required.

### ST-03 final DB-regression convergence (`/root/e1_convergence_fixer`)

- No commit/push/deploy or live TEST/PROD mutation performed.
- НАШЁЛ: the E1 consumers created three dedicated `pg.Pool` instances directly, bypassing the repository's named
  provider inventory. Once that early guard was fixed, the full regression gate correctly exposed the two new
  diagnostics tables as real schema rows missing from `tiers-218.tsv`.
- ИЗМЕНИЛ: webapp telemetry uses a dedicated named provider under `infra/db`; integrator and media-worker telemetry
  factories live in their existing accepted provider files. Consumers retain separate max-one pools but contain no
  `new Pool`. The DB chokepoint allowlist grew by exactly the new webapp provider path and its synthetic-offender
  self-test remains red-capable; a focused provider test pins max-one and all timeout settings.
- ИЗМЕНИЛ: classified `public.saas_isolation_events` and `public.saas_isolation_coverage_runs` as TELEMETRY in the
  canonical tier artifact, moving the then-current exact schema coverage to 231 rows / TELEMETRY=4 (historical
  intermediate count; superseded by 232 / TELEMETRY=5 after the trend store). P0.8/P0.9/P0.10 exact-count
  invariants were advanced accordingly. The P0.5b broad app_staff grant generator explicitly excludes both tables,
  preserving the dedicated SECURITY DEFINER overlay as their only runtime privilege owner.
- Proof PASS: full `pnpm run check:saas-db-regression` including DB chokepoint/self-test, exact T0 inventory, then-current 231-row
  descriptor/enforcement/tier gates and dormant smoke `5 files / 27 tests`; E1 checker/self-test; focused E1 Vitest
  `9 files / 64 tests`; four typechecks; targeted ESLint; `git diff --check`.

### ST-03 trend and reversible-state recovery (`/root/e1_trends_state_fixer`)

- No commit/push/deploy or live TEST/PROD mutation performed.
- НАШЁЛ: the aggregate model had no temporal facts, so it could not honestly produce the owner-required 24h delta
  or seven-day series. The API/UI exposed no trend, and there was no protected repeatable way to demonstrate
  okay/incomplete/critical states. The rehearsal incremented one class, not all six independently.
- ИЗМЕНИЛ: schema/API v3 adds an eight-day bounded hourly redacted store, operator-only trend read, strict shared
  validation, 24h-versus-previous-24h delta and seven UTC daily points in Global Admin System Health.
- ИЗМЕНИЛ: added the closed operator CLI scenario `okay|incomplete|critical|clean`; its SECURITY DEFINER function
  hard-refuses outside exact `bersoncarebot_test` and touches only reserved fixture fingerprints/coverage UUIDs.
  Cleanup preserves genuine telemetry, so a real critical signal cannot be hidden by the fixture.
- ИЗМЕНИЛ: executable scratch proof now writes each of the six event classes exactly once, proves rolling/daily
  totals, protects non-TEST databases, and retains concurrency/idempotency/least-privilege checks. Unit fault
  injection proves all six classifiers emit only closed/redacted arguments.
- Evidence PASS: targeted Vitest `3 files / 29 tests`; webapp typecheck; E1 checker/self-test; full
  `check:saas-db-regression` with 232 exact tables / TELEMETRY=5 and dormant smoke `5 files / 27 tests`; disposable
  PostgreSQL rehearsal; `git diff --check`. Independent correction audit and live TEST scenario/visual proof remain.

### ST-03 bounded trend/state audit correction (`/root/e1_trends_state_fixer`)

- No commit/push/deploy or live TEST/PROD mutation performed.
- НАШЁЛ: rolling current24 and current UTC day had no upper bound, so a future-dated hourly bucket was counted.
  JavaScript derived seven expected dates from its own clock rather than the SQL window anchor, creating a midnight
  race. The state CLI exposed individual mutations but no executable success/failure sequence with guaranteed cleanup.
- ИЗМЕНИЛ: one returned SQL `as_of` anchors rolling and daily windows; future hours are excluded and strict model
  validation derives the seven UTC dates from that same anchor. Rehearsal now proves previous/current boundaries,
  future exclusion and exact date labels.
- ИЗМЕНИЛ: added exact TEST/operator-only scenario wrapper for `okay → incomplete → critical`; `finally` always
  cleans and verifies zero reserved event/hourly/coverage rows. An explicit injected-failure mode proves the same
  cleanup path, and unit/static mutation tests fail if the upper bound or `finally` is removed.
- Evidence PASS: focused E1 Vitest `9 files / 66 tests`; webapp typecheck; targeted ESLint; E1 checker/self-test;
  owner-ready integration checker; full `check:saas-db-regression` with 232 exact tables / TELEMETRY=5 and dormant
  smoke `5 files / 27 tests`; disposable PostgreSQL boundary/privilege rehearsal; `git diff --check`.

## ST-02 — rich TEST fixture pack (`/root/rich_fixture_design`)

- Log artifact: this section; acceptance: `audit/acceptance-ST-02.md`; taskdb: `#798`.
- Canon reread: `docs/ORCHESTRATION_BINDINGS.md`, the three exact `/home/dev/brain/host-orch/` master files,
  `REQUIREMENTS.md`, `ROADMAP.md`, and `audit/acceptance-ST-02.md`.
- Implemented manifest v2 with deterministic reserved IDs and aggregate counts: Clinic A staff=3/patients=5,
  Clinic B staff=1/patients=3, seven `.test` credential logins without packet expansion, 16 service-labelled appointments,
  two package ledgers, two assigned programs, 18 action logs, four events, and 21 diary snapshots.
- Metric variants include sets/reps/weight, bodyweight, weight-only, and no quantity. Cleanup uses exact reserved IDs
  for appointments/enrollments/programs/packages; diary snapshots reset only the two manifest-reserved
  representative-patient aggregate roots because that table has no fixture row ID.
- Checks PASS: focused Vitest (18), webapp typecheck, focused ESLint, `git diff --check`, hard-protocol checker and
  its self-test. No live TEST DB run/deploy or visual walkthrough was performed; executable DB proof, independent
  deep audit/re-audit, and visual acceptance remain downstream gates, so ST-02 is not self-accepted or closed.
- НАШЁЛ/ИЗМЕНИЛ: да | acceptance review found broad patient-root appointment/program cleanup; changed those
  paths to exact manifest IDs, retained only the unavoidable explicitly reserved diary aggregate-root reset, and
  added exact non-TEST refusal plus weight-only, package usage, event, and richer manifest assertions.

### ST-02 correction after independent FAIL audit

- Added exact diary `(org,user,date)` cleanup, a shared patient enrolled in both clinics, deterministic global-admin
  login, org-owned booking branches/availability/working hours, local fake media refs, collision-guarded reserved
  package numbers, and `fixture_noop` product/payment plus disabled notification fixtures.
- No TEST/PROD/deploy/package mutation. Real locked read/write matrix and double-run remain integration-gate evidence.
- НАШЁЛ/ИЗМЕНИЛ: да | restored taskdb #798 scope that the first pass silently omitted and converted send/payment/media
  fixtures to explicit no-external-call states.

### ST-02 correction round 2 after runtime-contract FAIL (`/root/fixture_runtime_fixer`)

- Run artifact: this section; acceptance: `audit/acceptance-ST-02.md`; no commit/push/deploy or live TEST/PROD
  mutation performed.
- НАШЁЛ: public booking rows lacked the exact `be_external_entity_mappings(entity_type=availability,
metadata.legacy_branch_service_id)` contract used by `pgBookingScheduling`; the zero-byte nonexistent MP4 path
  could never be returned by `/api/media/[id]`; date-window cleanup accumulated old diary fixture rows across days.
- ИЗМЕНИЛ: added two deterministic legacy branch-service mappings and an in-seed join/schedule proof;
  cross-day diary cleanup now keys on reserved org+patient+program roots and fails transactionally on a manual target
  date collision instead of deleting it. Added shape assertions for global admin, noop payments, disabled notifications
  and send-safe message logs.
- ИЗМЕНИЛ: replaced dead MP4 descriptors with a committed synthetic SVG copied by the existing standalone
  asset sync. Exact TEST DB rows with null S3 key can return those bytes through the authenticated media route; the
  playback descriptor resolves to that same-origin route. Other databases, paths, MIME types and non-null S3 keys are
  rejected by the local fixture loader.
- Proof PASS: focused Vitest `4 files / 40 tests`; webapp typecheck; focused ESLint; hard-protocol checker and mutation
  self-test; `git diff --check`. Live double-run, locked role matrix, real public slots request, TEST media request and
  visual acceptance remain integration-gate evidence; ST-02 is not self-accepted or closed.

### ST-02 correction round 3 after final bounded FAIL (`/root/fixture_runtime_fixer`)

- НАШЁЛ: local body types were not DOM-safe; playback checked the global video flag before identifying the
  exact TEST-local artifact; diary collision detection omitted organization predicates; store/send postconditions
  did not prove all written rows or zero fixture outbox jobs. The legacy product-smoke contract checker also still
  pinned pre-strict skip wording removed from `HARD_MIGRATION_PROTOCOL.md`.
- ИЗМЕНИЛ: local loader now returns a copied `ArrayBuffer`; the exact database+path+null-S3+SVG fixture alone
  may resolve playback with the global video flag absent, while every non-fixture remains feature-gated. Collision
  queries are org-specific. Postconditions now prove free booking slots, tariff, safe products, intents, captured
  payments, active purchases, disabled topics, failed send-safe logs, and zero fixture rows in all three webapp
  outbox families.
- ИЗМЕНИЛ: restored the four historical product-smoke evidence phrases with an explicit pre-strict label;
  checker expectations now validate the current mandatory external fixture/validator flow rather than requiring a
  skip branch that would contradict ST-01 fail-closed deployment.
- Evidence: focused Vitest `4 files / 41 tests` PASS; product-smoke contract (contract/self-test/fixture preflight)
  PASS; hard-protocol main+self-test PASS; TEST-mode main+self-test PASS. Webapp typecheck has no remaining ST-02
  error and fails only on concurrent E1 test `saasIsolationDiagnostics.test.ts:142`; reported separately to root.

### ST-02 owner-intent recovery: shared login and public/registration surfaces (`/root/shared_patient_public_fixer`)

- No commit/push/deploy or live TEST/PROD mutation performed.
- НАШЁЛ: shared patient had two enrollments but no email/password credential, so the required walkthrough
  could not log in as that persona. The manifest exposed only boolean surface flags, not deterministic A/B
  organization/enrollment refs, route templates or viewports. TEST specialist signup also remained dependent on
  the default-off rollout setting, and documentation blurred DEV-only helpers with TEST public evidence.
- ИЗМЕНИЛ: shared patient now owns `patient-shared@saas-fixture.test` and a password credential reusing
  the protected Clinic A packet password (no new packet key); A=5/B=3 enrollments are unchanged. Versioned
  `operatorRefs` publishes non-secret login sources, A/B context IDs, exact public/helper routes and desktop/mobile
  viewports for downstream tools.
- ИЗМЕНИЛ: TEST settings override writes and locks mirrored `specialist_signup_enabled=true`, while
  production remains default-off. DEV clear-session aliases explicitly name login, specialist-registration and
  clinic-registration; the latter two converge on the existing canonical flow that creates specialist + clinic +
  owner membership together. Exact TEST scenarios live in `ST-02_WALKTHROUGH.md`.
- Integration owner still must prove live double-run, actual TEST public/signup/book routes, shared-patient A/B
  context selection and the locked matrix. No claim is made for those separate ST-04 gates.

## ST-01 — strict TEST finalizer correction (`/root/strict_finalizer_fixer`)

- Run artifact: this section; acceptance: `audit/acceptance-ST-01.md`; audit source:
  `/root/strict_test_finalizer_review` FAIL handoff supplied by orchestrator.
- НАШЁЛ: finalizer rendered generated base policies after specialized overlays, erasing patient course assignment
  and app_worker media branches; invite overlay contained a fail-open NULL raw-GUC branch. Code-only deploy had no
  roles/helpers/grants/overlays, no separate seed, a skippable/absent product smoke, and fail-open health output.
- ИЗМЕНИЛ: finalizer order is base → fail-closed invite/course/app_worker overlays → exact 163 FORCE assertion →
  semantic policy/grant assertions. Invite direct access is protected staff/org only; pre-session lookup/accept are
  exact-grant SECURITY DEFINER functions owned by NOLOGIN/BYPASSRLS `app_owner`.
- ИЗМЕНИЛ: both fresh and code-only paths now converge through one `run_strict_post_migration_closure`; it owns
  P0.5b/P2-B, runtime overlays, E1 telemetry closed API, ledger/D3.4, settings, finalizer, separate privileged fixture
  seed with cleanup, locked restart, fail-closed units/health/nginx/product smoke, and stop-on-failure behavior.
- Historical dormant helper is documented as diagnostic, not strict TEST recovery. OFF/NO FORCE remains only
  disposable/prod compatibility provenance, not TEST acceptance.
- Static checks PASS: `bash -n deploy/host/deploy-test{,-saas}.sh`;
  `pnpm run check:saas-test-strict-finalizer`; `pnpm run check:saas-hard-migration-protocol`;
  `pnpm run check:saas-isolation-diagnostics`; all checker self-tests. The strict/hard checkers additionally pin the
  E1 webapp reporter to `DATABASE_URL_NONSTAFF`/`DATABASE_URL` bootstrap discovery and the API reporter to the API
  runtime-role discovery, preventing a privileged migrator-role regression.
- Scratch proof PASS on guarded disposable `bcb_saas_strict_rehearsal_20260715a`: canonical dormant restore/migration
  wrapper + DB-state gate; strict finalizer; unset-staff invite visibility 0; patient no direct invite table SELECT;
  pre-session lookup/invalid accept work through narrow functions; course/app_worker/invite semantic probes green.
- Live TEST was not touched. Independent full re-audit, actual TEST deploy/locked product smoke, commit/push and owner
  acceptance remain downstream gates; ST-01 is not self-accepted or closed.

### ST-01 correction after independent re-audit integrity FAIL

- НАШЁЛ: product-smoke preflight accepted source/deploy-repository paths and unsafe owner/group/mode, while the
  consumption path downgraded the second check to readability-only; a symlink parent was not excluded.
- ИЗМЕНИЛ: added `deploy/host/validate-saas-product-smoke-fixture.sh` as the single validator used at preflight and
  immediately before `smoke-saas-product.mjs`. It resolves the complete path, requires the supplied path to equal
  that canonical result (therefore no symlink component), rejects both repository trees, and requires exact
  `root:deploy 0640`.
- Proof PASS: validator executable self-test rejects in-repo, symlink-parent, `0644`, wrong-owner and wrong-group
  mutations; strict/hard checker mutation suites pin those clauses and the consumption-time revalidation order.
  A separate `/tmp` root-owned contract probe accepted only external `root:deploy 0640` and rejected actual `0644`,
  `dev:deploy`, symlink-parent, and in-source-repository variants. Smoke execution now runs as `deploy` from the
  deployed checkout, so the protected read contract and version provenance are both exercised at consumption.
  `bash -n` for all three shell files, `pnpm run check:saas-test-strict-finalizer`,
  `pnpm run check:saas-hard-migration-protocol`, and `git diff --check` pass. No live TEST/PROD action occurred.

### E1 locked runtime principal/transport closure (`/root/e1_background_transport_fix`)

- Root cause: caught pre-routing/projection/health authorization failures could bypass the Fastify `onError` hook,
  while the background reporter silently opened a 30-second circuit after its first writer failure. This made an
  empty diagnostics store insufficient evidence that API/worker/scheduler telemetry was healthy.
- Changed only bounded technical paths: messenger and M2M organization lookup scopes, projection-health infra scope,
  and caught health/projection/pre-routing reporting. Unknown bootstrap/infra sources still fail before checkout;
  no generic HTTP handler receives ambient access.
- The shared reporter now exposes redacted bounded transport/drop/probe counters and emits milestone status without
  raw errors. Locked API, worker and scheduler startup executes a real event-writer call inside `BEGIN`/`ROLLBACK` on
  the dedicated telemetry pool; a failed probe prevents the corresponding unit from becoming active and leaves no
  synthetic diagnostics row.
- Evidence PASS: db-principal/integrator typechecks, targeted ESLint, focused Vitest `4 files / 34 tests`, full
  integrator Vitest `165 passed / 1 skipped; 1225 passed / 2 skipped`, E1/C3/C4 static checkers plus self-tests, and
  `git diff --check`. No live deploy/full CI. Independent child audit could not start because its selected model was
  at capacity; the root orchestrator will assign the required independent review after this checkpoint.

### Integrator DB-backed server runtime bootstrap (`/root/integrator_runtime_bootstrap`)

- Закрыт startup-gap: API, worker и scheduler до построения зависимостей загружают `app_base_url` через узкий
  SECURITY DEFINER accessor из `app_runtime_settings`; прямого чтения `system_settings` и env fallback больше нет.
- Миграция `0191` переносит существующее глобальное значение в server-runtime root и создаёт generic accessor.
  Deploy overlay выдаёт API runtime-роли только EXECUTE, оставляя обе таблицы закрытыми, а финальный readiness gate
  проверяет доступ и корректный HTTP(S) результат без вывода самого значения.
- Проверки PASS: focused Vitest `4 files / 118 tests`, integrator typecheck, integrator lint, Drizzle journal sync,
  новый static checker и его self-test, `bash -n deploy/host/deploy-test-saas.sh`, `git diff --check`.
- Общий `check:saas-db-regression` останавливается раньше нового checker на параллельно изменяемом
  `playbackResolutionEvents.ts` (`check-db-chokepoint`, `3x layer SQL signal`); этот чужой scope здесь не менялся.
  Live TEST/PROD deploy не выполнялся.

### Integrator runtime bootstrap follow-up (`/root/integrator_runtime_bootstrap`)

- Устранён прямой `.connect()` из telemetry consumer: checkout/release перенесены в канонический
  `integratorPoolProvider`, отдельный global telemetry pool не получает request-principal, а failed client по-прежнему
  уничтожается исходной ошибкой до её редактирования наружу.
- Invalidation `app_base_url` теперь оставляет последнее успешно проверенное DB-значение синхронным reminder-paths,
  но помечает async TTL устаревшим; следующий async read перечитывает БД. Добавлен regression sync-after-invalidate.
- PASS: targeted Vitest `3 files / 13 tests`, integrator typecheck/lint, runtime-config checker+self-test,
  DB chokepoint guard и его self-test. Полный `check:saas-db-regression` проходит chokepoint и останавливается на
  предсуществующем inventory-gap миграции `0186`: `public.app_runtime_settings` отсутствует в `tiers-218.tsv`.
  Автоматически относить таблицу к стандартному BOOTSTRAP-hybrid нельзя: generic policy не учитывает `audience='server'`.
  Live TEST/PROD не затрагивались.
