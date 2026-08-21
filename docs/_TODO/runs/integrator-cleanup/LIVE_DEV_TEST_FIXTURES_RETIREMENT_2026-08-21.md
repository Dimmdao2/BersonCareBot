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
