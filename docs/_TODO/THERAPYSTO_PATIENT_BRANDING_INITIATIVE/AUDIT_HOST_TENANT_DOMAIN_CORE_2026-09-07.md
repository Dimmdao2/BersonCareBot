# Independent audit — Host/tenant and custom-domain lifecycle core (#787)

**Candidate:** `b8777b54c9e73d363c7c8b1d6c72cf21b1c68c07` (`4a654e071` product commit followed by merge of current `feat`).
**Scope:** application/domain-core only: production Next Host seam, request-surface wiring, hostname binding and lifecycle, settings/API writes and readiness transitions, Caddy permission endpoint, redirects, migration/schema and exact privileges. UI and edge deployment files are excluded.
**Auditor rule:** production code is read-only. Only missing stable behavior tests and this artifact may be committed.

## Authority read before tests

- `AGENTS.md` heading map and §§1, 1b, 4a, 5, 9, 10, 10a, 10b, 11, 24;
- `README.md`;
- `docs/ORCHESTRATION_BINDINGS.md`;
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`;
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`;
- `deploy/postgres/privileges/README.md`;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, including current owner decisions and B1/B2/B3/B4a/B8/C5a;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md`.

## Blind kill-set (fixed before reading tests)

Each item was independently classified under `AGENTS.md` §§10a/24.4. `Test` means stable, costly and silent repeatable behavior at the cheapest public boundary. `View` means a one-time final-state or architecture/privilege assessment; it must not become a source-text test.

| # | Test / view | Authority-derived fault that must be killed | Required observation |
| --- | --- | --- | --- |
| 1 | Test — exported real Next `proxy(request, NextFetchEvent)` | Production proxy substitutes the no-tenant/default lookup or treats `NextFetchEvent` as an injected lookup | A known clinic slug resolves through production wiring; an unknown Host hard-404s |
| 2 | Test — production Host/proxy surface | A valid active clinic is hidden merely because paid/published branding is absent, or an inactive/deleted organization remains public | Active slug renders a Therapygo surface with `core.displayName`; inactive/deleted returns hard 404 |
| 3 | Test — resolver/service plus named-DEV DB proof where DB invariants are claimed | Pending/failed/suspended/quarantined binding resolves; ownership is reassigned or another tenant's binding/brand leaks | Only active exact binding resolves to its immutable owner; all non-active states fail closed |
| 4 | Test — exported proxy | Technical slug redirects before custom readiness, loses path/query, uses the wrong status, or redirects to another tenant | Active custom hostname receives exact 308 target with path/query; pending/failed/no-custom leaves technical Host live |
| 5 | Test — real settings/API handler | Browser supplies `app.`/technical hostname and server trusts it, or normalization/uniqueness runs against the wrong string | `{baseDomain, placement}` computes exactly apex or `app.<base>` server-side; the computed normalized hostname is the unique claim |
| 6 | Test — service and guarded named-DEV transactional proof | Change/disable/quarantine frees a name prematurely, concurrent claims both win, or `organization_id` is rewritten | Old ownership survives until the defined safe state; one concurrent winner; immutable owner cannot be changed |
| 7 | Test — each public mutation/resolution/readiness/certificate boundary | UI-only hiding or one shallow check permits non-owner, unentitled or inactive organization through another boundary | Owner + entitlement + active-org policy is enforced at mutation, runtime resolve/redirect, readiness and certificate permission |
| 8 | Test — actual `GET ?domain=` permission handler | Endpoint requires a custom bearer header, reveals tenant state, accepts arbitrary/wildcard labels, or fails open | Built-in Caddy HTTP ask contract gets only allow/deny; only registered eligible exact hosts are allowed |
| 9 | Test — actual readiness transition handler/service | DNS alone or caller-supplied generic `mark_active` activates a binding; ordering makes redirect/certificate acquisition circular | Activation requires independently established DNS match, TLS success and routing probe in safe order, with repository wiring/evidence |
| 10 | Test — exported proxy regression matrix | New Host path intercepts Therapysto staff, platform admin, default Therapygo or transitional TEST routing | Each established host retains its prior route/surface behavior |
| 11 | View + generator/static gates; guarded named-DEV proof only for DB behavior | Migration is out of timestamp order, grants rights, lacks statement owner/verify marker/index, generated output drifts, or privilege declaration over-grants beyond required roots | Schema/migration and ownership are valid; only declaration contains exact pre-session roots; generated artifacts match; live ACL/object-owner claims have named-DEV evidence or remain a gate |
| 12 | View (architecture) plus behavior evidence already needed above | Request middleware performs DNS/TLS/network probes or adds a second tenant/domain resolver beside the established surface choke point | Proxy performs lookup only through the existing resolver seam and request-time work is DB/port resolution, not DNS/TLS probing |

## Evidence ledger

### Candidate and implementation facts inspected

`git rev-parse HEAD` before the audit returned the exact candidate
`b8777b54c9e73d363c7c8b1d6c72cf21b1c68c07`. `git diff --name-only 4a654e071^ 4a654e071`
identified the product slice. I read every changed application/domain-core file in that slice, in particular:

- `apps/webapp/src/proxy.ts`, `apps/webapp/src/app-layer/surface/productionTenantSurfaceLookup.ts` and
  `apps/webapp/src/shared/lib/surface/requestSurface.ts`;
- `apps/webapp/src/app/api/admin/settings/route.ts`, both `domains/{ask,activate}` handlers,
  `modules/custom-domain-binding/{ports,service}.ts`, `infra/repos/pgCustomDomainBinding.ts` and the DI wiring;
- `apps/webapp/db/schema/customDomainBinding.ts`, the complete
  `20260907T090000_org_custom_domain_binding_core.sql`, the relevant declaration diff, and emitted DEV/TEST
  privilege, allowlist and port-context blocks;
- the existing proxy/settings/domain, migration-order and DB privilege tests located after the blind kill-set.

The production request path now unconditionally selects `productionTenantSurfaceLookup`; the second `proxy`
argument is ignored. The lookup tries an exact active custom binding first and then the existing slug resolver,
and both paths use the same anonymous projection. The projection SQL uses the active organization and published
directory entry, but falls back from absent published brand fields to the organization title and platform accent.
No request-middleware file in the candidate calls `fetch`, DNS, TLS or an HTTP client.

The binding table has permanent case-insensitive hostname uniqueness, one non-quarantined row per organization,
an `ON DELETE SET NULL` ownership tombstone, forced organization-scoped RLS in generated privileges, and no
`organization_id` UPDATE grant to `app_staff`. Those are useful properties, but they do not cure the failures
below.

### Result by blind item

| # | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | The new exported-proxy test calls the real `proxy(request, event-shaped-object)`. Known slug is a branded surface; unknown Host is a no-store 404. Severing production organization resolution changed the known result from 200 to 404. |
| 2 | PASS at the application seam; DB live gate remains | The same public path accepts a core-identity projection with no published brand and rejects a known slug whose projection returns no active organization. SQL view confirms `organization.is_active = true` plus core-name fallback. Candidate migration cannot yet be applied, so catalog behavior is not claimed live. |
| 3 | FAIL | Exact active custom-host application wiring works and its fault injection turns red, while non-active lookup is 404. However platform-owned patient labels can be claimed by another tenant, runtime entitlement is absent, and the DB lifecycle could not be exercised because preflight fails. |
| 4 | FAIL | Untouched candidate returns 307 instead of the required 308. The production lookup emits `redirectToHostname`, while `TenantSurfaceLookupResult`/`resolveRequestSurface` consume `activeCustomDomainHostname`; the canonical redirect is therefore lost and later auth routing produces the observed 307. |
| 5 | FAIL | The public settings handler ignores the submitted `placement: subdomain` and calls the binding port with `placement: apex`; its service accepts a caller-controlled `subdomainLabel` instead of fixing it to `app`. Platform patient namespace is accepted. |
| 6 | FAIL | Global/permanent uniqueness, per-org advisory lock, transactional quarantine-before-insert and immutable `organization_id` are present by view. But a failed binding cannot be retried, and a rejected claim has already changed `system_settings`. Named-DEV concurrency/ownership proof remains blocked by the migration failure. |
| 7 | FAIL | Owner-only and custom-domain entitlement checks at the settings mutation turn red under fault injection. Resolution/redirect, `ask`, and readiness transition do not enforce the same entitlement; `ask` also omits active-organization state. |
| 8 | FAIL | The real headerless Caddy `GET ?domain=` receives 401 before the authorization service. The SQL allow predicate checks only hostname plus status and therefore does not establish active organization or entitlement. |
| 9 | FAIL | The actual activation handler accepts a generic internal bearer plus bare `mark_active` and invokes the transition. There is no repository caller/verifier carrying DNS, TLS and routing evidence. |
| 10 | PASS for application regression | The exported production proxy retains staff, platform-admin and default-patient surfaces; the existing same-origin/transitional matrix remains among the passing cases. Breaking staff mapping turns the public test red. |
| 11 | FAIL | Timestamp, empty snapshot journal, owner markers, no migration grants, declaration/generated parity and static privilege gates pass. Owner-aware named-DEV preflight fails because the migration attempts to run as a new role that does not exist. The direct UPDATE declaration is also wider than the repository write statements. |
| 12 | PASS | One Next choke point calls the one production lookup; that lookup reuses the clinic-directory resolver plus the binding port. No DNS/TLS/network probe exists in request middleware. |

## Reachable MUST FIX findings

1. **The required technical-to-custom 308 never happens.**
   `productionTenantSurfaceLookup.ts` returns the wrong property name for the typed lookup contract. The exported
   proxy acceptance receives 307 rather than 308, so the visitor stays on the technical Host and enters a later
   auth redirect instead of the owner's canonical custom-domain redirect. Return the contract field consumed by
   `resolveRequestSurface` and retain path/query.

2. **The browser cannot select `app.<base>`, and the service trusts a caller-controlled prefix.**
   `route.ts` looks for `placement` inside `normalizedValue.value` only when that value is an object, while the
   hostname normalizer requires that value to be a string. With the public `{value, placement}` envelope, the
   route silently chooses apex. Separately, `service.ts` uses `input.subdomainLabel`. A clinic preserving an
   existing site therefore binds the apex instead of `app.<base>`; another caller can select an arbitrary label.
   The API must accept base plus placement and the server must derive exactly `app` for subdomain placement.

3. **A tenant can claim the platform patient namespace and shadow another tenant's technical address.**
   Neither the settings handler, service nor table constraint excludes `therapygo.ru` and its descendants.
   Custom-domain lookup precedes slug lookup. Thus an entitled owner can claim, for example,
   `victim-clinic.therapygo.ru`; once active, exact Host resolution selects the claimant before the real
   `victim-clinic` slug. The untouched public acceptance expects rejection and receives 200.

4. **A failed uniqueness claim leaves a false durable setting.**
   `systemSettings.updateSetting` runs before `setCustomDomainIntent`. On `hostname_taken`, the handler returns
   409 but the settings row already contains the rejected hostname. The next read tells the owner a different
   state from the server-owned binding. The intent and binding need one success boundary or compensating behavior
   that never commits the setting on a failed claim.

5. **The Caddy permission endpoint is not callable by the built-in contract.**
   `domains/ask/route.ts` requires `Authorization: Bearer ...`; built-in Caddy sends a headerless
   `GET <endpoint>?domain=<host>`. Both known-allow and unknown-deny public tests stop at 401, so automated initial
   issuance/renewal cannot use this endpoint. The source comment labels the mismatch as known, which does not
   satisfy B8/C5a.

6. **Runtime, certificate permission and readiness do not enforce the custom-domain product gate consistently.**
   Mutation checks `custom_domain`, but `resolve_active_organization_by_custom_domain` and the redirect projection
   only require active organization/binding; `custom_domain_ask_is_authorized` requires neither organization
   activity nor entitlement; transition requires neither. A downgraded clinic can remain on its custom Host and
   receive/renew certificates, and a deactivated organization with a pending row remains ask-authorized. Apply
   owner-required active organization plus current custom-domain entitlement at every named boundary.

7. **A generic bearer can mark a domain active without DNS, TLS or routing proof.**
   `domains/activate/route.ts` accepts `{hostname, transition: 'mark_active'}` and delegates immediately. Its own
   comment says the verifier is not built and no repository caller exists. The untouched acceptance gets 200 and
   observes the transition call where it requires rejection. This can create an active redirect to an unserved or
   uncertified Host. Activation must be driven by repository-wired evidence of DNS match, TLS success and routing
   probe in the non-circular order defined by C5a.

8. **A first verification failure permanently strands the same hostname.**
   The transition FSM permits `pending|dns_ready -> failed` but no retry transition from `failed`.
   `setCustomDomainIntent` returns the unchanged row whenever the requested hostname is the same, regardless of
   status. Clearing quarantines it and permanent uniqueness then forbids recreating it. A clinic that corrects DNS
   after a failed first attempt can never activate that domain.

9. **The candidate migration cannot run through the required owner-aware route.**
   The guarded preflight reaches `BEGIN`, then fails with
   `ERROR: role "app_seam_custom_domain_owner" does not exist`. The role is introduced only by the later privilege
   reconcile, while every migration statement already asks to execute as it. No migration was executed. Supply a
   valid forward bootstrap/order for the new seam owner and make the exact preflight pass.

10. **The existing public proxy acceptance suite is red.**
    The production seam change deliberately invalidated its former second-argument lookup injection, but the
    candidate did not migrate those tests to the production DI seam. The untouched suite reports branded routing,
    CSRF, B5 and B4a failures, so the branch cannot pass its normal route gate. Keep the production behavior and
    update the tests to exercise it through the real lookup.

## Migration, ownership and privilege assessment

- Forward ordering is valid by filename: `20260907T090000...` follows the existing
  `20260907T021938...`. `apps/webapp/db/drizzle-migrations/meta/_journal.json` remains the required frozen
  `entries: []`; no historical snapshot rewrite was made.
- Exact search
  `rg -n "^(GRANT|REVOKE|CREATE POLICY|ALTER TABLE.*(ENABLE|FORCE) ROW LEVEL SECURITY)" <migration>`
  produced no output. The verify probe is in the leading block and every statement boundary is followed by the
  declared owner marker.
- Generated ownership is `app_object_owner` for the table and `app_seam_custom_domain_owner` for the four narrow
  functions. Public execution is revoked; only `app_pre_session` executes the two anonymous reads and only
  `app_worker` executes ask/transition. Generated table RLS is forced and organization-scoped.
- Generated parity is byte-for-byte green for both declared databases and both port-context artifacts. The static
  privilege suite is green.
- Exactness is not clean: `app_staff` UPDATE includes `base_domain`, `placement`, `subdomain_label`, `hostname`,
  `status_reason` and `activated_at`, although the direct repository UPDATE statements only set `status` and
  `updated_at`; identity changes are modeled as quarantine plus INSERT. This is wider DB authority than the
  production port uses. No independent external request exploit for these extra columns was observed, so this is
  recorded as a privilege correction within item 11 rather than a separate reachable finding.
- Live object ownership/ACL/RLS, cross-org concurrency, permanent quarantine and immutable-owner attempts are not
  claimed: the required rollback-only preflight fails before the candidate schema exists.

## Exact checks and results

| Command | Result |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest run src/proxy.productionTenantLookup.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/internal/domains/domains.route.test.ts --project route` | FAIL as acceptance evidence: 3 files, 28 tests, 21 passed, 7 failed. The seven failures are the 308, fixed `app` placement, platform-namespace rejection, atomic rejected claim, both headerless ask cases and evidence-free `mark_active`. |
| `pnpm --dir apps/webapp exec vitest run src/proxy.route.test.ts --project route` | FAIL on untouched candidate: 95 tests, 74 passed, 21 failed. All failures are existing branded proxy cases still using the retired second-argument test seam. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| `pnpm --dir apps/webapp exec eslint src/proxy.productionTenantLookup.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/internal/domains/domains.route.test.ts` | PASS, exit 0 with no output. |
| `pnpm run check:db-privileges-generated` | PASS; DEV/TEST privileges, allowlists and port-context artifacts match byte-for-byte. |
| `pnpm run check:db-privileges-census` | PASS for each declared DB: 211 active relations across 3428 source files; 399 patient-only modules reach only 115 relations with a patient door. |
| `pnpm run test:db-privileges` | PASS: 341 tests, 184 passed, 157 skipped, 0 failed. Opt-in live DB cases remained skipped. |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | FAIL: `ERROR: role "app_seam_custom_domain_owner" does not exist`. This was the guarded named-DEV rollback-only route; `--execute` was not run. |
| `git diff --check` | PASS. |

Full CI was not run: under `AGENTS.md` §9 the exact application acceptance and required owner-aware migration gate
are already red, while typecheck, scoped lint and the relevant privilege/generator gates cover this bounded slice.

## Fault injections and reversion

Each class that was green on the untouched candidate was killed in production code and restored immediately.
Classes already red on the untouched candidate used those red acceptances instead of a second artificial failure.

| Class | Temporary production mutation | Exact red command/result | Reversion |
| --- | --- | --- | --- |
| Real production Host seam | Returned `null` at `resolveOrganizationForHost` | `pnpm --dir apps/webapp exec vitest run src/proxy.productionTenantLookup.route.test.ts --project route -t "uses the production lookup"` — 1 failed, expected 200 received 404 | Mutation removed; identical command then passed. |
| Exact active custom binding | Replaced `return byCustomDomain` with `return null` | `pnpm --dir apps/webapp exec vitest run src/proxy.productionTenantLookup.route.test.ts --project route -t "resolves an active custom hostname"` — 1 failed, branded surface became null | Mutation removed; identical command then passed. |
| Owner-only mutation | Inverted the custom-domain owner predicate | `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts --project route -t "keeps custom-domain mutation owner-only"` — 1 failed, expected 403 received 200 | Predicate restored; identical command then passed. |
| Entitlement mutation | Emptied `CUSTOM_DOMAIN_ENTITLEMENT_SETTING_KEYS` | `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts --project route -t "enforces the custom-domain entitlement"` — 1 failed, expected 403 received 200 | Registry entry restored; identical command then passed. |
| Existing staff surface | Forced the staff auth policy to `null` | `pnpm --dir apps/webapp exec vitest run src/proxy.productionTenantLookup.route.test.ts --project route -t "preserves the established platform host surfaces"` — 1 failed, expected `staff` received `undefined` | Resolver restored; identical command then passed. |

No fault-injection line remains in production. Final command
`git diff -- apps/webapp/src/app-layer/surface/productionTenantSurfaceLookup.ts apps/webapp/src/app/api/admin/settings/route.ts apps/webapp/src/shared/lib/surface/requestSurface.ts`
produced no output, and
`rg -n "AUDIT FAULT INJECTION" apps/webapp/src docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md`
produced no matches.

## Residual live gates after correction

1. Rerun the exact owner-aware named-DEV preflight until it applies all pending statements and ends in its explicit
   rollback PASS state.
2. After the corrected candidate is integrated and migrated by the normal DEV workflow, run a guarded named-DEV
   proof for active versus every non-active state, concurrent duplicate claims, cross-org claim/reclaim,
   immutable `organization_id`, permanent quarantine, exact object owners, ACLs and RLS. This audit did not run
   `--execute`, raw SQL, or a disposable database.
3. Actual DNS/TLS issuance, renewal, Caddy wiring and external Host smoke remain edge/integration gates and are not
   claimed by this application/domain-core audit. TEST and PROD were not contacted.

## Binary verdict

**FAIL — NOT FOR LAND.** Items 3–9 and 11 have blocking failures; the application acceptance suite and required
owner-aware migration preflight are red. Production code was not fixed in this audit. The red behavior tests stay
as fixer oracles.
