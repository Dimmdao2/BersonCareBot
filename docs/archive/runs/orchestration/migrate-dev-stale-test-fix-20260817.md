# migrate-dev stale test fix — 2026-08-17

## Scope and authority

- Bounded change: repair the stale `deploy/host/migrate-dev.test.mjs` fixture/oracle only.
- Canon: `AGENTS.md` §1 migration rules, §10a–b and §24; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §1; `deploy/HOST_DEPLOY_README.md` §DEV code-only and schema migration.
- No database, DEV/TEST/PROD runtime, environment, deploy, push or production wrapper was changed.

## Proven cause

The initial command

```text
node --test deploy/host/migrate-dev.test.mjs
```

returned 8 passed / 1 failed. The only failure expected a `d30-outgoing-delivery-queue` child call after the second integrator migration.

`git diff --unified=80 609a19f94^ 609a19f94 -- deploy/host/migrate-dev.sh deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql` proves that B0-forward salvage commit `609a19f94` deliberately removed the separate D30 artifact/executor together with the historical migration path. `git blame -L 225,242 -- deploy/host/migrate-dev.test.mjs` shows that the fixture and expectation still came from pre-B0 commit `bc3d43cd0`; the test was not updated when the wrapper changed.

The current documented contract is:

1. install and verify the shared-role declaration baseline;
2. run integrator migrations before `20260708` as `app_object_owner`;
3. run B0-forward webapp Drizzle through `bcb_dev_migrator` and declared owners;
4. run remaining integrator migrations;
5. reconcile and catalog-audit the declaration;
6. update both runtime capability projections.

## Change

- Removed only the obsolete D30 SQL fixture.
- Replaced the stale D30 expectation with assertions over the wrapper's observable child-command sequence.
- Added exact checks for the early integrator `--before-date 20260708` phase and absence of that bound on the remaining integrator phase.
- Kept the existing stationary migrator, exact-owner, no-runtime-login and no-secret-leak assertions.

## Validation

```text
node --test deploy/host/migrate-dev.test.mjs
PASS: 9/9

node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
PASS: 4/4

node --test scripts/check-b0-migration-baseline.audit.test.mjs
PASS: 2/2

node scripts/check-b0-migration-baseline.mjs
PASS: B0 roots + 18 webapp and 0 integrator forward migrations; no legacy chain

bash apps/webapp/scripts/check-drizzle-journal-sync.sh
PASS: transaction-safe layout and journal sync OK

bash -n deploy/host/migrate-dev.sh
PASS

pnpm exec prettier --check deploy/host/migrate-dev.test.mjs
PASS

pnpm exec eslint deploy/host/migrate-dev.test.mjs
PASS

git diff --check
PASS
```

The clone had no installed dependencies. The journal, Prettier and ESLint checks reused the already installed dependency trees from the canonical local repository through temporary symlinks; both symlinks were removed by an `EXIT` trap. No application/runtime state was used.
