# Retirement of live DEV/TEST fixtures — evidence, 21.08.2026

## Result

Repository wiring that seeded, reconciled, required or mutated persistent live DEV/TEST fixture data was removed.
The canonical rule is `AGENTS.md` §1b: use the owner's existing registered clinics/accounts; a behavioral
mutation is allowed only in a guaranteed-rollback transaction that leaves no fixture entity behind.

Removed paths include the SaaS walkthrough seeder/reconciler/packet, TEST fixture deploy gates and SQL overlays,
the DEV-bypass DB fixture writers, and the fixture-only lifecycle/scenario scripts and package entry points.
No database, service, deployment, migration ledger, applied migration, delivery-log mechanism, protected packet,
or `/opt` state was touched.

## Commands and results

| Command | Exit | Result |
|---|---:|---|
| `node /home/dev/brain/tools/code-search.mjs 'persistent TEST fixture seeder reconciler scenario overlay' --repo bcb -k 30` | 0 | The index was from before this edit; it correctly identified former surfaces and historical records. Filesystem state is established by the exact `rg` below. |
| `node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/webapp/package.json','utf8')); console.log('package-json: OK')"` | 0 | Both modified package manifests parse. |
| `bash -n deploy/host/deploy-test-saas.sh` | 0 | TEST deploy shell syntax is valid. |
| `node --check deploy/host/test-visual-global-admin-session.mjs` | 0 | Modified session helper parses. |
| `node --test deploy/postgres/privileges/function-census.test.mjs` | 0 | 18 passed, 0 failed. |
| `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check` | 0 | DEV/TEST generated privileges and allowlists match declarations byte-for-byte. |
| `pnpm --dir apps/webapp typecheck` | 2 | Blocked by missing workspace dependencies (`node_modules` absent): unresolved `drizzle-orm`, `react`, `luxon`, Node types and others. No task-specific diagnostic was reachable. |
| `git diff --check` | 0 | No whitespace errors. |

## Exact live-fixture census

Command (exit 0):

```bash
rg -l -i '(seed-saas-test-walkthrough|reconcile-saas-test-walkthrough|saas-test-fixture-packet|saas-product-smoke-fixture|test-saas-isolation-telemetry-fixtures|run-saas-isolation-test-scenarios|patient-organization-test-lifecycle|u5a-patient-organization-test-lifecycle|dev-c2-dev-bypass-fixture|saas_isolation_test_scenario)' --glob '!docs/archive/**' --glob '!docs/**/audit/**' --glob '!docs/**/evidence/**' --glob '!docs/**/log.md' . | sort
```

Remaining matches are not live-DB mechanisms:

- `docs/ARCHITECTURE/SECURITY_CANON.md` and `docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md` explicitly
  record the 21.08 removal/obsolete status and point to `AGENTS.md` §1b.
- `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` contains a labelled superseded historical block;
  `SAAS_ENFORCE_ROADMAP.md` contains completed historical evidence.
- `docs/REPORTS/**`, audit queues, findings, logs and `docs/_TODO/runs/**` are historical/audit/evidence records.

No remaining result is an active seeder, reconciler, fixture packet, deploy gate, SQL overlay, package entry point,
or live DEV/TEST fixture instruction. Ordinary unit/in-memory fixtures remain outside this census. No rollback-only
probe was added or changed.

## Pass 2 — remaining active authenticated dev-bypass tail, 21.08.2026

Scope per `LIVE_FIXTURE_RETIREMENT_ACTIVE_BYPASS_TAIL_FIX_BRIEF_2026-08-21.md`: the previously-accepted audit and
live-gate environment failure already established the census method; this pass closes the four residual items it
named plus what the same exact-path re-census on `/api/auth/dev-bypass|dev%3A|dev:doctor|dev:admin|dev:clinic-admin|dev:client`
turned up beyond that list.

### Changed paths

1. `docs/ORCHESTRATION_BINDINGS.md` — replaced the executable `dev-bypass?token=dev%3Adoctor` curl runbook with a
   pointer to `AGENTS.md` §1a ordinary owner login; no second login runbook was written.
2. `scripts/take-baseline-screenshots.sh` — deleted. Tracked temp QA artifact (its own header says "DO NOT COMMIT");
   `rg` found zero callsites anywhere in the tree before deletion.
3. `docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs` and
   `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-write-actions.mjs` — deleted. Both `--auth=dev-bypass` scripts
   had no `package.json` wiring and no unchecked plan checkbox naming either script; every remaining textual mention
   is inside completed historical logs/audits (`NIGHT_PLAN_2026-07-26.md`, `DB_PRIVILEGE_LAYER_REBUILD/AUDIT_LOG.md`)
   or a cutover-audit file whose own top section records it `DONE` (`audits/CUTOVER_COMPLETENESS_AUDIT_2026-08-15.md`),
   left unchanged.
4. Active unchecked acceptance/instruction normalization (ordinary login of the existing owner account replaces the
   `dev:*` token reference; no new account/fixture/cookie was invented):
   - `.cursor/plans/doctor_communications_client_shell.plan.md` (in-progress Этап 7.B, two spots)
   - `docs/SUBSCRIPTION_INITIATIVE/ROADMAP.md` (unchecked ST-03 acceptance row)
   - `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` (unchecked DEV-smoke row)
   - `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` (four `DONE repository / owner pending` acceptance rows:
     UI-1, UI-1a, UI-1c, UI-4a — owner live acceptance is still open, so these are active instructions, not history)
   - `docs/README.md` — the index blurb for `LOCAL_DEV_AND_AGENT_TESTING.md` still named "dev-bypass" as a topic;
     that canonical doc no longer mentions it (`rg` confirms zero matches), so the blurb was stale and is corrected
     to "обычный вход owner-учёток".
   - `docs/DOCTOR_UI_REBUILD_REVIEW/PATIENT_PAGE_BUILD_PLAN.md` — inspected; its one match is inside a dated
     "VERIFIED STATE (2026-06-14)" historical log entry, left unchanged.
5. `runs/dev-interactive-audit/{run.mjs,scenarios.mjs,README.md}` — found by the same exact-path re-census, not
   named in the brief. This tracked, actively-documented live-gate harness (dated 2026-08-16, `README.md` describes
   it as current) had an opt-in `DEV_AUDIT_ALLOW_SYNTHETIC=1` fallback that issued
   `GET /api/auth/dev-bypass?token=dev%3A<role>` when no real credential/session was supplied. Removed the fallback
   branch, the `allowSynthetic` flag and the three `syntheticToken` scenario fields; a role now fails closed
   (`actual_<role>_auth_missing`) with neither a real session cookie nor `DEV_AUDIT_PASSWORD`. README updated to
   match. Left `EXECUTION-MATRIX-2026-08-16.md` unchanged — it is a dated report of a specific past run ("this
   artifact is not current evidence and is not a PASS"), not an active instruction.

### Exact re-census (after the above changes)

```bash
rg -n "dev-bypass|dev%3A|dev:doctor|dev:admin|dev:clinic-admin|dev:client" -i \
  --glob '!docs/archive/**' --glob '!docs/**/audit/**' --glob '!docs/**/evidence/**' \
  --glob '!docs/**/LOG.md' --glob '!docs/**/log.md' .
```

Remaining matches are exclusively: (a) past-tense "Verified live"/"проверено живьём" entries inside dated
initiative/report/audit files (`DOCTOR_UI_REBUILD_REVIEW/*`, `docs/REPORTS/**`, `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/**`,
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/**`, `docs/_TODO/runs/**`, `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`,
`docs/_TODO/OWNER_LIVE_PASS_2026-08-18.md`, `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`,
`apps/webapp/src/app/app/doctor/communications/LOG.md`, etc.) that record how a past check was performed; (b) this
brief and the prior audit/result/retry-brief files under `docs/_TODO/runs/integrator-cleanup/`, which are themselves
evidence records of this retirement; (c) `docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md` and
`docs/ARCHITECTURE/SECURITY_CANON.md`, which explicitly record the 21.08 removal as `УСТАРЕЛО/ЗАМЕНЕНО`; (d) the
one dated `EXECUTION-MATRIX-2026-08-16.md` report noted above; (e) `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md`
and `docs/_TODO/ROLE_LOGIN_CONSOLIDATION_AUDIT_2026-08-02.md`, which describe the route's server-side hard-gate
(`isDevAuthBypassEnabled`) as a fact, not an instruction to use it. None is an active rule, runbook, plan, or
runnable authenticated `dev-bypass`/`dev:*` path.

### Commands and results

| Command | Exit |
|---|---:|
| `node --check runs/dev-interactive-audit/run.mjs` | 0 |
| `node --check runs/dev-interactive-audit/scenarios.mjs` | 0 |
| `git diff --check` | 0 |
| `rg -rn "take-baseline-screenshots.sh\|walk-app-pages-no-redirect.mjs\|smoke-patient-write-actions.mjs" --include=*.json --include=*.sh --include=*.mjs .` | no matches (no dangling caller) |

No DEV/TEST/PROD access, live login, migration, deploy, push or full CI ran in this pass.

## Pass 3 — classify and close the remaining current-plan references, 21.08.2026

Scope per `LIVE_FIXTURE_RETIREMENT_ACTIVE_REFERENCE_CLOSURE_BRIEF_2026-08-21.md`: classify each remaining match
outside `docs/archive/**`, `docs/REPORTS/**`, audit/evidence/log artifacts and completed `[x]` historical records,
naming the four files it calls out plus active SAAS roadmap/checklists in general.

### Files inspected and classification

- `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md` — the ST-03 checklist itself is already
  historical `[x]` evidence except one open Live-TEST box; but its "Визуальный сценарий" section still named
  `dev:admin` as the preliminary DEV entry. **Changed:** replaced with ordinary owner admin-account login
  (`AGENTS.md` §1a).
- `docs/_TODO/audits/CUTOVER_COMPLETENESS_AUDIT_2026-08-15.md` — inspected in full. The `Closure update`
  block is a past-tense record of a completed run (`DONE`). The two `fixture`-word hits are (a) past-tense
  "target fixtures" inside that closed run and (b) a risk-matrix line describing reversible synthetic-organization
  mutation with "штатным API/fixture cleanup" — compliant with the AGENTS.md §1b/3 rollback-transaction allowance,
  not a persistent-fixture instruction. **Left unchanged**, historical/compliant.
- `docs/_TODO/NIGHT_PLAN_2026-07-26.md` — every `fixture` hit is inside a dated 2026-07-25/26 session log entry
  describing a specific past smoke-fixture staleness finding and an owner-authorized past action. **Left
  unchanged**, historical.
- `docs/DOCTOR_UI_REBUILD_REVIEW/PATIENT_PAGE_BUILD_PLAN.md` — re-inspected; its one `dev-bypass?token=dev:doctor`
  match is inside the dated "VERIFIED STATE (2026-06-14 ~05:00)" status-log entry describing how that past
  verification was run. **Left unchanged**, historical, consistent with the prior pass's classification.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md` — an unexecuted (`0/31` checked), still-open TEST
  walkthrough procedure whose entry section instructs a future persistent-fixture Clinic A/B: seed/reconcile via
  a "hard wrapper repo-managed fixture step" and reading two email+password pairs from a protected
  `/opt/env/bersoncarebot/saas-test-fixture.env`. This is exactly the future persistent-fixture/authenticated-preset
  instruction the oracle targets, and it is already superseded by a later owner decision recorded canonically in
  `HARD_MIGRATION_PROTOCOL.md` ("Fixture-based A1/product smoke выведен из deploy решением владельца 30.07.2026
  ... Role checks use the already registered owner accounts and clinics; no fixture packet or reconciliation
  window exists"). **Changed:** added a top-of-file УСТАРЕЛО/ЗАМЕНЕНО note pointing to that canonical decision and
  `AGENTS.md` §1a/§1b, mirroring the same idiom already used in `OWNER_READY_TEST/ROADMAP.md`. The body's fixture
  steps are left as retained historical-design text, not executed or rewritten into a new procedure.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` (active SAAS roadmap) — the "Overall acceptance commands
  for the current path" block and two open D3 checkboxes instructed running `pnpm run smoke:saas-product` /
  `check:saas-product-smoke-contract` against `/run/bersoncarebot/saas-smoke.fixture`, but
  `check-saas-product-smoke-contract.mjs`, `scripts/smoke-saas-product.mjs` and
  `saas-product-smoke-contract.json` no longer exist on disk (confirmed by `ls`/`rg`) and neither `smoke:saas-product`
  nor `check:saas-product-smoke-contract` exist in `package.json`. **Changed:** marked the acceptance-commands
  block and the two dead-script checkboxes УСТАРЕЛО/ЗАМЕНЕНО, pointing to the same `HARD_MIGRATION_PROTOCOL.md`
  decision, without altering any other line in that file (all other `[x]`/`[ ]`/superseded-phase text — including
  the still-live `check:saas-d3-4-bootstrap-base-login-grants` RED finding — left exactly as-is).
- All other `fixture`/`dev-bypass`/`dev:*` matches surfaced by the repo-wide re-census below were inspected and
  fall into: unit/scratch test fixtures meaning local test input (not touched, per acceptance), already-superseded
  historical blocks (`HARD_MIGRATION_PROTOCOL.md`'s own labelled SUPERSEDED section, `SAAS_ENFORCE_ROADMAP.md`
  Phase B2/C0 historical blocks), completed `[x]` rows, or dated audit/report/log records under `docs/REPORTS/**`,
  `docs/_TODO/runs/**` and `.md` LOG files, all out of this pass's in-scope classification set.

### Flagged, not touched (outside this brief's line-edit mandate)

- `runs/clickthrough/` (`lib/fixtureAuth.mjs`, `seed-lfk-complex-for-owner-patient.mjs`, `smoke-auth-check.mjs`,
  flows) is a live Playwright click-through tool that reads session cookies for four roles from
  `/run/bersoncarebot/saas-smoke.fixture` via `sudo -n cat`. This is the same operator fixture path
  `HARD_MIGRATION_PROTOCOL.md` records as retired from deploy/runtime closure. Whether the underlying accounts are
  real registered owner accounts (a periodically-refreshed session-cookie cache, compliant) or a synthetic
  fixture set requires an owner/architecture decision and touches a multi-file executable tool, not a single
  contradicting line — outside this brief's scope (`Не строить replacement helper/runbook/seed`,
  `без расширения соседнего product scope`). Left unmodified; flagged here so it is not silently missed.

### Exact re-census (after the above changes)

Command (exit 0):

```bash
rg -n "dev-bypass|dev%3A|dev:doctor|dev:admin|dev:clinic-admin|dev:client" -i \
  --glob '!docs/archive/**' --glob '!docs/**/audit/**' --glob '!docs/**/evidence/**' \
  --glob '!docs/**/LOG.md' --glob '!docs/**/log.md' .
```

Remaining matches are the same historical/audit/evidence/completed classes already documented in Pass 2, plus this
file itself and the closure/fixer briefs under `docs/_TODO/runs/integrator-cleanup/`, which are evidence records of
this retirement.

### Commands and results

| Command | Exit | Result |
|---|---:|---|
| `node /home/dev/brain/tools/code-search.mjs "persistent fixture seed reconcile authenticated preset dev bypass" --repo bcb -k 30` | 0 | Surfaced the four brief-named files plus `SAAS_ENFORCE_ROADMAP.md`/`SAAS_S3_TEST_WALKTHROUGH.md`; each inspected above. |
| `ls docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-product-smoke-contract.mjs` | 2 (no such file) | Confirms the D3/Overall-acceptance script is dead. |
| `ls docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json` | 2 (no such file) | Confirms the contract JSON is dead. |
| `grep -n "smoke:saas-product\|check:saas-product-smoke-contract" package.json apps/webapp/package.json` | 1 (no match) | Confirms neither script exists in either manifest. |
| `grep -n -i "dev-bypass\|dev%3A\|dev:doctor\|dev:client\|dev:admin\|dev:clinic-admin" apps/webapp/src/modules/auth/service.ts` | 1 (no match) | The dev-bypass code path itself is gone (superseded independent-audit F1 already fixed prior to this pass). |
| `node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/webapp/package.json','utf8')); console.log('package-json: OK')"` | 0 | Untouched manifests still parse (no script/code was changed this pass). |
| `git diff --check` | 0 | No whitespace errors. |

No scripts were modified in this pass (only three `.md` files), so no `bash -n`/`node --check` was needed beyond
the manifest parse re-confirmation above.

## Pass 4 — current fixture procedure closure, 21.08.2026

Scope per `LIVE_FIXTURE_RETIREMENT_CURRENT_PROCEDURE_CLOSURE_BRIEF_2026-08-21.md`: close the Pass-3 findings —
`SAAS_S3_TEST_WALKTHROUGH.md`'s old-then-new fixture body, `SAAS_ENFORCE_ROADMAP.md`'s dead fixture command
block and fixture-worded D3/D4 exit/summary lines, the superseded fixture/reconciliation block plus disposable
fixture proof in `HARD_MIGRATION_PROTOCOL.md`, the open S7.3 next-step line, and the Pass-3 "flagged, not
touched" `runs/clickthrough/` tail. This closes that flagged tail; it is not left open again.

### Removed directory

- `runs/clickthrough/` deleted whole (`README.md`, `flows/*.mjs`, `lib/fixtureAuth.mjs`, `run-all.mjs`,
  `run-one.mjs`, `seed-lfk-complex-for-owner-patient.mjs`, `smoke-auth-check.mjs`) — the live click-through tool
  that read four roles' session cookies from `/run/bersoncarebot/saas-smoke.fixture` via `sudo -n cat`. No
  replacement helper/runbook/seed was built.
- One real caller existed outside the directory itself: `runs/dev-interactive-audit/{run.mjs,
  patient-booking-lifecycle.mjs, patient-regressions.mjs, patient-route-crawl.mjs}` imported the generic
  Playwright `chromium` resolver from `runs/clickthrough/lib/browser.mjs` (not a fixture file — no
  `saas-smoke.fixture`/credential logic, just `npm root -g` resolution). That file was moved to
  `runs/dev-interactive-audit/lib/browser.mjs` (its only remaining consumer), the four import paths updated to
  `./lib/browser.mjs`, and its unused `BASE_URL`/`CLICKTHROUGH_BASE_URL` export (dev-interactive-audit has its
  own `DEV_AUDIT_BASE_URL`) and the stale doc-comment pointer to the deleted `clickthrough/README.md` were
  dropped. This is a relocation of a shared non-fixture utility, not a new harness.

### Current-doc corrections

- `SAAS_S3_TEST_WALKTHROUGH.md` — replaced the old-then-new banner-over-fixture-body with one positive
  procedure: entry uses the two already-registered owner clinics and ordinary email+password login; the
  `run-manifest.md` records the actually observed picture instead of an expected fixture manifest v2 count; the
  screen-walk steps and classification section no longer assert fixed fixture counts/pictures, no fixture
  packet cross-reference, and empty clinic state is recorded as legitimate rather than a gap to fill.
- `SAAS_ENFORCE_ROADMAP.md` — deleted the dead `smoke:saas-product --fixture-file=/run/bersoncarebot/saas-smoke.fixture`
  command block under "Overall acceptance commands for the current path" entirely (previously kept "for
  provenance only"); corrected the open D3 Exit line and the D4 open checkbox/Exit line and the D3/D4
  phase-status-table "Missing for roadmap exit" cells to read against the already registered owner accounts and
  clinics with a guaranteed-rollback mutation probe, instead of an "operator-managed fixture"/"fixture cleanup"
  requirement. Closed `[x]`/`[-]` historical rows and unrelated phases (A1, C3, C4, B2, C0 …) were left
  untouched.
- `HARD_MIGRATION_PROTOCOL.md` — removed the "SUPERSEDED HISTORICAL BLOCK — DO NOT EXECUTE" fixture-seeder
  contract (secret packet path/keys, manifest v2 shape, transactional reconciliation, temporary BYPASSRLS grant)
  and the immediately-following patient-identity fixture-capability-gate paragraph, replacing both with one short
  current-rule paragraph (no seed/reconcile/require of persistent fixture data; existing owner accounts/clinics;
  guaranteed-rollback mutation probe). Also removed the disposable-DB "fresh walkthrough-fixture convergence
  proof" (`--prove-test-fixture`) paragraph from the DEV/disposable dormant-wrapper section. The current named
  DEV→TEST route (steps 1–11, "CURRENT runtime gates" paragraph, static validation) was left intact.
- `S7_3_TEST_LADDER_RUN.md` — replaced only the open forward-looking "Не снято" next-step line's
  `owner UI-login (fixture packet или smoke refs)` with an ordinary owner UI-login instruction and no fixture
  packet. The 31.07/05.08 past-tense FAIL evidence (including its `saas-test-fixture.env`/`seed:saas-test-walkthrough`
  attempt log) was left unchanged, as directed.

### Remaining matches, by class (after the above changes)

Command (exit 0):

```bash
rg -n -i "saas-smoke\.fixture|saas-test-fixture\.env|SAAS_TEST_FIXTURE_[A-Z_]+|fixture.*(seed|reconcil|packet)|disposable fixture proof" \
  docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md \
  docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md
```

Six remaining lines, all compliant, none executable/instructional:

- `S7_3_TEST_LADDER_RUN.md:63,185,188,191` — past-tense 05.08 FAIL-evidence log of the abandoned fixture-seed
  attempt (kept per brief: preserve honest past FAIL evidence);
- `S7_3_TEST_LADDER_RUN.md:218` — the corrected next-step line itself, stating no fixture packet is used;
- `HARD_MIGRATION_PROTOCOL.md:572` — "no fixture packet or reconciliation window exists" (explicit negative
  statement, not an instruction to create one);
- `HARD_MIGRATION_PROTOCOL.md:583` — "`saas-smoke.fixture` не является входом миграции" (explicit negative
  statement recording the 30.07 owner decision).

`rg -n "runs/clickthrough" --glob '!runs/clickthrough/**' .` (run before deletion, exit 0): only the four
brief/queue documents named in this pass's own scope line and the Pass-3 entry above referenced the path; no
`package.json` script, import outside `runs/dev-interactive-audit/*.mjs` (fixed above), or open checkbox did.
`git ls-files runs/clickthrough` is empty after the `git rm -r`.

### Commands and results

| Command | Exit | Result |
|---|---:|---|
| `rg -n "runs/clickthrough" --glob '!runs/clickthrough/**' .` (pre-deletion) | 0 | Found the four real import lines in `runs/dev-interactive-audit/*.mjs` plus doc-only mentions; no other caller. |
| `node --check runs/dev-interactive-audit/run.mjs` | 0 | Parses after import-path fix. |
| `node --check runs/dev-interactive-audit/patient-booking-lifecycle.mjs` | 0 | Parses after import-path fix. |
| `node --check runs/dev-interactive-audit/patient-regressions.mjs` | 0 | Parses after import-path fix. |
| `node --check runs/dev-interactive-audit/patient-route-crawl.mjs` | 0 | Parses after import-path fix. |
| `node --check runs/dev-interactive-audit/lib/browser.mjs` | 0 | Relocated resolver parses. |
| `git ls-files runs/clickthrough` | 0 (empty output) | Directory fully untracked. |
| `git diff --check` | 0 | No whitespace errors. |

NOT DONE: platform-merge rebuild / ordinary owner-login live gate / landing / TEST deploy / push / full CI.
