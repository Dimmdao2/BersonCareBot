# Independent auditor-live brief — Host/tenant and custom-domain lifecycle core (#787)

Тест или взгляд: сначала классифицируй каждый пункт независимо по AGENTS.md §10a/§24.4.

## Provenance and authority

- Human owner: Dmitry. Only owner-marked repository text is an owner decision.
- Orchestrator: assigns this bounded independent audit; these instructions are not owner canon.
- Auditor: independently gates the candidate SHA named below.

Read `AGENTS.md` headings first, then §1/§1b/§4a/§5/§9/§10/§10a/§10b/§11/§24 in full; `README.md`;
`docs/ORCHESTRATION_BINDINGS.md`; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`;
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`; `deploy/postgres/privileges/README.md`; and all current owner decisions
and B1/B2/B3/B4a/B8/C5a requirements in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` plus its surface/domain map. Use
code-search before broad grep.

## Scope and independence

Candidate: `b8777b54c9e73d363c7c8b1d6c72cf21b1c68c07` (product commit `4a654e071`, then a merge of current `feat`). Audit only the candidate's application/domain-core changes: production Next Host seam,
request-surface wiring, hostname binding/lifecycle, settings/API write and readiness transitions, Caddy permission
endpoint, redirects, migration/schema and exact privileges. UI and Caddy/nginx deployment files are separate slices.

Before reading tests, derive the blind kill-set from authority. Then inspect implementation and existing tests. You
may add and commit only missing stable behavior tests plus one audit artifact; never fix production code. Revert all
fault injections. Never contact PROD or TEST hosts, deploy, mutate DNS/TLS, or create a disposable database. A named
DEV DB proof is permitted only through the repository's guarded rollback-only path and existing application DB port;
otherwise classify it as an unexecuted live gate. No raw SQL application access and no SQL-source-text tests.

## Required kill-set coverage

Independently cover at least:

1. The exported real `proxy(request, NextFetchEvent)` path—not a dependency-injected helper—resolves the incoming
   Host through the production lookup. A known slug works; an unknown host hard-404s.
2. Known active clinic slug without paid/published branding still renders a Therapygo patient surface with core
   clinic identity. Inactive/deleted organization does not.
3. Active custom hostname resolves only to its immutable owning organization; pending/failed/suspended/quarantined
   binding never resolves and cannot leak/cross-claim another tenant.
4. Technical `<slug>.therapygo.ru` redirects with 308 to the active custom hostname, preserving path and query.
   Pending/failed/no-custom leaves the technical address live and does not redirect.
5. Browser submits base domain plus placement; server computes exactly apex or `app.<base>` and never trusts a
   browser-supplied technical hostname/prefix. Normalization and global uniqueness apply to the computed hostname.
6. Lifecycle create/change/disable/quarantine cannot transfer a previously owned hostname to another org before the
   defined safe state; concurrent duplicate claims have one winner; immutable org ownership cannot be rewritten.
7. Owner-only permission, custom-domain entitlement and organization-active status are enforced at mutation,
   runtime resolution, redirect, readiness transition and certificate permission—not merely hidden in UI.
8. Certificate permission allow/deny is fail-closed, reveals no tenant data, is callable by the actual built-in
   Caddy HTTP permission contract (`GET <endpoint>?domain=<host>` with no custom bearer header), and cannot be used
   to obtain certificates for arbitrary hosts or all `<anything>.therapygo.ru` labels. A documented known mismatch
   is still a FAIL, not readiness.
9. DNS readiness alone cannot mark active: activation requires the plan's DNS match, TLS success and routing probe;
   transition ordering cannot create a redirect/certificate chicken-and-egg outage. A generic bearer caller being
   trusted to assert `mark_active` without repository wiring/evidence does not satisfy this requirement.
10. Existing Therapysto staff, platform admin, default Therapygo and TEST hosts retain their prior routing behavior.
11. New schema/migration follows forward timestamp/snapshot rules, does not grant privileges, declares the narrow
    pre-session read/write roots only in the privilege declaration, and generated artifacts match. Review exact
    privileges and object ownership as a view; DB behavior needs guarded named-DEV evidence if run.
12. Request middleware performs no network/DNS/TLS probe and uses the existing resolver/choke point rather than a
    second parallel tenant/domain implementation.

For each repeatable stable class, reuse or add the cheapest public behavior test, including a real route/proxy handler
where wiring is the claim. Perform one targeted fault injection per independent class and record which assertion turns
red. A failing acceptance test on the untouched candidate is valid FAIL evidence and stays for the fixer. UI wording,
file layout, SQL text, source imports and line counts are not test oracles.

## Deliverables

- One audit artifact with candidate SHA, blind kill-set, `test/view` per item, exact commands/results, files and facts
  read, fault injections and reversion proof, migration/privilege assessment, binary PASS/FAIL, reachable MUST FIX
  findings and residual live gates.
- Commit only intentional new tests and the artifact with explicit paths; never `git add -A`; no product fix; no push.
- Record the verdict in the required audit queue.
- Finish foreground checks and return artifact path, commit SHA if any, exact verdict and blockers.
