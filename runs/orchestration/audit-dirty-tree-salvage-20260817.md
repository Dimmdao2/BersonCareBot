# Independent critical audit — dirty-tree salvage 2026-08-17

Audit target: complete net transition `2e8ffe851a404da1894cb20b5b9d27e2dd409394..609a19f94431ce292369a9347b94d82472a21a88`.

Authority order: `docs/OWNER_DECISIONS.md` dated 2026-08-16 (B0 and DEV → named TEST → future A→B0) overrides older plan/runbook prose; `AGENTS.md` §§10b and 24.4–24.7 govern evidence.

## Pre-test classification (recorded before diff/test inspection)

### View / one-time-state requirements

- VIEW-01 — view — pre-B0 historical migration chains and active A0/A1/greenfield machinery must be absent from active checkout; only B0 plus legitimate forwards may remain.
- VIEW-02 — view — B0 journal, migrators, package commands and active documentation must form one internally consistent contract without a historical/disposable replay path.
- VIEW-03 — view — premature PROD-dump/A→B0 generated machinery must be absent/deferred; TEST must remain unexecuted and only the bounded future named-TEST path may remain.
- VIEW-04 — view — TEST deploy must retain a durable failure transcript, consistent executable/documented entrypoint and safe failure cleanup.
- VIEW-05 — view — forward migrations may contain schema/function behavior but no declaration-owned grants, owners, roles, RLS or policy control.
- VIEW-06 — view — runtime/nested outputs, serial briefs/debug probes and identity-bearing evidence must be absent or ignored and uncommitted.
- VIEW-07 — view — the integrator VAPID/settings seam must be structurally unable to return the SMTP secret envelope.
- VIEW-08 — view — no active plan/report may falsely claim PASS or DEV green.
- VIEW-09 — view — the transition must contain no secret, cookie, data dump or unintended live credential.
- VIEW-10 — view — the worker candidate must be a coherent commit and the branch worktree clean except sandbox-injected read-only env mounts.

These are inspected by net diff, final-tree exact search, generated-declaration introspection/AST where useful, and narrow syntax/self-tests. No permanent absence-of-text test will be created.

### Behavior requirements — blind kill-set

The following reachable failures were derived from owner/active product authority before reading existing tests:

- BK-01 patient/org boundary — an authenticated patient can create or read a booking for a service, specialist, slot or appointment belonging to another organization; impact: cross-clinic data access/booking corruption.
- BK-02 lifecycle create/readback — successful create is not returned by the same patient's upcoming read model with the persisted organization/time/status; impact: the patient cannot manage the appointment just created.
- BK-03 lifecycle reschedule/readback — reschedule succeeds without atomically moving the same appointment to the new allowed slot, or upcoming readback still exposes the old time; impact: conflicting patient/clinic schedules.
- BK-04 lifecycle cancel/history — cancel leaves the appointment actionable/upcoming or fails to place it in patient history with cancelled state; impact: stale appointment and wrong lifecycle.
- BK-05 appointment cutoff — upcoming/history classification uses `start_at`/wall-clock start instead of `end_at`, so an in-progress appointment disappears before it ends; impact: patient loses the active appointment.
- MUT-01 LFK/program comment — a patient-origin LFK/program note can mutate another patient's/org's item or a successful mutation is absent from subsequent authorized readback; impact: cross-patient clinical data corruption or lost note.
- MUT-02 warmup — completion/preference mutation returns success but authorized readback remains old/default or belongs to another patient; impact: lost adherence state.
- MUT-03 reminder settings — a patient can mutate another patient's rule, or enabled/time/channel changes are not returned by readback; impact: wrong or missing reminders.
- NTF-01 patient-origin recipient — a patient chat message or program note selects a recipient outside the patient's owning care relationship, or selects no responsible staff recipient; impact: health communication disclosure or loss.
- NTF-02 channel intersection — dispatch selects a channel outside `available ∩ enabled`, or omits a channel inside the intersection; impact: delivery to forbidden/unavailable channel or silent message loss.
- NTF-03 delivery attempt — an attempted patient-origin delivery, including provider failure, is not durably represented as an attempt with its outcome; impact: operators falsely believe nothing was attempted or cannot diagnose loss.
- PAY-01 receipt construction — payment/partial-refund receipt item fields or item total differ from the operation amount; impact: incorrect fiscal receipt/money record.
- PAY-02 merchant/customer fail-closed — missing merchant VAT/tax facts when required, or missing customer receipt contact, is guessed/defaulted or sent without a receipt instead of refusing before provider call; impact: unlawful/incorrect fiscalization.
- PUSH-01 checked push — non-empty Gitleaks SARIF is not rendered with finding locations, or a failed GitHub Actions check/Gitleaks result still yields checked-push success; impact: secret findings/red checks are hidden behind a false successful push.

Initial kill-set count: **14 named independent faults; 0 killed; 14 unhandled**. Count derivation: BK-01..05 (5) + MUT-01..03 (3) + NTF-01..03 (3) + PAY-01..02 (2) + PUSH-01 (1).

## Evidence and verdicts

### View verdicts

VIEW-01 → FAIL → `find ... | sort -u | wc -l` found 15 active forbidden files, including `d30DisposablePostgres.ts`, `patient-invites-disposable-proof.mjs`, four `deploy/postgres/generated/prod-to-target/*.sql`, five `prod-to-target-cutover*.sql` and four `scripts/prod-to-target-*` gates/tests. This is a reachable A0/disposable/future-cutover path, contrary to the 2026-08-16 B0 owner ruling and this requirement.

VIEW-02 → FAIL → root `package.json:72` maps `pnpm migrate` to DEV-only `migrate-dev.sh --execute`; `deploy/host/deploy-prod.sh:189` invokes it, while that wrapper hardcodes `bcb_webapp_dev`, local DEV env and `bcb_dev_migrator` (`migrate-dev.sh:12-25`). An authorized PROD deploy therefore enters the wrong target contract and fails before restart; `deploy/HOST_DEPLOY_README.md:716` still claims the removed `scripts/migrate-all.sh`, and lines 819-851/920-927 advertise deleted entrypoints/aliases. This violates the internally consistent B0 command/document contract.

VIEW-03 → FAIL → the final tree still contains the four generated PROD-target snapshots, five A→B cutover SQL files and four executable cutover policy/gate scripts counted above, while `HOST_DEPLOY_README.md:819-875` gives their future full-reset workflow. The owner explicitly deferred this machinery until green DEV and TEST.

VIEW-04 → FAIL → `deploy-test.sh:30-35` creates/truncates a transcript named only to the second, before the exclusive lock at lines 67-68. Two starts in one second can share/truncate the same log before the loser fails its lock, destroying the running/failing deploy's durable transcript. `bash -n deploy/host/deploy-test.sh` passes and cleanup removes bundle/credential temp state, but the durable-transcript requirement is still violated.

VIEW-05 → PASS → exact anchored scan across all 13 post-B0 webapp migrations returned `acl_statement_hits=0` for `GRANT/REVOKE/OWNER/ROLE/RLS/POLICY`; each forward carries declaration ownership metadata and schema/function behavior only.

VIEW-06 → FAIL → `git ls-files 'runs/**'` still finds five tracked runtime report/result artifacts (`runs/clickthrough/out/*`, `runs/g4_app_walk/G4_APP_WALK_TEST_REPORT.md`, two Stryker reports), and the worker committed the live identity/config debug probe `runs/dev-interactive-audit/payment-config-inspect.mjs`, which logs fiscal settings at lines 39-59. Ignore rules for new `out/` do not remove already tracked output/debug evidence.

VIEW-07 → PASS → `IntegratorWebPushDeliverySettings` exposes only `webPushVapidValueJson` and scalar `vapidSubject`; `pgIntegratorWebPushDelivery.readDeliverySettings` reconstructs only those fields, and migration 0012 returns only `web_push_vapid` plus a validated `mailto:` derived from SMTP `from`, never the SMTP envelope/password.

VIEW-08 → PASS → `PLAN.md:423-426` explicitly says `DEV not green`, supersedes the prior readiness statement and leaves TEST untouched; `EXECUTION-MATRIX-2026-08-16.md:58-79` records the latest login failures and says the artifact is not PASS/unexecuted.

VIEW-09 → PASS → canonical redacted full-history command `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --report-format sarif ...` scanned 7,271 commits / 183.53 MB with exit 0 and exactly 0 SARIF findings; diff inspection found no cookie/data dump/live credential.

VIEW-10 → PASS → `git rev-parse HEAD^` is the exact requested base `2e8ffe851...` and worker HEAD is `609a19f94...`; before audit edits, status contained only ten root-owned character-device env mounts (`stat`: character special file, mode 666) and no ordinary worker residue.

### Behavior verdicts

BK-01 → PASS → new public canonical-create acceptance test rejects a resolved in-person context from another organization; fault `disable orgId != inPersonCtx.organizationId guard` made that promise resolve and the assertion red under `pnpm --dir apps/webapp exec vitest --run src/modules/patient-booking/catalogRemovalB14.unit.test.ts`.

BK-02 → PASS → fault `persist canonicalAppointmentId=null after successful create` made the existing create/readback assertion red (`expected APPOINTMENT_ID, received null`) with the same catalog-removal command.

BK-03 → PASS → fault `reschedule event patientPushVariant='rescheduled' → null` made `service.d14.test.ts:181` red under `pnpm --dir apps/webapp exec vitest --run src/modules/patient-booking/service.d14.test.ts`.

BK-04 → PASS → fault `cancel event patientPushVariant='cancelled' → null` made both cancellation lifecycle assertions red under the same service command.

BK-05 → BLOCKED → forward migration 0001 rewrites the B0 capability from `slot_start` to `slot_end > p_now` / `slot_end <= p_now`, but no non-DB public behavior test executes that function and the brief forbids DB use; no kill was obtained. This remains a named DEV/TEST verification gap, not a claim that the source condition is wrong.

MUT-01 → BLOCKED → source routes scope through `getInstanceForPatient(patientUserId, instanceId)` and return the appended message, but the only whole mutation/readback proof is the unexecuted live patient regression script; no permitted non-DB test killed wrong-patient/org or lost-readback behavior.

MUT-02 → PASS → fault `warmup runMutation bypasses runWithMechanicWriteClearance` made the asynchronous clearance assertion red under `pnpm --dir apps/webapp exec vitest --run src/app-layer/reminders/patientWarmupReminderMutationGuard.test.ts`.

MUT-03 → BLOCKED → create/PATCH routes return normalized reminder rows and existing tariff tests prove denied writes never execute, but no mutation→authorized-readback test exists and the live scenario was not run; no kill was obtained.

NTF-01 → PASS → new acceptance tests cover both patient messages and program notes; fault `replace patient-organization profile IDs with global staff fallback` made both tests red under `pnpm --dir apps/webapp exec vitest --run src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts`.

NTF-02 → PASS → fault `globalNotificationsEnabled always true` selected disabled Telegram in addition to enabled/available MAX, making both acceptance tests red (`relay calls 2, expected 1`) under the same command.

NTF-03 → PASS → new dispatch acceptance assertion requires one successful `delivery.attempt.log`; fault `return before writePort.writeDb` made it red (`0 calls, expected 1`) under `pnpm --dir apps/integrator exec vitest --run src/infra/adapters/dispatchPort.test.ts`.

PAY-01 → PASS → fault `receipt item amountMinor + 1` made the existing provider-call receipt assertion red (`10001`, expected `10000`) under `pnpm --dir apps/webapp exec vitest --run src/modules/payments/service.test.ts`.

PAY-02 → PASS → new fiscal acceptance assertions require throws for absent VAT and customer email; fault `return undefined instead of fail closed` made the missing-VAT assertion red under `pnpm --dir apps/webapp exec vitest --run src/modules/payments/bookingPaymentSettings.unit.test.ts`.

PUSH-01 → PASS → new Node acceptance test uses a one-finding redacted SARIF and fake local `git`/`gh` (no push/network); compound seam fault `drop SARIF results + exit 0 after failed run` made both assertions red under `node --test scripts/checked-push-security.test.mjs`.

Kill-set result: **14 named faults = 11 killed, 3 unhandled/BLOCKED (BK-05, MUT-01, MUT-03)**. Derivation: BK 4/5 + MUT 1/3 + NTF 3/3 + PAY 2/2 + PUSH 1/1 = 11/14. The three unhandled items require named DEV/TEST behavior evidence or a DB-independent public-layer test; they are not represented as green.

### Validation and final verdict

- `node scripts/check-b0-migration-baseline.mjs` → PASS (`B0 roots + 13 webapp + 0 integrator forwards`), but its scope does not detect the active disposable/PROD-target machinery above.
- `bash -n deploy/host/deploy-test.sh` → PASS.
- `node --test runs/dev-interactive-audit/gate-utils.test.mjs runs/dev-interactive-audit/reversible-cycle.test.mjs` → 13/13 PASS.
- `pnpm --dir apps/webapp typecheck` → PASS after local offline dependency linking and required workspace-package builds.
- Targeted webapp/integrator baselines and all added acceptance tests → 34/34 webapp, 33/33 integrator and 15/15 Node PASS after fault reversion; each killed fault produced the red assertion recorded above.
- Full-history Gitleaks → 0 findings; full CI, live DEV, TEST, databases and services were not run/touched.

Final verdict for worker commit `609a19f94` → **FAIL**. MUST FIX handoff:

1. Remove all active A0/disposable/historical and premature PROD A→B0 machinery from checkout; do not restore historical CI. Extend the B0 checker to cover executable non-migration paths without source-text pinning.
2. Separate/fix the root migration command so `deploy-prod.sh` cannot call the DEV-only wrapper; make package commands and host documentation name only real entrypoints.
3. Remove or explicitly archive the stale executable full-reset/cutover instructions and deleted aliases in `HOST_DEPLOY_README.md`.
4. Acquire the TEST deploy lock before allocating the transcript, and use collision-safe transcript creation so concurrent starts cannot truncate evidence.
5. Remove tracked runtime outputs and the committed identity/config debug probe; keep only ignored runtime output locations and intentional non-identity harness code.

All temporary production-code fault injections were reverted before final validation. The transition does not claim DEV or TEST green.
