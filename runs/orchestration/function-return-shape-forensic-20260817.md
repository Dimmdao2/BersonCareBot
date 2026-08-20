# PostgreSQL function return-shape forensic — 2026-08-17

## Verdict

**FAIL** for the declaration/generator at `a74ee1c6b`: the r5 blocker is not one function. There are exactly two
wrong declared base result types, and the catalog census has a separate systemic blind spot because it never compares
`pg_proc.proretset`.

No database, env, migration, server, deploy, TEST/PROD runtime, or product code was changed. The local DEV catalog
was queried only inside `BEGIN READ ONLY ... ROLLBACK` as a cross-check; the canonical result comes from the accepted
pre-B0 schema evidence overlaid with only active B0-forward definitions.

Machine ledger, including the expected `returns` + `returnsSet` mapping for all 384 signatures:
`runs/orchestration/function-return-shape-forensic-20260817.json`.

## Full source-reconstructed inventory

Command:

```bash
node --experimental-strip-types \
  runs/orchestration/function-return-shape-forensic-20260817.mjs \
  --live-tsv /tmp/bcb-function-return-shape-live-identity-20260817.tsv \
  --output runs/orchestration/function-return-shape-forensic-20260817.json
```

Exit `0`; parser probe `PASS`. The command measured:

- `384` declared signatures and `384` unique names;
- `382` reconstructed repo definitions plus exactly two external pgcrypto contracts,
  `app_ext.digest(text,text)` and `app_ext.hmac(text,text,text)`;
- `0` unresolved definitions;
- `258` explicit scalar definitions, `120` `RETURNS TABLE`, `4` `RETURNS SETOF`, `0` current OUT-only
  definitions, and `2` scalar extension contracts;
- therefore `260` canonical scalar functions and `124` canonical set-returning functions.

The probe independently covers scalar, `SETOF`, one-column `TABLE`, multi-column `TABLE`, one OUT argument and
multiple OUT arguments. PostgreSQL mapping is represented exactly:

- one-column `RETURNS TABLE(x type)` → `returns: type`, `returnsSet: true`;
- multi-column `RETURNS TABLE(...)` → `returns: record`, `returnsSet: true`;
- `RETURNS SETOF type` → `returns: type`, `returnsSet: true`;
- scalar `RETURNS type` → `returns: type`, `returnsSet: false`;
- one OUT argument → its base type and `false`; multiple OUT arguments → `record` and `false`.

## Exact two base-type declaration mismatches

1. `app.record_current_patient_practice_completion(uuid,text,integer)` is declared `returns: 'record'`, but active
   migration `0016_patient_self_action_capabilities.sql` defines `RETURNS TABLE(id uuid)`. The required mapping is
   `returns: 'uuid', returnsSet: true`.
2. `app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)` is declared `returns: 'record'`, but the
   same migration defines `RETURNS TABLE(updated boolean)`. The required mapping is
   `returns: 'boolean', returnsSet: true`.

The current generated census uses `SELECT ... INTO bad ... LIMIT 1`, so r5 reported only the first signature. Fixing
only that row would expose the second on the next reconcile. The complete source pass proves there are no further
base-type mismatches.

Two apparent `SETOF public.saas_tariffs` differences were rejected as false positives: under the verifier-visible
`public` search path, `format_type(prorettype,NULL)` correctly renders the catalog type as `saas_tariffs`, matching
the declaration.

## Systemic `proretset` blind spot

The generated predicate compares `format_type(p.prorettype,NULL)` with the declaration's `returns`, but does not
mention `p.proretset`. `DeclaredFunction` has no `returnsSet` field. Consequently:

- all `124` canonical set-returning shapes are unexpressed in the declaration;
- after excluding the two base-type mismatches above, `122` `TABLE`/`SETOF` functions have a matching base type and
  can be scalarized without the current census noticing;
- the reverse scalar → set-returning drift is also invisible whenever the base type stays the same.

The audit command performs two in-memory mutations without touching SQL or a database:

1. canonical `TABLE(record)` `app.accept_org_invite(...)` → scalar `record`;
2. canonical scalar `boolean` `app.abort_patient_program_submission_media(uuid)` → `SETOF boolean`.

Both mutations are accepted by the exact current result predicate and rejected when `returnsSet` is included. This
is a reachable catalog mismatch after a drop/recreate of an ordinary function, not a formatting-only difference.

The systemic correction should make `returnsSet: boolean` mandatory on every declaration row, render it in the
expected catalog tuple, compare it with `p.proretset`, and aggregate all mismatched signatures instead of stopping at
`LIMIT 1`. This report does not implement that product fix.

## Read-only live DEV cross-check

Exact guarded command used to create the TSV consumed above:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -At -F $'\t' -c \
  "BEGIN READ ONLY;
   SELECT n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')',
          pg_catalog.format_type(p.prorettype,NULL), p.proretset,
          pg_catalog.pg_get_function_result(p.oid), p.proargmodes::text
     FROM pg_catalog.pg_proc p
     JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('app','app_ext','app_control','public','integrator')
    ORDER BY 1;
   ROLLBACK;" \
  > /tmp/bcb-function-return-shape-live-identity-20260817.tsv
```

The script matched all `382/382` DEV-present declared signatures to the source-reconstructed canonical
`(prorettype, proretset)` pair with zero mismatches. The only absent declared signatures are exactly the two
TEST-only SaaS-isolation fixture functions. This confirms the live DEV bodies already have the intended return
shapes: the bounded correction belongs in the declaration/generator, not in another database migration.
