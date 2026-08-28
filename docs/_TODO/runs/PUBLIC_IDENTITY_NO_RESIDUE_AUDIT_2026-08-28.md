# Public identity cutover — independent no-residue audit

Date: 2026-08-28  
Candidate: `ab890e1b30bc01ec695ca04389e737fe9e17263c`  
Branch: `wt/retire-public-integrator-id-runtime-20260828`  
Verdict: **FAIL — not for land**

Two independent read-only auditors inspected the candidate itself. Neither changed the tree. Their results agree:
the first implementation removes the main auth/reminder/support columns, but post-migration access reconcile and
several active schema/ops surfaces still depend on the retired public numeric person ID.

## Blocking findings

1. `deploy/postgres/port-context/contract.sql` still validates the internal technical integrator principal by
   joining `public.platform_users.integrator_user_id`. `reconcile-access.mjs` reapplies that body after migrations,
   restoring an incompatible function after the column is dropped.
2. `function-census.ts`, the declaration and generated privilege SQL still name old reminder overloads, functions
   and dropped columns. Generator parity is green only because source and generated artifacts are stale together;
   post-migration reconcile would fail.
3. The migration drops an `integer` mute overload, while the active retired overload takes `timestamptz`; the live
   old body would survive. The new canonical mute function is also missing the narrow relation read needed for its
   `WHERE id` predicate.
4. Two public copies were omitted: `content_access_grants_webapp.integrator_user_id` and
   `notification_delivery_attempts.integrator_user_id`, including schema, writers, function signature and rights.
5. Active backfill/reconcile/realignment scripts and modules still query or update retired columns.
6. `contracts/webapp-entry-token.json` permits the retired numeric field while the webapp rejects that signed
   shape; active API/architecture docs also describe removed merge/reminder paths.
7. The generated schema-B snapshot still contains the pre-cutover schema. This is expected before applying the
   forward migration, but it must be refreshed from named DEV by the canonical refresh script immediately after
   DEV migration execution; hand editing is forbidden.

## Measurements

Exact tree census reported by the independent auditor:

- all exact/semantic matches: `309 files / 1442 lines`;
- excluding Markdown and historical migrations: `89 active files / 605 lines`;
- non-`current_` public-form matches in generated schema-B: `107 lines`;
- stale function-census entries: `10 functions`;
- active non-historical documents: `25 files`.

Named DEV read-only measurement performed separately by the orchestrator:

```text
content_total|0
content_platform_null|0
content_old_nonnull|0
content_null_resolvable|0
attempt_total|18700
attempt_old_nonnull|11296
```

Command shape:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; ...; ROLLBACK;'
```

## What is allowed to remain

- Immutable historical forward migrations, `docs/archive/**` and completed evidence/audit records.
- The separate internal technical request/process principal in `packages/db-principal/**`, attested port-context
  storage and `app.current_integrator_user_id()`, provided it never resolves a public person or owns public data.
- Other real identifiers such as a provider grant ID remain; they are not the retired public person identity.

Everything else named above must be removed or rewritten before landing. The correction authority and complete
scope are in
`docs/_TODO/runs/briefs/CLOSE_PUBLIC_IDENTITY_CUTOVER_WITHOUT_RESIDUE_2026-08-28.md`.

