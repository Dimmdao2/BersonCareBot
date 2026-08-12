# C2 secrets and deployment plumbing

> **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** HMAC signing secret и отдельный telemetry operator URL ниже — старый locked
> contour. Target использует PostgreSQL mTLS и четыре runtime DB-login; global-admin имеет отдельный webapp-owned
> certificate/pool, а не `SAAS_ISOLATION_OPERATOR_DATABASE_URL`. Канон — DB privilege scheme revision 11.

Status: Phase C2 repo-side preflight package. No real secret generation or live host execution.

## Contract

Operators must generate one high-entropy `DB_PRINCIPAL_SIGNING_SECRET` per environment outside the
repository and install it through root-managed environment/credential files. The value must never be
printed in commands, logs, docs, taskdb, or commits.

The same active signing key must be present in every process that installs signed DB principal context:

- webapp;
- integrator API / worker / scheduler process family;
- media-worker.

The webapp also needs three separate database login URLs:

- `DATABASE_URL_STAFF`;
- `DATABASE_URL_NONSTAFF`;
- `SAAS_ISOLATION_OPERATOR_DATABASE_URL`.

The first two are ambient application runtime logins. The operator URL is a distinct LOGIN/INHERIT,
NOSUPERUSER/NOBYPASSRLS infrastructure login for Global Admin diagnostics reads and E2 coverage only. It must not
inherit `app_owner`, `app_staff`, `app_patient`, or `app_worker`. All three URLs must be provisioned outside the
repository and must not be embedded in docs or scripts.

## Preflight

Repo-managed preflight:

```bash
node deploy/host/saas-c2-secret-preflight.mjs \
  --process-env-file=webapp:/absolute/path/to/webapp.env \
  --process-env-file=integrator:/absolute/path/to/api.env \
  --process-env-file=media-worker:/absolute/path/to/media-worker.env
```

The preflight:

- requires `DB_PRINCIPAL_CONTEXT_MODE=shadow|locked`;
- requires `DB_PRINCIPAL_SIGNING_SECRET` to be at least 32 bytes in each process;
- compares signing secrets by SHA-256 fingerprint prefix only;
- requires all three webapp URLs to exist and the operator URL to differ from both ambient URLs;
- compares PostgreSQL usernames across every webapp, integrator, operator, scheduler, delivery, diagnostic, and media URL,
  and rejects any cross-process role reuse even when the credential-bearing URLs differ;
- prints URL shape only, never credential-bearing URLs;
- self-tests fingerprint mismatch, webapp-to-operational and operational-to-operational username collisions, and that
  output does not contain fixture secrets.

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
