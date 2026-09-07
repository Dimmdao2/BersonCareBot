# Second correction worker — universal domain lifecycle core (#787)

Work only in the existing isolated clone/branch `wt/branding-domain-core-20260907`, based at
`4c6dec51838151c9a480de9c71029e8f0a0e3a3c`. This is a second correction, not a new design pass.
The first correction `650a03e81` and its evidence record `1f4880e1e` are explicitly rejected by the
lead in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` as incomplete and are **NOT FOR LAND**.

Before any edit, run the heading-map command from `AGENTS.md` and read the complete applicable sections,
especially §§1/1b, 3, 4a, 5, 7, 9, 10/10a/10b/11 and 24. Also read `README.md`,
`docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/postgres/privileges/README.md`, the full
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` (especially §§1.1–1.2,
B1/B2/B3/B4a/B7/B8/C5a), `SURFACE_AND_DOMAIN_MAP_2026-08-22.md`, the complete
`AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`, the previous correction brief, and the lead rejection
row. Use code-search before blind grep. Inspect the actual current branch and do not trust the first
worker's completion narrative.

## Owner outcome that must remain literal

- `<slug>.therapygo.ru` is the ordinary permanent default address for every active clinic, including
  clinics without paid custom branding. It is never described or implemented as an emergency path.
- A paid custom domain is an additional address. Pending, failed, suspended, downgraded, or removed
  custom-domain state never harms the ordinary slug address.
- The clinic supplies only a base domain plus `apex` or `subdomain`; the server derives the exact apex
  or exact `app.<base>`. Only a fully verified active binding can resolve or receive a canonical 308.
- DNS readiness is insufficient. Activation requires the ordered chain expected DNS match → trusted
  managed TLS handshake → exact edge→nginx→webapp routing proof. Caddy issuance/renewal is automatic.
- TEST remains one-host compatible when the split-host/custom-edge env values are absent. No
  BersonCare-specific branch is allowed.

## Preserve the parts already corrected

Do not regress the active-binding 308, base+placement input with server-fixed `app`, platform namespace
rejection, canonical binding readback instead of split `system_settings` persistence, failed→pending
retry, headerless public Caddy ask endpoint, removal of caller-asserted `mark_active`, or the production
Next proxy seam. Do not change the accepted public-oracle tests or old proxy-suite adapter.

## Unresolved required implementation

1. Extend the existing `runDomainHealthTick` / `domainCertificateProbe` path; do not create a second
   monitor, scheduler, resolver, settings store, certificate worker, or entitlement evaluator. Before
   adding any wrapper/function/route, explicitly determine whether the existing point can be
   parameterized.
2. One verifier must serve both the scheduled internal tick and an authenticated owner-only recheck.
   It must obtain the server-owned expected A/CNAME values from typed runtime config, verify DNS,
   perform a trusted TLS handshake that can trigger approved Caddy issuance, and then prove the exact
   host through edge→nginx→webapp. DNS alone never transitions to `active`.
3. If a pre-activation public probe is needed, make it an exact secret-free response that exposes no
   organization/tenant data, and add the minimum exact proxy bypass so a pending custom host can reach
   only that probe while all other pending-host requests hard-404.
4. Only the verifier may activate a binding. Expose actionable lifecycle/readiness data through the
   existing settings boundary: `pending`, `dns_ready`, `active`, `failed`, `suspended`, `statusReason`,
   server-returned DNS instruction and owner recheck. Do not implement React UI in this stage.
5. Reuse the existing current `custom_domain` entitlement decision (do not copy its SQL/algorithm) and
   require active organization plus published brand consistently for custom Host resolution,
   technical→custom redirect, Caddy initial permission/renewal, readiness and recheck. Downgrade or
   deactivation must stop custom resolution/ask immediately while `<slug>.therapygo.ru` remains live
   with Therapygo identity plus clinic core identity. Preserve anonymous messenger-bot fields.
6. Complete legacy backfill in the pending migration from non-empty per-org
   `org_custom_domain_hostname`: exact `app.<base>` becomes subdomain placement; otherwise preserve
   exact apex. Platform namespaces, invalid values and conflicts must fail closed and visibly, never
   assign a hostname to another organization.
7. Correct migration authority rather than bypassing it: table/index statements use
   `app_object_owner`; all four `SECURITY DEFINER` roots use declared
   `app_seam_custom_domain_owner`. The canonical preflight may seed declaration-generated shared-role
   baseline first, but must actually execute function bodies under the seam owner. Update the exact
   privilege declaration and generated artifacts, include a written pre-land privilege analysis, and
   narrow direct `app_staff` column grants to actual Drizzle access. Never put GRANT/REVOKE/CREATE ROLE
   in a migration.
8. Ensure `CUSTOM_DOMAIN_EDGE_IP` and `CUSTOM_DOMAIN_CNAME_TARGET` are both parsed **and exported** by
   the existing typed env source and remain optional/fail-closed for TEST. No DB copy of env config.
9. Use one stable non-circular platform origin for the public Caddy ask URL and make it identical in
   Caddy env example, validator, template comments and runbook. Preserve the accepted Caddy topology,
   pinned versions and automatic TLS configuration.
10. Remove active migration/docs prose that calls required entitlement, verifier or edge integration a
    later simplification/follow-up. Do not claim live DNS/TLS/renewal evidence; no host action is allowed.

## Scope and test discipline

Allowed: domain application/service/repository code, existing health tick and certificate probe,
minimum public ask/probe and owner recheck routes, pending migration/schema, exact privilege
declaration/generated artifacts, typed env, and minimum Caddy ask-URL integration docs/templates.
Excluded: React settings UI, TEST/PROD hosts, DNS, services, firewall, secrets, shared dev servers and
live data. Do not apply migrations. Named-DEV rollback-only preflight is allowed through the canonical
script; no disposable DB and no ad-hoc SQL.

The independent auditor already owns the fixed acceptance tests. Per AGENTS §§10a/10b/24, write no
tests and do not edit the existing audit tests. Do not add source-text, SQL-text, count, formatting,
DOM-shape or mock-call-only tests. Product code must satisfy the existing behavior oracles.

## Verification and delivery

Run the exact existing service, bounded route, and three legacy proxy suites named in the previous
correction brief; run affected domain-health tests, webapp typecheck, scoped lint, generated/census/
static privilege checks, `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root
/home/dev/dev-projects/BersonCareBot`, Caddy validation if touched, `bash -n` for changed shell, and
`git diff --check`. Wait for every foreground command; never end while a check is running.

Commit only explicit intended paths, never `git add -A`, and do not push or land. Commit product code
before the end of this one agent turn. Update the existing audit artifact/evidence and consolidate the
core audit-queue tail to one truthful audit row plus one new `CORRECTION READY FOR FOCUSED AUDIT` row;
do not erase the lead's historical rejection. The final report must separate repository-verified
evidence from live gates and name every commit.
