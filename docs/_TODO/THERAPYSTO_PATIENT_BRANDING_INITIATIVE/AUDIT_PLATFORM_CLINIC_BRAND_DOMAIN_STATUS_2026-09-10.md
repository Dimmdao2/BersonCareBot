# Platform clinic brand/domain status projection — independent audit (#787)

## Verdict

**FAIL — NOT FOR LAND.** Audited candidate
`930f868044239803cf89fc3ad5fa416ada4801f3` against base
`bf8fcee15ae4c541921576825b4f649b631f309c`.

The existing platform organization read path, narrow cross-clinic function, published-brand boolean and clinic-detail
composition are directionally correct. The candidate is not land-ready because its current-domain projection returns
quarantined history, its canonical port-context artifacts are stale, and its privilege declaration does not typecheck.

No product code or test was changed by this audit. The requested PASS/LAND-READY queue row was not added because the
candidate is not clean.

## Test-or-look classification

| Requirement | Classification | Audit method |
| --- | --- | --- |
| Existing `platformEntitlements.listOrganizations()` path; no parallel route/DB access | LOOK | Candidate diff, route/module/repository call graph |
| Clinic-detail composition, separate brand/domain presentation, standard slug not treated as custom | LOOK | Typed projection and `ClinicsConsoleClient` inspection; UI composition is live-only after landing |
| Migration shape, owner, ACL absence, relation surface and safe rollback | LOOK + canonical gate | SQL/declaration/generated-artifact inspection, migration static gates, rollback-only named-DEV preflight |
| Platform-only authorization and narrow returned data | LOOK | Exact principal/context/capability chain and function output surface |
| Current custom-domain lifecycle result | LOOK in this pre-land audit | Exact transition SQL plus exact projection SQL; executing the unapplied migration or mutating DEV was forbidden, and a source-text test would violate §10a |
| No write/publication/lifecycle/provider/host action | LOOK | Candidate path and operation census |

Blind kill-set used before candidate test inspection: non-platform access; tenant impersonation; draft brand counted as
published; `<slug>.therapygo.ru` mislabeled as custom; absent current binding reported as present; another
organization's binding cross-wired; route bypass of `listOrganizations()`; exposure of secrets, DNS proof material or
clinical data.

## MUST FIX findings

### F1 — a cleared or superseded domain is reported as the clinic's current custom domain

Reachable scenario: `app.save_custom_domain_binding_intent(..., 'clear', ...)` changes the current row to
`status = 'quarantine'` and returns `state = NULL`. The established management read likewise defines the current
binding as `status <> 'quarantine'`. The new function instead selects the newest row for the organization without
that predicate:

- `20260909T200000_custom_domain_staff_intent_door.sql:53-67` — current binding excludes quarantine; clear quarantines
  the row.
- `20260910T100000_platform_organization_brand_domain_projection.sql:35-40` — lateral query accepts every status.
- `ClinicsConsoleClient.tsx:790-805` — any returned row is displayed as “Свой домен”; only `null` renders “Не настроен”.

After clear, platform operations therefore shows the retired hostname and “Карантин” instead of no configured custom
domain. Supersede is also nondeterministic: the old row's `updated_at = now()` and the replacement's default
`updated_at = now()` share the transaction timestamp, while the projection orders only by `updated_at`; it can choose
the quarantined predecessor. This violates the owner requirement to show the actual configured hostname, if any, and
to represent a missing binding honestly. Exclude quarantined history from the current-binding lateral query; do not
turn the platform card into a history view.

### F2 — committed port-context capability artifacts omit the new runtime capability

Reachable scenario: application code registers
`platform.organization.brand-domain-status.read` / `app.list_platform_organization_brand_domain_status()`, but both
committed port-context catalogs still jump from the preceding organization capability to later entries. The canonical
parity command fails for both declared databases:

```text
pnpm run check:db-privileges-generated
  bcb_webapp_dev/portContext: mismatch at line 283
  bersoncarebot_test/portContext: mismatch at line 283
  --check: расхождений 2
```

This violates the explicit declaration/generated-artifact gate and leaves the deployed capability registry out of
sync with the named root. Regenerate and commit both `port-context-capabilities.*.sql` artifacts through the canonical
generator.

### F3 — the canonical privilege declaration fails strict TypeScript validation

`FunctionRelationSurface.evidence` is a closed union in `deploy/postgres/privileges/types.ts`. The candidate adds
three free-form literals outside that union at `declaration.ts:30720`, `:30722` and `:30725`. The required strict
declaration check fails with TS2322 for each literal:

```text
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
  declaration.ts(30720,44): error TS2322
  declaration.ts(30722,44): error TS2322
  declaration.ts(30725,44): error TS2322
```

This is a build failure, not a documentation preference. Use an evidence value admitted by the declaration contract
and re-run strict validation.

## Accepted inspection results

- The unchanged `GET /api/admin/organizations` route reaches the existing
  `platformEntitlements.listOrganizations()` port. The candidate adds no endpoint and no route-level DB access.
- The application guard requires the exact platform-operations principal; the DB function requires
  `app_platform_settings`, `platform` context, the exact purpose and zero typed arguments.
- The function is `SECURITY DEFINER`, `STABLE`, `PARALLEL RESTRICTED`, owned by
  `app_seam_custom_domain_owner`, with `search_path=pg_catalog`. Its output is limited to organization ID,
  published-brand existence, hostname, lifecycle status and status reason.
- Draft brand content, credentials, DNS proof/tokens and clinical data are not returned. Published branding is an
  `EXISTS` check restricted to `status = 'published'`. The technical TherapyGo slug is not read by this function.
- The authored migration contains one forward `CREATE FUNCTION` statement with owner/schema/verify markers and no
  `GRANT`, `REVOKE`, role or policy statement. The declaration grants function execution only to
  `app_platform_settings` and gives the seam owner column-narrowed `SELECT` on the three body relations; no write right
  is introduced.
- The canonical named-DEV preflight compiled the pending migration under its declared owner and ended in explicit
  rollback; it did not execute the migration.

## Validation record

```text
git diff --check bf8fcee15ae4c541921576825b4f649b631f309c..930f868044239803cf89fc3ad5fa416ada4801f3
  PASS

pnpm --dir apps/webapp exec eslint src/app/app/admin/clinics/ClinicsConsoleClient.tsx src/infra/repos/inMemoryPlatformEntitlements.ts src/infra/repos/pgPlatformEntitlements.ts src/modules/org-entitlements/ports.ts
  PASS

pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/shared-contracts run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp run typecheck
  PASS

node scripts/check-migration-privileges.mjs
  PASS — check-migration-privileges: OK (154 migration files)

bash apps/webapp/scripts/check-drizzle-migration-order.sh
  PASS

pnpm run check:db-privileges-census
  PASS for bcb_webapp_dev and bersoncarebot_test

bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
  PASS — named DEV bcb_webapp_dev; pending=4; terminal ROLLBACK

pnpm run check:db-privileges-generated
  FAIL — both port-context artifacts differ from declaration (F2)

./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
  FAIL — TS2322 at declaration.ts:30720, :30722 and :30725 (F3)

pnpm run test:db-privileges
  BASELINE/HARNESS RED — 340 tests: 176 pass, 7 fail, 157 skipped; every failure is an unchanged
  migrate-local synthetic fixture rejected because app_probe_owner is absent from the declaration. Exact comparison:
  git diff --exit-code bf8fcee15ae4c541921576825b4f649b631f309c..930f868044239803cf89fc3ad5fa416ada4801f3 -- deploy/postgres/privileges/migrate-local.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/generate-cli.mjs
  PASS (no diff), and app_probe_owner is absent from both base and candidate declaration. This red baseline is not
  counted as a candidate finding and does not hide F1-F3.
```

No full CI, Next server, live UI, migration execution, TEST/PROD, provider, DNS/TLS, secret or product-data action was
performed.
