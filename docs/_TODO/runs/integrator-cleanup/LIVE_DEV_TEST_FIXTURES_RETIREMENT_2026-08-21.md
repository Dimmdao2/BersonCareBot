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
