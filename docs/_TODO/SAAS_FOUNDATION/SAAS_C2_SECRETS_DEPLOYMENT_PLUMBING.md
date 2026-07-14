# C2 secrets and deployment plumbing

Status: Phase C2 repo-side preflight package. No real secret generation or live host execution.

## Contract

Operators must generate one high-entropy `DB_PRINCIPAL_SIGNING_SECRET` per environment outside the
repository and install it through root-managed environment/credential files. The value must never be
printed in commands, logs, docs, taskdb, or commits.

The same active signing key must be present in every process that installs signed DB principal context:

- webapp;
- integrator API / worker / scheduler process family;
- media-worker.

The webapp also needs separate runtime login URLs:

- `DATABASE_URL_STAFF`;
- `DATABASE_URL_NONSTAFF`.

These URLs must be provisioned outside the repository and must not be embedded in docs or scripts.

## Preflight

Repo-managed preflight:

```bash
node deploy/host/saas-c2-secret-preflight.mjs \
  --env-file=webapp:/absolute/path/to/webapp.env \
  --env-file=integrator:/absolute/path/to/api.env \
  --env-file=media-worker:/absolute/path/to/media-worker.env
```

The preflight:

- requires `DB_PRINCIPAL_CONTEXT_MODE=shadow|locked`;
- requires `DB_PRINCIPAL_SIGNING_SECRET` to be at least 32 bytes in each process;
- compares signing secrets by SHA-256 fingerprint prefix only;
- requires webapp `DATABASE_URL_STAFF` and `DATABASE_URL_NONSTAFF` to exist and differ;
- prints URL shape only, never credential-bearing URLs;
- self-tests that fingerprint mismatches fail and that output does not contain fixture secrets.

## Restart And Rollback

Restart order after installing C2 env files:

1. webapp;
2. integrator API;
3. worker;
4. scheduler;
5. media-worker.

Rollback is file-version based: restore the previous root-managed environment files, restart the same units in the
same order, and rerun the preflight. Do not rotate by editing checked-in files and do not print old or new secret
values during rollback.

## Current Boundary

This stage does not read `/opt/env/*`, generate real secrets, connect to TEST/PROD/dev databases, provision
PostgreSQL passwords, restart services, SSH to hosts, or flip production runtime mode.
