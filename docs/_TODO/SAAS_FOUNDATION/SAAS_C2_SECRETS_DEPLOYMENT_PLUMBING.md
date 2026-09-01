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
  --runtime-phase=final-runtime \
  --process-env-file=webapp:/absolute/path/to/webapp.env \
  --process-env-file=integrator:/absolute/path/to/api.env \
  --process-env-file=media-worker:/absolute/path/to/media-worker.env
```

`--runtime-phase` is REQUIRED and names which runtime the env files are for. The allowed values are not one
merged list of tolerated modes: each phase has its own mode and its own key contract.

| Phase | Mode | Used by | Contract |
| --- | --- | --- | --- |
| `final-runtime` | `port-context` | `deploy/host/deploy-prod.sh` | The env the shipped processes actually start from. |
| `pre-cutover-source` | `locked` | `provision-c4-operational-runtime.sh`, `assert-c4-operational-runtime-ready.sh` | Entry state of the destructive TEST full reset, before `cutover-postgres-port-context.sh`. |

In `final-runtime` the preflight:

- requires `DB_PRINCIPAL_CONTEXT_MODE=port-context` in webapp and integrator — the webapp process refuses to
  boot in any other mode (`apps/webapp/src/config/env.ts`), so a deploy that accepted `shadow|locked` here was
  gating on a runtime that can no longer start;
- requires the pools the processes actually open: `DATABASE_URL_STAFF`, `DATABASE_URL_PATIENT`,
  `DATABASE_URL_GLOBAL_ADMIN` for webapp and `INTEGRATOR_DB_URL` for integrator, all distinct logins;
- rejects the retired signed-context credentials if they are still declared (`DB_PRINCIPAL_SIGNING_SECRET`,
  `DATABASE_URL`, `DATABASE_URL_NONSTAFF`, `SAAS_ISOLATION_OPERATOR_DATABASE_URL`, and the three integrator
  operational URLs) — the cutover removes them, and leaving one live keeps a wide login usable beside the
  narrow ones.

In `pre-cutover-source` the preflight keeps the original signed-context contract:

- requires `DB_PRINCIPAL_CONTEXT_MODE=locked`;
- requires `DB_PRINCIPAL_SIGNING_SECRET` to be at least 32 bytes in webapp and integrator;
- compares signing secrets by SHA-256 fingerprint prefix only;
- requires all three webapp URLs to exist and the operator URL to differ from both ambient URLs;
- compares PostgreSQL usernames across every webapp, integrator, operator, scheduler, delivery, diagnostic, and media URL,
  and rejects any cross-process role reuse even when the credential-bearing URLs differ.

In both phases it prints URL shape only, never credential-bearing URLs, and rejects media-worker DB
credentials outright. `--self-test` covers both phases, including that each rejects the other's env shape.

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
