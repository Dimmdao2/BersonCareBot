# Final audit: full function privilege surfaces — 2026-08-17

## Verdict

**PASS** for candidate `c4c9b3a8539a6a2615218622c3fbffb23fd986f2` against base `46347c4a5` and the
independent forensic ledger at `55ea2f7290047caafddb5b57b45cd8a36227d90a` / `1ddd78b443e4398fba3cc5131aed03412a993841`.
No DB, env, migration, journal, server, deploy execution, TEST/PROD runtime or push was used.

## Independent full-body result

Command:

```bash
node --experimental-strip-types runs/orchestration/full-function-surface-forensic-20260817.mjs \
  --output /tmp/full-function-surface-final-audit-candidate.json
```

Exit `0`; independently reconstructed `384` declarations = `368` DEFINER + `16` INVOKER, `382` bodies and the
two expected extension-owned bodies `app_ext.digest` / `app_ext.hmac`. Parser probe `PASS`; all six forensic
under-declarations are now absent and all 27 proven over-declarations are now absent:

```text
bcb_webapp_dev definers=366 ordinary=358 special=8 under=0 over=0 missing=0
bersoncarebot_test definers=368 ordinary=360 special=8 under=0 over=0 missing=0
```

The common declaration carries `app.read_current_patient_organization_entitlements()` →
`public.saas_paid_period_policy:SELECT` with the same four columns in both DBs. The staff transcode declaration
contains the formerly hidden `PERFORM ... FROM public.media_files` `SELECT` plus only the exact core delegate.

All five zero-direct wrappers have `relationSurfaces: []` and exactly one proven `delegatesTo` target; no union of
implementation relations was copied into them. `provision_specialist_owner` retains only
`be_organizations:INSERT`. The archive root retains `SELECT+DELETE` on each of its three queues and no `UPDATE`.

The six r4 trigger identities are still `SECURITY INVOKER`, carry no relation surfaces, produce zero rows in the
generated DEFINER body verifier for both DBs, and the candidate generated diff adds no grant to
`app_object_owner`. The independent ledger reports eight INVOKER functions with real dependencies separately;
none becomes a seam-owner ACL grant.

## Permanent gate review and kill set

The generated body verifier is fed only per-DB `SECURITY DEFINER` entries, scans every catalog relation in
`public`, `app`, `integrator`, `app_ext`, `app_control`, and `drizzle`, records under- and over-declarations in one
temporary gap table, and raises once with the sorted aggregate. The static parser covers `PERFORM`, ordinary and
comma `FROM`, joins, CTE/`RETURN QUERY`, `UPDATE ... FROM`, `DELETE ... USING`, conflict/returning semantics, and
preserves comment markers inside quoted strings while removing real comments.

The eight non-ACL body contracts are an exact hardcoded signature→contract allowlist. These mutations were made
in memory or in the isolated clone and fully restored before final validation:

1. Added `bodyRelationSurfaceContract: 'port-context'` to arbitrary
   `app.require_platform_principal()` → `collectGaps` **RED**, `gaps=1`, exact “not in allowlist” site.
2. Removed the required special marker from `app.clear_port_context()` → `collectGaps` **RED**, `gaps=1`, exact
   required-contract site.
3. Removed the real `media_files:SELECT` surface from `enqueue_media_transcode_job_for_staff`, then reran the
   independent full-body command → exit `1`, `under=1`, exact `PERFORM` triple reported.
4. Added nonexistent `UPDATE` to the active B0 diary-snapshot surface, then ran:

   ```bash
   node --test --test-name-pattern='all latest active B0-forward definers|targeted diary snapshot conflict' \
     deploy/postgres/privileges/function-census.test.mjs
   ```

   → exit `1`, two tests RED, exact `actual=INSERT,SELECT declared=INSERT,SELECT,UPDATE` mismatch.

After restoration, `git diff --exit-code -- deploy/postgres/privileges/declaration.ts` returned `0`.

## Validation evidence

- `node --test deploy/postgres/privileges/*.test.mjs` → `77/77` PASS.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps` → both DBs `gaps=0`.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check` → four artifacts
  byte-identical.
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census --db <db>` → each DB:
  `219 ACTIVE` relations across `3212` production source files.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges/tsconfig.json` → exit `0`.
- `./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/types.ts
  deploy/postgres/privileges/function-body-surface.mjs deploy/postgres/privileges/function-census.test.mjs
  deploy/postgres/privileges/generate.mjs` → exit `0`.
- `node scripts/check-no-new-raw-sql.mjs` → production debt `0`.
- Exact direct patient DML statement count command:

  ```bash
  for audit_file in deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
    deploy/postgres/generated/privileges.bersoncarebot_test.sql; do
    awk '/^GRANT (SELECT|INSERT|UPDATE|DELETE).* ON TABLE .* TO "app_patient";$/ { \
      if ($2 ~ /^SELECT/) s++; if ($2 ~ /^INSERT/) i++; if ($2 ~ /^UPDATE/) u++; \
      if ($2 ~ /^DELETE/) d++; total++ } END { printf "%s total=%d SELECT=%d INSERT=%d UPDATE=%d DELETE=%d\n", \
      FILENAME,total+0,s+0,i+0,u+0,d+0 }' "$audit_file"
  done
  ```

  → DEV `total=51 SELECT=51 INSERT=0 UPDATE=0 DELETE=0`; TEST identical.
- `git diff --check 46347c4a5..c4c9b3a8` → exit `0`.
- `git diff --name-only 46347c4a5..c4c9b3a8` contains only declaration/generator/parser/generated privilege
  artifacts/tests and the worker report; no migration, journal, env, runtime server or deployment-script change.

No real reachable MUST FIX finding remains in the audited scope.
