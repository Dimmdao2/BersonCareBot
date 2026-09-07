# Focused independent auditor-live — new custom-domain readiness surface (#787)

Audit candidate `a547ecc0ce585c791ab4fc55a7f3aa4582b6f960`. This is one focused audit of the **new or substantially changed**
readiness/activation/privilege/backfill surface created after the first domain-core audit. It is not a
second blind pass over the seven already-fixed HTTP/service cases in
`AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`; reuse their committed oracles and evidence.

## Test or view classification — mandatory first step

Before inspecting candidate tests, read the heading map and complete applicable sections of
`AGENTS.md`, especially §§1/1b, 3, 4a, 5, 7, 9, **10a and 10b in full**, 11 and 24. Read
`README.md`, `docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/postgres/privileges/README.md`, the full active
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` plan (especially
§§1.1–1.2, B7/B8/C5a), surface/domain map, original audit,
both correction briefs, lead rejection row and candidate diff. Use code-search before broad grep.

Before reading candidate tests, derive and record a blind kill-set from authority and classify each
item independently:

- `test`: repeatable public module/HTTP/DB behavior whose expensive silent failure needs an oracle;
- `view`: one-time migration ownership/grant/declaration shape, generated artifact consistency,
  Caddy/runbook/env agreement, typed wiring and architecture consolidation. Inspect/validate these;
  never create tests for source/SQL text, imports, names, order, counts or formatting.

Audit candidate `a547ecc0ce585c791ab4fc55a7f3aa4582b6f960`. You may commit only missing stable behavior tests and one audit
artifact/queue verdict. Never fix product code. Revert every temporary production-code fault injection.
Never touch TEST/PROD hosts, DNS, services, firewall, certificates, secrets or live clinic data.

## Focused kill-set authority

1. DNS match alone cannot activate. The same verifier used by scheduled tick and owner-only recheck
   must require ordered expected DNS → trusted managed TLS → exact edge→nginx→webapp host proof, and
   only that verifier may transition to `active`. A later scheduled health failure must remove our
   usable custom binding by moving an active domain to the actionable suspended/error state while the
   ordinary slug remains live; the platform never edits or removes the clinic's DNS record. Corrected
   DNS/TLS must be retryable for the same owner from `failed`/`dns_ready`/`suspended` without releasing
   the permanent hostname claim.
2. A pre-activation probe, if present, is the only path reachable through a pending custom Host; it is
   secret-free and reveals no tenant/org data. All other pending/failed/unknown-host requests hard-404.
3. Active organization, current existing `custom_domain` entitlement decision, and published brand
   gate custom Host resolution, technical→custom 308, Caddy initial/renewal permission, readiness and
   owner recheck. Downgrade/deactivation revokes custom behavior immediately without damaging the
   permanent ordinary `<slug>.therapygo.ru` address.
4. Lifecycle/readiness returns only server-owned expected DNS configuration and actionable
   `pending`/`dns_ready`/`active`/`failed`/`suspended` state. Browser-supplied hostname, target, state,
   organization or TLS claims cannot activate or alter another organization's binding.
5. Legacy non-empty `org_custom_domain_hostname` intents are backfilled deterministically: exact
   `app.<base>` → subdomain placement, otherwise exact apex; invalid/platform/conflicting values fail
   visibly and cannot transfer a hostname between organizations.
6. Migration privilege reality matches the declaration: table/index owner is `app_object_owner`;
   every custom-domain `SECURITY DEFINER` root is created/exercised as
   `app_seam_custom_domain_owner`; direct `app_staff` access is only what Drizzle requires; no grant,
   revoke or role creation occurs inside the migration. The owner-aware named-DEV preflight really
   executes pending bodies under the declared roles and rolls back.
7. Custom edge IP/CNAME values are typed, exported runtime config, optional/fail-closed for one-host
   TEST fallback, and never copied to DB. Public Caddy ask uses one stable non-circular platform origin
   consistently across executable template, env example, validator and runbook.
8. No duplicate resolver, entitlement evaluator, health scheduler, certificate worker, settings store
   or second readiness state machine was introduced. Existing bot/messenger fields in anonymous
   patient projection remain available.

## Method and evidence

- Reuse and run the existing service, bounded route and three legacy proxy suites from the correction
  brief on the candidate; do not duplicate their scenarios in new tests.
- For genuinely new repeatable readiness behavior, use the cheapest public service/HTTP boundary.
  Each retained new test must name an expensive silent failure, independent oracle and one fault
  injection that makes its assertion red. Mock call counts/ordering are not an oracle; observable
  state/response/side-effect is.
- DB/RLS behavior, if automated, follows §10b exactly: named DEV only, explicit opt-in, canonical app
  port/admin mechanism, mandatory rollback, no disposable database. Otherwise use the canonical
  rollback-only migration preflight plus direct inspection and report the limit honestly.
- Run affected domain-health tests, webapp typecheck, scoped lint, generated/census/static privilege
  checks, canonical named-DEV preflight, Caddy validation where applicable, shell syntax where changed,
  and `git diff --check`. Do not run full CI unless a concrete repo-level integration risk remains.
- Independently inspect the diff and active plan wording. A green test does not prove live certificate
  issuance/renewal; list those as owner-authorized live gates, not as failure if the repository contract
  is complete.

Deliver one artifact with candidate SHA; kill-set prepared before tests; item-by-item test/view choice;
exact commands/results; each fault injection and its red assertion; confirmation all injections were
reverted; binary PASS/FAIL with only reachable MUST FIX findings; and a queue verdict. Stage explicit
paths only, never `git add -A`, do not push or land, and commit before ending the one agent turn.
