# Phase 1 locked-label proof

Scratch-only proof script:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase1-locked-label-proof.mjs
```

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
