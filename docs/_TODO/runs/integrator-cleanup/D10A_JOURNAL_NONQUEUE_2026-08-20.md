# D10a — canonical journal for attempts without a queue row

Date: 2026-08-20

Decision: Р-D10a-2

Scope: implementation only; no migration or database write was performed by this worker.

## One chokepoint

Yes. This is one function, `app.record_operator_delivery_attempt`, with a queue source that is optional at
runtime and caller context that is used only when no exact queue row exists. A second named root is neither
necessary nor desirable: both paths enforce the same delivery-attempt validation and write the same canonical
journal, while the only difference is where enrichment comes from.

The signature is now:

```text
app.record_operator_delivery_attempt(
  text, text, text, uuid, text, text, integer, text, text, timestamp with time zone
)
```

The arguments are `intentType`, `intentEventId`, `correlationId`, `organizationId`, `channel`, `status`,
`attempt`, `reason`, JSON payload text, and `occurredAt`. The caller may pass nullable context while a queue
row exists because the queue remains authoritative there. A caller without a queue row must supply a valid
intent type, object payload, and occurrence time; organization remains nullable so a platform incident can be
recorded with `organization_id IS NULL`, while a booking-confirmation caller can preserve its known tenant UUID.

## Baseline body and change

I read the live DEV body with this read-only command:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY;' \
  -c '\sf app.record_operator_delivery_attempt' \
  -c 'ROLLBACK;'
```

I compared it with `deploy/postgres/generated/prod-to-target/schema-pre.sql`. They agreed: the five-argument
body validates event/channel/status/attempt/reason, looks up an exact queue source by `channel` plus
`payload_json #>> '{intent,meta,eventId}'`, raises SQLSTATE `23514` if none exists, derives
organization/kind/topic/users/occurrence from the queue payload, and inserts the canonical row.

The forward migration
`apps/webapp/db/drizzle-migrations/20260820T185707_the_delivery_journal_accepts_a_nonqueue_attempt.sql` replaces
that rejection with a nonqueue insert. It validates and records the caller context, including the supplied
organization and occurrence time, and marks metadata with `queueSource: false`.

The queue-backed branch stays behavior-identical because its lookup, casts, enrichment assignments, target
columns, values and metadata object were copied unchanged from the measured body. Caller-supplied organization,
intent, payload and occurrence time are not consulted after a queue match, so the queue remains authoritative.
The behavioral test deliberately passes conflicting caller context and verifies that the queue organization,
kind, topic and integrator user still win.

## Signature, privileges and old overload

Changing PostgreSQL argument types creates an overload rather than replacing the old function. The migration
therefore creates the ten-argument root and explicitly drops the obsolete five-argument overload as a separate
owner-declared statement. It contains no `GRANT`, `REVOKE`, or policy.

The exact ten-argument identity was propagated to:

- `deploy/postgres/privileges/function-census.ts`, including the additional `created_at` write surface;
- `deploy/postgres/privileges/name-census.json`, refreshed with the repository's census updater;
- `deploy/postgres/c4-operational-runtime.sql` for its `ALTER FUNCTION`, `REVOKE`, `GRANT`, privilege assertions,
  managed privilege inventory, and DOWN cleanup;
- integrator named-root execution and delivery-worker readiness probing.

The c4 overlay still owns no function body. Runtime code calls the same named root through the attested
delivery-worker port and now forwards all context already present on `delivery.attempt.log`; delivery routing,
timing, ordering and transport are untouched.

## Live DEV proof for the lead

Run from the landed canonical checkout. This sequence refreshes the generated privilege projections required by
the reconcile precheck, preflights and applies the pending migration through the repository wrapper, then runs
the opt-in real-Postgres behavior proof under the actual staff and outgoing-delivery-worker principals:

```bash
cd /home/dev/dev-projects/BersonCareBot

node deploy/postgres/privileges/generate-cli.mjs --all
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute

set -a
. ./.env
set +a
RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 USE_REAL_DATABASE=1 \
  pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts
```

The test itself produces two attempts for which it deliberately creates no queue row:

- an `operator.alert` email with `organizationId: null`;
- a `booking.confirmation` email whose event ID starts `booking.confirmation.ics:` and whose organization is
  `a0000000-0000-4000-8000-000000000001`.

Before cleanup, it selects the resulting canonical rows by their randomized event IDs and asserts respectively
that organization is NULL and that organization is the supplied fixture UUID. It also creates a queue-backed
row and proves queue-derived enrichment wins over conflicting caller context. A failure of the function EXECUTE
grant, attested principal, insert privilege, RLS path, fallback behavior, or enrichment is therefore an actual
test failure rather than a source-text assertion.

For an additional manual read after temporarily disabling the test cleanup, use the event ID printed/retained by
that local edit and the platform read boundary; do not use a direct table login as a substitute for the proof.
The committed test intentionally cleans up every randomized fixture it creates.

## Checks

Final-state results are recorded below; all exit codes are the actual command exit codes.

| Command                                                                                      | Exit code | Result                                         |
| -------------------------------------------------------------------------------------------- | --------: | ---------------------------------------------- |
| `node scripts/check-c4-migration-owned-function-bodies.mjs`                                  |         0 | passed                                         |
| `pnpm --dir apps/webapp run lint`                                                            |         0 | passed; two pre-existing warnings, zero errors |
| `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json`                                  |         0 | passed                                         |
| `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json`                              |         0 | passed                                         |
| `pnpm --dir apps/integrator exec vitest run`                                                 |         0 | passed                                         |
| `node --experimental-strip-types --test deploy/postgres/privileges/relation-access.test.mjs` |         0 | passed                                         |

Additional privilege-census check:

- `BCB_UPDATE_NAME_CENSUS=1 node --experimental-strip-types --test deploy/postgres/privileges/function-census.test.mjs`
  exited 0 after refreshing `name-census.json`.
- `node deploy/postgres/privileges/generate-cli.mjs --check` exited 1 because the two committed generated
  per-database privilege SQL projections do not yet include the new signature. Those generated artifacts are
  outside this worker's allowed file scope; the first command in the lead sequence regenerates them before the
  migration wrapper's reconcile precheck.

## NOT DONE

- The migration was not applied and no database was changed, as explicitly prohibited. Live DEV acceptance is
  for the lead to prove with the sequence above.
- `integrator.delivery_attempt_logs`, its writer and its readers remain in place. Runtime principal routing to
  that legacy branch was not removed; that is the next stage after live proof.
- No operator alert or booking-confirmation delivery path was changed, and operator alerts were not routed
  through `outgoing_delivery_queue`.
- Generated `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` and
  `deploy/postgres/generated/privileges.bersoncarebot_test.sql` were not changed because they are outside the
  assigned file scope. They must be regenerated by the lead before `migrate-dev.sh`, as shown above.
- `deploy/host/assert-c4-operational-runtime-ready.sh` still names the old five-argument identity and is outside
  this worker's file scope. It must be updated to the ten-argument identity before that host readiness check is
  used in a deploy.
- `deploy/postgres/dev-c3-app-function-owners.sql` also retains the old identity and is outside this worker's
  file scope. It was not used by `migrate-dev.sh`; if that legacy C3 overlay is run independently, its function
  inventory must first be updated. `deploy/postgres/generated/prod-to-target/schema-pre.sql` intentionally remains
  the measured pre-change snapshot and must not be rewritten as though DEV had already been migrated.
