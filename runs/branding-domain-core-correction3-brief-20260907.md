# Continuation worker — finish universal domain readiness correction (#787)

Work only in the existing isolated clone/branch `wt/branding-domain-core-20260907`. The branch now
contains the preserved WIP commit `ce746c061` and merge `1256883b4`; the lead registered that WIP as
`WORKER SYSTEM-BLOCKED, READY FOR CONTINUATION, NOT FOR LAND`. This is a continuation of the second
correction, not a new architecture pass.

Before any action, follow the heading-map gate in `AGENTS.md` and read the complete applicable sections,
especially §§1/1b, 3, 4a, 5, 7, 9, 10/10a/10b/11 and 24. Read `README.md`,
`docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/postgres/privileges/README.md`, the full active
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` plan (especially
§§1.1–1.2, B1/B2/B3/B4a/B7/B8/C5a), the surface/domain map,
the full original audit, both earlier correction briefs, and the lead rejection/blocked rows. Use
code-search before blind grep.

## Literal owner outcome

- `<slug>.therapygo.ru` is the permanent ordinary default address for every active clinic, including
  clinics without paid custom branding. It is not an emergency or fallback-only address.
- A custom domain is an optional paid additional address. Pending, failed, suspended, downgraded or
  removed custom-domain state must never damage the ordinary slug address.
- The clinic supplies a base domain and selects `apex` or `subdomain`; the server derives the exact apex
  or fixed `app.<base>`. Only a fully verified active binding may resolve or receive the canonical 308.
- Activation requires expected DNS match, then trusted managed TLS, then exact edge→nginx→webapp host
  proof. DNS alone is not readiness. Caddy owns automatic issuance and renewal.
- TEST remains compatible with its existing one-host setup when split-host/custom-edge env values are
  absent. No tenant-specific or BersonCare-specific branch is allowed.

## Required continuation

1. Inspect the complete `ce746c061` diff against the entire second-correction brief. Do not assume the
   migration-owner blocker was the only unfinished or incorrect part. Preserve correct work and finish
   every requirement that is actually missing.
2. Resolve the owner-aware rollback preflight conflict for the existing health root through the
   repository's canonical rehome mechanism. After inspecting the exact pending migration and parser,
   place the exact marker `-- BCB-MIGRATION-REHOME-FUNCTION: <exact-regprocedure>` in the required
   canonical location immediately after the owner/schema/language markers. Do not bypass, weaken or
   special-case the privilege verifier.
3. Verify that one existing health/verifier path serves both the scheduled tick and authenticated
   owner recheck; it must implement ordered expected DNS → trusted TLS → exact routing proof, including
   recovery from `failed`/`dns_ready`/`suspended` and suspension/removal of usable custom binding after a
   later active-health failure. Never edit clinic DNS. The ordinary slug must remain usable.
4. Verify active organization + current `custom_domain` entitlement + published brand consistently gate
   custom Host resolution, technical→custom redirect, Caddy permission/renewal, readiness and recheck.
   Reuse existing evaluators/resolvers/stores; do not introduce a duplicate algorithm or state machine.
5. Verify legacy intent backfill, table/index owner, all four custom-domain SECURITY DEFINER roots,
   narrow Drizzle grants, generated privilege artifacts, typed/exported edge env, stable non-circular
   Caddy ask origin, public-probe secrecy/exact pending-host bypass, and preservation of anonymous
   messenger-bot fields. Remove any active prose that falsely defers required work or claims live proof.

## Scope and test discipline

Allowed: the same domain core, existing health/probe/settings boundaries, pending migration/schema,
privilege declaration/generated artifacts, typed env, and minimum Caddy ask integration files from the
second correction. Excluded: React settings UI, hosts, DNS, services, firewall, secrets, shared dev
servers and live data. Do not apply migrations. Named-DEV rollback-only preflight via the canonical
script is allowed; no disposable DB and no ad-hoc SQL.

Independent audit owns acceptance tests. Write no tests and edit no tests. Do not add source-text,
SQL-text, exact-function, count, formatting, DOM-shape, mock-call-only or launch-circumstance oracles.

## Verification and delivery

Run every check required by the second-correction brief: exact existing service and bounded-route
oracles, three legacy proxy suites, affected domain-health tests, webapp typecheck, scoped lint,
generated/census/static privilege checks, canonical owner-aware named-DEV rollback preflight, Caddy
validation if applicable, `bash -n` for changed shell and `git diff --check`. Wait for every command.

Commit only explicit intended paths, never `git add -A`; do not push or land. Deliver the completed
product/migration correction in a commit before ending this one agent turn. Update evidence/queue
truthfully, but do not claim audit PASS or live DNS/TLS/renewal proof. Report exact commands/results,
remaining live gates, and every new commit SHA.
