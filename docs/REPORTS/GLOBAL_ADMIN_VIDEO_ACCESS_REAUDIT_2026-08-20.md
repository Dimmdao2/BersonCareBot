# Re-audit: GA video limits and global paid access — 20.08.2026

Branch: `wt/global-admin-video-access-20260820`

Audited SHA: `32779bfc82ef1e7b1daed10b93de46e29c1b5a79`

Comparison base: `aeaa9344ec565fefa859a0855806ffed0206306a`

Authority:

- `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/STAGE_01_ANALYTICS.md` GA-L-01/GA-L-02;
- `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` #1069;
- `docs/REPORTS/GLOBAL_PAID_ACCESS_AUDIT_2026-08-20.md`.

## Verdicts

- **A — PASS.** Killed **3**, missed **0**. All three named write bypasses have executable
  oracles and each oracle turned red under its corresponding fault injection. The previously
  absent legacy `body_html` case was added by this audit.
- **B — FAIL.** Behavioral defects killed **2**, missed **0**, but the required sanctioned DEV
  migration route is red: `migrate-dev.sh --execute` exits 1 in the mandatory privilege reconcile.
  The migration itself is already present in the ledger with the exact file hash and the live SQL
  access behavior is green; the branch still cannot be accepted while its execute route cannot
  finish.
- Combined behavioral count: **killed 5, missed 0**. Overall branch gate: **FAIL** because B's
  migration execute, webapp typecheck, and zero-warning ESLint are red.

## Finding

### B-F1 — sanctioned DEV migration execute cannot finish

Reachable scenario: the branch is run through the repository-required
`bash deploy/host/migrate-dev.sh --execute`. The pending migration phase reports current, then the
mandatory declaration reconcile stops because
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql` lacks `app_patient` in the generated
`GRANT USAGE ON SCHEMA integrator` actor list (reported line 9552). Exit code: 1.

Impact: the migration/reconcile entrypoint does not reach PASS, so the migration part of B has no
green sanctioned deployment gate even though the ledger row and live behavior are present.

The mismatch is inherited rather than introduced by these nine commits:

```text
$ git diff --name-status feat/doctor-ui-rebuild...HEAD -- scripts/check-s4-entitlement-coverage.ts apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx deploy/postgres/generated/privileges.bcb_webapp_dev.sql deploy/postgres/privileges/declaration.ts
(no output)
exit 0
```

No product fix was made by this audit.

## A — duration limits

### Single chokepoint

The sole business-rule function is
`apps/webapp/src/modules/media/videoDurationLimit.ts::validateVideoAttachmentDuration`.
It owns both thresholds (`exercise=600`, `cms=1200`), pending-probe refusal, over-limit refusal,
and the non-video early return.

Its only direct production caller is
`apps/webapp/src/modules/media/service.ts::getVideoAttachmentDurationRejection`. All production
write callers of that port, measured by
`rg -n "getVideoAttachmentDurationRejection" apps/webapp/src --glob '!**/*.test.*'`, are:

1. `apps/webapp/src/app/app/doctor/exercises/actionsShared.ts:125` — shared ordinary exercise and
   bulk-create path (`exerciseVideoDurationRejection`, purpose `exercise`);
2. `apps/webapp/src/app/app/doctor/content/actions.ts:132` — CMS `video_url`, `body_md`, and legacy
   `body_html` path (purpose `cms`);
3. `apps/webapp/src/modules/treatment-program/instanceEditorBatchApply.ts:321` — personal exercise
   editor-batch path (purpose `exercise`).

No second implementation of the thresholds or duration comparison was found.

### Kill-set and fault injection

1. CMS Markdown and legacy HTML:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=unit src/app/app/doctor/content/sections/actions.entitlement.unit.test.ts -t "CMS Markdown editor|legacy CMS HTML"
# injection: remove body_md/body_html from the attachment scan
2 failed, 5 skipped
exit 1
```

Both assertions observed `{ok:true}` instead of the required 20-minute refusal. The injection was
reverted. The legacy HTML assertion is the audit-added oracle.

2. Personal exercise editor-batch:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/treatment-program/instanceEditorBatchVideoDuration.unit.test.ts
# injection: remove the duration-port call before createIndividualExerciseAndStageItem
1 failed
exit 1
```

The failure showed `rejected:false`, no gate call, and one write call. The injection was reverted.

3. Ordinary exercise arbitrary URL:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=unit src/app/app/doctor/exercises/hostedVideoExerciseSave.unit.test.ts -t "не принимает непробированный absolute URL"
# injection: remove the API_MEDIA_URL_RE refusal
1 failed, 6 skipped
exit 1
```

The injected `https://cdn.example.com/overlong-video.mp4` was saved successfully. The injection was
reverted.

Whole central rule removal:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/media/videoDurationLimit.unit.test.ts
# injection: validateVideoAttachmentDuration always returns {ok:true}
2 failed, 3 passed
exit 1
```

The 601/1201-second and pending-probe assertions turned red. The non-video assertion remained green,
which independently proves that images are outside the gate. The injection was reverted.

Final A suite:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/media/videoDurationLimit.unit.test.ts src/app/app/doctor/exercises/hostedVideoExerciseSave.unit.test.ts src/modules/treatment-program/instanceEditorBatchVideoDuration.unit.test.ts src/app/app/doctor/content/sections/actions.entitlement.unit.test.ts
4 files, 20 passed
exit 0
```

## B — global paid access

### Migration

File:
`apps/webapp/db/drizzle-migrations/20260820T175432_paid_period_global_access_authority.sql`.

- `wc -l ...` → `164`, exit 0.
- Name/owner/verify gate:
  `bash apps/webapp/scripts/check-drizzle-migration-order.sh` → OK, exit 0.
- Privilege gate: `node scripts/check-migration-privileges.mjs` → OK for 14 files, exit 0.
- Exact prohibited-token check:
  `! rg -n -i "\\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\\b" <migration>`
  → no output, exit 0.
- Leading headers are present in parser order:
  `BCB-MIGRATION-OWNER`, `BCB-MIGRATION-SCHEMA-CREATE`,
  `BCB-MIGRATION-LANGUAGE-USAGE`, `BCB-MIGRATION-VERIFY`.
- VERIFY reads the changed cabinet function definition and requires the migration's
  `global_paid_period` marker. Both function rewrites are one atomic `DO` statement whose internal
  anchor checks abort the statement if either rewrite cannot be made.

The isolated clone initially lacked `.env` and `apps/webapp/.env.dev`:

```text
$ bash deploy/host/migrate-dev.sh --preflight
FATAL: DEV API env path guard failed
exit 1
```

After copying the two canonical DEV env files as temporary regular files without printing their
contents (both were deleted after the DB checks):

```text
$ bash deploy/host/migrate-dev.sh --preflight
pending=0 total=13 verified-objects=25 foreign-ledger-rows=0
migrate-dev preflight: PASS
exit 0

$ bash deploy/host/migrate-dev.sh --execute
Drizzle owner-ordered migration already current: pending=0 total=13 verified-objects=25
privileges.bcb_webapp_dev.sql diverged from declaration at line 9552
exit 1
```

Ledger fact and exact file hash:

```text
$ sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "SELECT tag, left(hash, 12), created_at FROM drizzle.__drizzle_migrations WHERE tag = '20260820T175432_paid_period_global_access_authority';"
20260820T175432_paid_period_global_access_authority|63aedb1f4c3e|1800000079000
exit 0

$ sha256sum apps/webapp/db/drizzle-migrations/20260820T175432_paid_period_global_access_authority.sql
63aedb1f4c3eabb3b4e8459da305a0a8c4dc8a596dfcb07b11f6b9f35e17d76b
exit 0
```

### Claimed defects and fault injection

The audit added the missing live `read_only`/`blocked` precedence scenario to the existing DEV
proof. It exercises both `app.resolve_organization_cabinet_access` and
`app.resolve_organization_mechanic_access` against a tariff whose local policy starts with grace.

```text
$ RUN_GLOBAL_PAID_PERIOD_ACCESS_DB=1 INJECT_LOCAL_TARIFF_OVERRIDE=1 node --test --test-name-pattern="global read_only and blocked override" deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs
# transactional injection removed the two global lifecycle precedence branches
expected cabinet|read_only, received cabinet|grace; mechanic|grace|...|true
exit 1
```

The injection was inside the proof transaction and rolled back; its temporary harness code was
also removed.

Patient-create mutation door:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/doctor/clients/route.route.test.ts
# injection: remove requireEntitlementForMutation(gate.ctx) from POST
3 failed, 1 passed; read_only and blocked returned HTTP 200
exit 1
```

The route injection was reverted. Final route suite: 4/4 passed, exit 0.

Final live proof:

```text
$ RUN_GLOBAL_PAID_PERIOD_ACCESS_DB=1 node --test deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs
3 passed, 0 failed
exit 0
```

Explicit fixture cleanup query returned
`tariffs=0`, `organizations=0`, `accounts=0`, `subscriptions=0`, `audit=0`; exit 0.

### Privileges and removed UI

`git diff --name-status feat/doctor-ui-rebuild...HEAD -- deploy/postgres/privileges` lists only:

```text
A deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs
```

Neither `declaration.ts`, `relation-access.ts`, nor generated privilege artifacts are changed by
the branch. The proof contains no GRANT/REVOKE/role/policy statements and each fixture uses
`BEGIN`/`ROLLBACK`; it is evidence, not privilege expansion.

The 81-line UI deletion removes the per-mechanic tariff downgrade editor, its draft state, and its
payload. It does not remove the live system access ladder, the paid-period global selector, or the
organization override selector (`OVERRIDABLE_MECHANICS` remains for that separate surface).
Existing stored backend `downgradePolicies` remain accepted as an optional API field and are
preserved by `updateTariff` when the UI omits the field.

Evidence:

```text
$ pnpm --dir apps/webapp exec vitest --run --project=ui src/app/app/admin/commercial/CommercialConstructorClient.ui.test.tsx
1 file, 12 passed
exit 0

$ pnpm --dir apps/webapp exec vitest --run --project=fast src/infra/repos/trialAccessComputation.test.ts src/modules/org-entitlements/service.test.ts src/modules/treatment-program/instance-service.mechanicWriteClearance.test.ts
3 files, 94 passed
exit 0
```

The UI suite verifies that the system ladder remains usable, downgrade controls are absent, the
submitted tariff payload omits `downgradePolicies`, and the other commercial controls still work.
The service suite verifies omission preserves the stored backend downgrade lifecycle.

## Required gates

Dependencies were absent initially (`node_modules` and `apps/webapp/node_modules` both missing).
`pnpm install --frozen-lockfile` completed with exit 0. Workspace packages required by webapp tests
were built locally; all package builds completed with exit 0.

```text
$ pnpm --dir apps/webapp typecheck
scripts/check-s4-entitlement-coverage.ts(252,6): TS2352 conversion of null to string
exit 2

$ pnpm --dir apps/webapp exec eslint src --max-warnings=0
AppointmentPaymentSection.tsx:72:6 react-hooks/exhaustive-deps warning
AppointmentPaymentSection.tsx:158:11 @next/next/no-img-element warning
exit 1

$ git diff --check
exit 0
```

The typecheck and ESLint failure files are not changed by this branch (empty `git diff --name-status`
shown in B-F1). They remain mandatory branch-level blockers; this audit did not repair out-of-scope
product files.

Temporary fault injections and DEV env copies were removed. No TEST/PROD database, `feat` branch,
merge, push, or runtime role declaration was touched.
