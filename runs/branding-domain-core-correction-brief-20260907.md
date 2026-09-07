# Correction worker brief — universal Host/custom-domain core (#787)

You are the one correction worker on the existing isolated branch/worktree
`wt/branding-domain-core-20260907` at `14f10d90813f0b8a9eb60067469ebd1a76d8f656`.
The product candidate `4a654e071` failed independent Sol audit `66af01853`; the lead then corrected
the audit oracles in `72d214330` and migrated the old proxy suites off the invalid Next argument
seam in `14f10d908`. Do not start another audit or change the fixed oracle.

Before editing, read the mandatory heading map in `AGENTS.md`, then the complete relevant sections:
§§1/1b (including migration markers, no grants in migrations, pre-land privilege analysis), 3, 4a,
5, 7, 9, 10/10a/10b/11 and 24. Read `README.md`, `docs/ORCHESTRATION_BINDINGS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`deploy/postgres/privileges/README.md`, the full authority
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` (especially §§1.1–1.2,
B1/B2/B3/B4a/B7/B8/C5a), `SURFACE_AND_DOMAIN_MAP_2026-08-22.md`, and the complete independent
artifact `AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`.
Apply §24.4's «тест или взгляд» classification before treating any verification as a test obligation.

## Literal owner outcome

- `<slug>.therapygo.ru` is the ordinary permanent default public address for every active clinic,
  including clinics without paid custom-domain branding. It uses the Therapygo platform identity
  plus the clinic's core name. It is not an emergency/fallback feature. Unknown/inactive/deleted
  slugs hard-404.
- A paid custom domain is an option over that default. The clinic submits a base domain and one of
  two placement choices. The server derives exactly the apex or exactly `app.<base>`; a browser can
  never select the prefix or submit the final hostname.
- Only a fully ready `active` binding may resolve or receive the canonical 308 from the technical
  slug. Pending/failed/suspended/quarantined state never harms the ordinary slug route.
- Readiness is real DNS match, successful managed TLS and a successful edge→nginx→webapp routing
  probe. Caddy issues and renews automatically; no tenant-specific nginx edit or Certbot action.
- TEST compatibility remains: absent `PATIENT_APP_ORIGIN` means the existing one-host deployment;
  separate hosts are enabled only by env. No BersonCare-specific code branch.

## Close every audit finding coherently

1. Fix the typed production lookup/`resolveRequestSurface` contract so an active custom binding
   produces an exact 308 preserving path and query. Keep the real `proxy(request, NextFetchEvent)`
   path unconditional; argument two never becomes DI.
2. Parse the settings PATCH `{ value: <base>, placement }` correctly. Ignore/reject any submitted
   `subdomainLabel`; the domain service derives only `app`. Reject exact/subdomains of platform-owned
   Therapysto/Therapygo namespaces before a claim can shadow a technical clinic address.
3. Remove split-brain persistence. `org_custom_domain_bindings` is the server-owned canonical intent
   and lifecycle state. Keep the existing settings HTTP choke point/key for compatibility, but do
   not durably report a `system_settings` value that differs from a rejected/missing binding. Prefer
   one canonical store and synthesize the setting/read response from binding state over a fragile
   compensating write. Return the binding state needed by the existing HTTP oracle and later UI.
   Backfill valid legacy `org_custom_domain_hostname` rows in the pending migration: infer
   `app.<base>` as subdomain placement and otherwise preserve the exact apex intent; conflicts must
   fail closed and visibly, never silently assign a hostname to another organization.
4. Failed verification must be retryable for the same owner/hostname. Changing or clearing a domain
   permanently quarantines the old claim; it never becomes claimable by another organization.
   Preserve immutable owner and one concurrent winner.
5. Supply the real headerless built-in Caddy contract at exactly
   `GET /api/public/domains/ask?domain=<host>`. It returns only allow/deny, normalizes exact hostnames,
   and fails closed. Do not keep a duplicate internal implementation or require an impossible custom
   bearer header.
6. Apply the existing `custom_domain` entitlement decision—do not copy its algorithm—plus active-org
   and published-brand policy consistently at certificate permission, custom Host resolution,
   technical→custom redirect and readiness. Tariff downgrade/deactivation must immediately stop
   custom-domain resolution and renewal while the ordinary slug remains usable. Preserve existing
   anonymous messenger-bot projection fields; do not regress them while extending the projection.
7. Delete/close the generic caller-asserted `mark_active` path. Extend the existing
   `runDomainHealthTick`/`domainCertificateProbe` flow rather than creating a second scheduler or
   parallel domain monitor. Both the daily internal tick and an authenticated owner-only recheck
   action must call the same verifier. It must independently establish, in a non-circular order:
   expected A/CNAME destination from typed webapp runtime config, validated TLS handshake (which can
   trigger approved Caddy issuance), and a routing probe that proves edge→nginx→webapp. A small
   secret-free public probe response before tenant activation is acceptable; it must reveal no tenant
   data. DNS alone can never activate. Record actionable failed/pending/dns-ready/active state for UI.
8. Wire `CUSTOM_DOMAIN_EDGE_IP` and `CUSTOM_DOMAIN_CNAME_TARGET` through the existing typed webapp env
   source. Keep values optional/fail-closed where TEST does not use custom domains. Do not put them in
   DB and do not duplicate config.
9. Correct the Caddy permission URL in the existing edge template/example/validator/runbook so it
   uses a stable platform hostname (not `app.bersoncare.ru`, whose first certificate itself depends
   on the ask result). Keep the already accepted common Caddy topology and pinned build intact.
10. Make the pending migration executable by the owner-aware canonical preflight without weakening
    the distinct custom-domain seam. Ordinary table/index statements belong to `app_object_owner`;
    SECURITY DEFINER roots use the declared seam owner. Inspect the existing declaration-generated
    shared-role bootstrap/preflight order rather than inventing grants or roles in a migration.
    Narrow `app_staff` columns to actual direct Drizzle needs; all runtime functions/relations/columns
    and contexts must be exact in `deploy/postgres/privileges/declaration.ts`, then regenerate only
    the owned artifacts.
11. Keep the old public proxy suites green through the test-only DI-module adapter already committed;
    never restore production argument-two injection.

Before introducing any new function/wrapper/route, ask whether the existing settings route,
`productionTenantSurfaceLookup`, custom-domain service/port, `runDomainHealthTick`,
`domainCertificateProbe`, and internal domain-health tick can be parameterized instead. Do not add a
second resolver, settings store, health scheduler, certificate worker or entitlement evaluator.

## Scope and safety

This worker may change the application/domain-core, existing health tick, schema/migration and exact
privilege declaration/artifacts, the minimum public ask/probe and owner recheck routes, typed env and
the minimum Caddy ask-URL integration files. React settings UI is excluded for the next stage.
Do not touch TEST or PROD hosts, DNS, services, firewall, secrets, shared dev servers or live data.
Do not apply migrations. A guarded named-DEV rollback-only preflight is allowed; no raw ad-hoc SQL and
no disposable database.

Per §§10a/10b/24, do not create tests and do not modify the accepted tests. Product code must satisfy
the existing red oracles. If a route/file moved by the required public contract, preserve the test's
public import contract rather than changing the oracle. Do not add source/SQL/count/mock-call tests.

## Required verification and delivery

Run and report at least:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/custom-domain-binding/service.unit.test.ts --project unit
pnpm --dir apps/webapp exec vitest run src/proxy.productionTenantLookup.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/public/domains/ask/route.route.test.ts src/app/api/internal/domains/activate/route.route.test.ts --project route
pnpm --dir apps/webapp exec vitest run src/proxy.route.test.ts src/proxy.b5Audit.route.test.ts src/proxy.b5aAudit.route.test.ts --project route
pnpm --dir apps/webapp typecheck
pnpm run check:db-privileges-generated
pnpm run check:db-privileges-census
pnpm run test:db-privileges
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Also run scoped lint, domain-health tests affected by the consolidation, Caddy validation if its
ask endpoint values change, `bash -n` for changed shell, and `git diff --check`. Full CI is not the
first gate; run it only if §9 identifies a concrete remaining integration risk.

Commit only explicit intended paths, never `git add -A`. One coherent product correction commit (or
the minimum logically necessary migration/generated split) must reference #787 and record exact
evidence plus any honest live gate. Do not push or land. Do not end while a foreground check is still
running. Update the existing audit-queue record to `CORRECTION READY` with the final commit/evidence;
the two duplicate core audit/oracle rows introduced by the latest base merge must be consolidated to
one factual audit row and one factual correction row, not left duplicated.
