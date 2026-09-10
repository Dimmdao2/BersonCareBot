# Independent audit — A or CNAME for `app.` custom-domain binding (#787)

- Candidate: `7ae3a72b4e08e8e8054a0b37640ff107aa5563a9`
- Candidate base before the coherent UI/authority/product commits: `e57eb6b91`
- Branch: `wt/custom-domain-dns-alternatives-20260910`
- Mode: focused independent `auditor-live`
- Verdict: **FAIL — NOT FOR LAND**
- Boundary: no TEST/PROD, live DNS, nginx, Caddy, Certbot, database, migration, secret, provider, or Next-server action was performed.

## Authority and test/view classification

The auditor read the `AGENTS.md` heading map and the complete applicable §§5, 10a, 10b, 16, 21 and 24 before inspecting candidate tests. The owner oracle is the current `IMPLEMENTATION_PLAN.md` §§1.2, 1.2a, 1.2h and `C5a`: the server-derived `app.<base-domain>` accepts either the configured exact edge A record or the configured normalized canonical CNAME, while apex remains exact-A-only and activation still requires DNS, trusted TLS and exact routing.

Classification recorded before reading tests:

1. Exact subdomain A with absent/unavailable CNAME — repeated behavior at the domain-health public boundary.
2. Exact normalized CNAME with failed/address-following lookup — repeated behavior at the domain-health public boundary.
3. Wrong/multiple/unrelated A plus missing/wrong CNAME — repeated fail-closed behavior.
4. Apex exact-A-only — repeated placement-specific behavior.
5. DNS success cannot bypass trusted TLS and exact routing — repeated lifecycle behavior.
6. Missing runtime target configuration — repeated fail-closed behavior plus one-time typed-wiring inspection.
7. Settings projection and single verifier/route/hostname derivation — API behavior plus architecture/UI inspection. UI composition and copy were inspected only; no UI/DOM/copy/source-text test was created.

## Item-by-item result

| Item | Result | Evidence |
| --- | --- | --- |
| 1. Exact configured subdomain A succeeds without CNAME evidence | PASS when both runtime alternatives are configured | `checkDomainCertificateHealth` checks the exact singleton A first and does not call `resolveCname`; the one-off public-boundary probe made `resolveCname` throw if called and returned DNS/TLS/routing ready. The missing-runtime configuration defect below still rejects this valid A when only the edge IP is configured. |
| 2. Exact normalized configured CNAME succeeds after address failure or target-address resolution | PASS when both runtime alternatives are configured | The same one-off probe passed both `resolveDns → ENODATA` and address lookup returning the canonical target's addresses; upper-case/trailing-dot CNAME normalized to the configured target. |
| 3. Wrong/multiple/unrelated A plus missing/wrong CNAME does not activate | PASS | Mixed direct A plus wrong CNAME stayed DNS-unready and did not call TLS. Source inspection also confirms a CNAME failure cannot set `dnsReady`. |
| 4. Apex remains exact-A-only | PASS | Apex uses the exact singleton edge comparison in its separate branch and never calls `resolveCname`; the one-off probe rejected wrong A despite an available matching CNAME. |
| 5. DNS success still requires TLS and routing | PASS | A trusted-TLS failure leaves routing uncalled; an exact-routing failure leaves `routingReady=false`. `runDomainHealthTick` marks active only after both flags are true. Existing lifecycle tests remain green. |
| 6. Missing runtime target configuration fails truthfully without rejecting a usable configured alternative | **FAIL (F1)** | Both env values are independently optional, but `expectationFor` returns an expectation only when both exist. A subdomain with exact configured A and no CNAME target, or exact configured CNAME and no edge IP, is marked failed before DNS probing. The public binding-state projection likewise returns `dnsInstructions: null` for either single configured alternative. |
| 7. Existing settings/API surface receives the alternatives without a duplicate path | PASS under the fully configured deployment contract; affected by F1 for partial configuration | With both values present, the existing binding service projects A and CNAME for subdomain and only A for apex; the existing settings PATCH read/recheck path and the scheduled/internal routes all reuse `runDomainHealthTick`. Exact searches found no remaining `dnsInstruction` consumer and no second hostname derivation/verifier introduced by this candidate. The server-owned `app.` derivation remains in the existing service. |

## Reachable MUST FIX

### F1 — subdomain readiness incorrectly requires both runtime alternatives

Scenario: an installation configures `CUSTOM_DOMAIN_EDGE_IP` but not `CUSTOM_DOMAIN_CNAME_TARGET`; a clinic chooses `app.<base-domain>` and publishes the exact singleton A record to that configured edge. The symmetric CNAME-only scenario is also expressible because both typed env keys are independently optional.

Current behavior: `runDomainHealthTick.ts:85-91` returns `null` unless both variables exist, then marks the binding `failed` with `runtime_cname_target_missing` or `runtime_edge_ip_missing` without calling the DNS verifier. `service.ts:106-114` also hides the usable configured instruction unless both values exist. A direct service-boundary probe returned `{"onlyA":null,"onlyCname":null}`.

Impact: a DNS alternative explicitly sufficient under owner §§1.2/1.2h/C5a cannot activate the clinic's custom hostname, and the existing settings surface gives no actionable instruction even though one supported target is configured. The standard technical hostname remains usable, but the requested custom-domain product path is unavailable. This is not a preference: the typed runtime contract permits each value independently and the owner contract defines either available alternative as sufficient.

Required correction stays inside the existing chokepoints: represent a subdomain expectation with at least one configured alternative, validate only the configured alternatives, and project every available instruction. Do not add another verifier, route, settings flow or hostname derivation.

## Test-policy decision

No permanent test was added. The independent oracle is the owner decision, and the final observable consequence is loss of the requested custom hostname, but the failure is not silent: the scheduler/route reports unhealthy, the binding is persisted as `failed`, and settings renders the failure. Therefore it does not satisfy the simultaneous expensive-and-silent requirement of `AGENTS.md` §10a. The missing cases were exercised with one-off public-boundary runtime probes and inspection rather than retained test machinery. No fault injection is claimed because no new or changed acceptance test was retained.

## Focused validation

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | PASS; dependencies restored entirely from the local store. |
| `pnpm --dir apps/webapp exec vitest run src/modules/domain-health/domainCertificateProbe.unit.test.ts src/app-layer/health/runDomainHealthTick.unit.test.ts src/modules/custom-domain-binding/service.unit.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/internal/domains/activate/route.route.test.ts` | Unit files passed; the two route suites initially could not resolve unbuilt workspace packages. After building only the required packages and rerunning only failed suites, all selected tests passed: 14 unit assertions, 1 activate-route assertion, and 19 settings-route assertions. |
| `pnpm --dir packages/db-principal run build`, `pnpm --dir packages/shared-contracts run build` | PASS; enabled the two failed route suites without repeating already-green unit suites. |
| `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp typecheck` | PASS. The preceding bare webapp typecheck failed only because those clean-worktree package artifacts did not yet exist. |
| `pnpm exec eslint src/app-layer/health/runDomainHealthTick.ts src/app/app/settings/OrgCustomDomainSection.tsx src/modules/custom-domain-binding/ports.ts src/modules/custom-domain-binding/service.ts src/modules/domain-health/domainCertificateProbe.ts` from `apps/webapp` | PASS. |
| One-off `checkDomainCertificateHealth` public-boundary probe for exact A/no CNAME call, normalized CNAME after address failure/target-address resolution, mixed wrong answers, apex no-CNAME fallback, TLS failure and routing failure | PASS. |
| One-off `createCustomDomainBindingService(...).getBindingState(...)` probe with only A configured and only CNAME configured (`NODE_ENV=test` plus a synthetic test cookie secret) | Reproduced F1: `{"onlyA":null,"onlyCname":null}`. No real env or secret was read. |
| `git diff --check e57eb6b91..7ae3a72b4e08e8e8054a0b37640ff107aa5563a9` | PASS. |

The accepted UI feedback commit `b768a10e3` and authority-only commit `845720d36` were not re-audited. Their integration with the candidate was inspected only at the changed projection seam. No PASS/LAND-READY row was added to the audit queue because F1 remains reachable.
