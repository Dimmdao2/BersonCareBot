# D10 readiness identity correction — 2026-08-20

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D10, remaining item 1. Scope is deploy assertion text only; no database object, migration, grant, or `integrator.projection_outbox` change was made.

## Corrected identities

`app.record_operator_delivery_attempt` changed in four assertion/owner-target references:

```
old: app.record_operator_delivery_attempt(text,text,text,integer,text)
new: app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
```

- `deploy/host/assert-c4-operational-runtime-ready.sh`: the delivery contour now checks the canonical journal root with `has_function_privilege(..., 'EXECUTE')`; a false result still causes division-by-zero and fails readiness.
- `deploy/postgres/dev-c3-app-function-owners.sql`: all three C3 owner-realignment target lists now resolve the live root, so their joins and generated `ALTER FUNCTION` refer to an object that exists.

`app.record_operational_delivery_attempt_audit` changed in the two runtime probes:

```
old: app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamptz)
new: app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
```

- The positive delivery-contour assertion now checks `EXECUTE` on the existing legacy audit root.
- The scheduler `expect_denied` call now invokes the existing root with a typed UUID organization ID and ten arguments. Before this change, its nine-argument call failed during function resolution; `expect_denied` treats any SQL error as denial, so it asserted no scheduler privilege boundary. It now fails only when the scheduler can actually execute this audit capability.

## Live catalog proof

Read-only command against `bcb_webapp_dev`:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; WITH wanted(signature) AS (VALUES ('app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)'::text), ('app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)'::text)) SELECT wanted.signature AS requested_identity, procedure.oid::regprocedure AS resolved_identity, pg_get_function_identity_arguments(procedure.oid) AS identity_arguments FROM wanted JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(wanted.signature) ORDER BY wanted.signature; ROLLBACK;"
```

Output (exit 0):

```
requested_identity                                                    | resolved_identity                                                    | identity_arguments
-----------------------------------------------------------------------+----------------------------------------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone) | app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone) | p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone
app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone) | app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone) | p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone
(2 rows)
```

The reference strings were reconciled with `deploy/postgres/c4-operational-runtime.sql` and `deploy/postgres/privileges/function-census.ts`.

## Privilege result

Read-only command:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT role_name, has_function_privilege(role_name, 'app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)', 'EXECUTE') AS canonical_journal_execute, has_function_privilege(role_name, 'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)', 'EXECUTE') AS legacy_audit_execute FROM (VALUES ('app_operational_delivery_worker'::name), ('app_operational_scheduler'::name)) AS roles(role_name) ORDER BY role_name; ROLLBACK;"
```

Output (exit 0):

```
role_name                        | canonical_journal_execute | legacy_audit_execute
---------------------------------+---------------------------+----------------------
app_operational_delivery_worker  | t                         | t
app_operational_scheduler        | f                         | f
(2 rows)
```

No privilege gap was found in this read-only DEV catalog check. No privilege was granted or changed.

## Checks

| Command | Exit |
| --- | ---: |
| `bash -n deploy/host/assert-c4-operational-runtime-ready.sh` | 0 |
| `shellcheck deploy/host/assert-c4-operational-runtime-ready.sh` | 127 — `shellcheck` is not installed, so it was not run |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | 0 |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | 0 |

## NOT DONE

- The live readiness script was not run on TEST in this package; D10 remaining item 1 delegates that deploy-side run to its landing stage.
- D10 remaining item 2 (dropping `integrator.projection_outbox`) is explicitly out of scope and was not touched.
