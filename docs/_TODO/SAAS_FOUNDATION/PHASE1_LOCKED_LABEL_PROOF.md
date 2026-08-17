# Phase 1 locked-label proof

Scratch-only proof script:

```bash
node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md
```

Phase 2 reusable artifact successor:

```bash
deploy/postgres/p2-b-protected-principal-context.sql
node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md
```

The Phase 1 script remains the original scratch proof and source assertion matrix. P2-B moves the
same protected-context contract into a reusable deploy/postgres ops SQL artifact. The real signing
secret is still not committed; operators must pass it through the `p2_b_signing_secret` psql variable
or equivalent secret material.

The script uses local PostgreSQL through the same `sudo -n -u postgres psql` scratch pattern as the
existing SAAS smokes. It creates a disposable database named `bcb_saas_*_scratch_*` plus unique
disposable roles, refuses dev/prod/test-shaped database names, and drops scratch resources in `finally`.
It does not read `DATABASE_URL` and must not be pointed at prod/test/dev DBs.

Proof coverage:

- `app_patient` cannot read or write the protected backend context table.
- Raw `SET app.org`, `SET app.patient_user_id`, `SET app.integrator_user_id`, and `SET app.is_staff` are
  not trusted by the helper functions.
- Bad, expired, wrong-backend, and replayed signatures are rejected.
- A valid signed payload installs helper-visible context for org, patient user, and integrator user.
- `app.reset_principal_context()` and `app.release_principal_context()` clear the backend context.
- `app.is_staff()` remains role-derived.

## 2026-07-12 checkout/reset integration checkpoint

Runtime wiring added after the proof smoke:

- Webapp, integrator, and media-worker checkout helpers apply the current async DB principal to checked-out
  clients and clear labels before releasing clients back to the pool.
- Webapp, integrator, and media-worker pool providers wrap promise-form `pool.query(...)` with the same
  apply/clear bracket so direct pool reads do not bypass the Phase 1 principal carrier.
- `DB_PRINCIPAL_CONTEXT_MODE` supports `legacy-guc` (default), `shadow`, and `locked`.
- In `locked`, scoped staff principals run as fixed `app_staff`; patient and integrator principals run
  as fixed `app_patient`; bootstrap/infra stay on the owner connection.
- In `locked`, missing scoped principal context fails closed before the query, after clearing any stale
  backend context left by a pooled connection.
- Transaction handles now expose async release where cleanup can run before the underlying client is returned.
- `scripts/check-db-chokepoint.mjs` allowlists only those provider-level wrappers for internal `pool.connect()`.

Validation run:

- `pnpm --dir packages/db-principal run build`
- `pnpm --dir packages/db-principal run typecheck`
- `node --check docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`
- `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`
- targeted webapp, integrator, and media-worker DB checkout/reset tests
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/integrator typecheck`
- `pnpm --dir apps/media-worker typecheck`
- `pnpm run check:saas-db-regression`
