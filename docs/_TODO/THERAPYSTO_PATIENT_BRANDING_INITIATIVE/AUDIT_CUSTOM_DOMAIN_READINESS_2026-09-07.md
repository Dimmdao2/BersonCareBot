# Focused independent audit — custom-domain readiness surface (#787)

- Candidate: `a547ecc0ce585c791ab4fc55a7f3aa4582b6f960`
- Branch: `wt/branding-domain-core-20260907`
- Auditor mode: focused independent auditor-live
- Scope: only the readiness/activation/privilege/backfill surface added or substantially changed after the first domain-core audit. The seven already-fixed HTTP/service cases from `AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md` are reused, not re-authored.
- Live boundary: no TEST/PROD host, DNS, service, firewall, certificate, secret, or live clinic-data action is authorized or performed.

## Authority read before candidate tests

The auditor read the applicable `AGENTS.md` sections (including §§1/1b, 3, 4a, 5, 7, 9, 10a, 10b, 11, 24), repository onboarding and orchestration docs, local/server conventions, PostgreSQL privilege README, the complete active branding plan (especially §§1.1–1.2, B7/B8/C5a), the surface/domain map, the original domain-core audit, the two in-repository correction records, the lead rejection row, and the candidate production-diff inventory. Code-search preceded exact searches.

## Blind kill-set and test/view classification

Recorded before opening candidate tests. `test` means a repeatable public behavior with an expensive silent regression; `view` means one-time/generated/declarative/wiring consistency which must not be frozen as source-text assertions.

1. **`test` — verifier-owned lifecycle.** DNS agreement alone must never activate. Both scheduled tick and owner recheck must reach the same verifier, which accepts only ordered expected DNS, trusted managed TLS, then exact edge→nginx→webapp Host proof. A later failed verification must remove the usable custom binding by reaching the actionable suspended/error state while the platform slug remains usable. The same owner can retry `failed`/`dns_ready`/`suspended` without surrendering the hostname claim. Expensive silent failure: a clinic is routed through an unproved or later-broken custom host. Public oracle: lifecycle state plus resolution behavior, not dependency call counts.
2. **`test` — pre-activation exposure.** If the probe exists, it is the only response available through a pending custom Host, is secret-free, and reveals no organization/tenant data. Every other pending/failed/unknown custom Host is a hard 404. Expensive silent failure: pre-activation tenant or identity disclosure. Public oracle: HTTP status/body/headers.
3. **`test` — live eligibility and routing.** Custom resolution, technical→custom 308, Caddy initial/renewal permission, readiness and owner recheck all require active organization, the current `custom_domain` entitlement decision, and published brand. Downgrade/deactivation revokes custom behavior immediately without damaging the ordinary `<slug>.therapygo.ru` route. Expensive silent failure: a non-entitled or unpublished clinic continues to consume a custom hostname/certificate path. Public oracle: route/ask/readiness responses and preserved technical-host resolution.
4. **`test` — server-owned lifecycle input/output.** Readiness exposes only server-owned expected DNS configuration and actionable `pending`/`dns_ready`/`active`/`failed`/`suspended` state. Browser-supplied hostname, target, state, organization or TLS claims cannot activate or mutate another organization. Expensive silent failure: cross-tenant activation or readiness spoofing. Public oracle: authenticated HTTP result and persisted lifecycle outcome.
5. **`test` — deterministic legacy intent backfill.** A non-empty legacy `org_custom_domain_hostname` maps exact `app.<base>` to subdomain placement and every other valid non-platform value to the exact apex; invalid/platform/conflicting values fail visibly, and a conflict cannot transfer the hostname to another organization. Expensive silent failure: hidden loss or theft of an existing clinic hostname. Public oracle: named-DEV rollback-only migration outcome and resulting rows/errors; because this is migration behavior, it is exercised only through the canonical owner-aware preflight rather than a disposable database.
6. **`view` — privilege and migration reality.** Inspect table/index ownership, every custom-domain `SECURITY DEFINER` owner, staff access required by Drizzle, absence of grant/revoke/role creation in migration text, declaration/generated consistency, and execute the canonical owner-aware named-DEV rollback preflight. This is one-time ownership/grant/declaration shape; no source/SQL text test is permitted.
7. **`view` — edge configuration agreement.** Inspect typed exported optional/fail-closed custom edge IP/CNAME runtime configuration, absence of DB copying, and one stable non-circular public Caddy origin across executable template, env example, validator and runbook. Validate Caddy and shell syntax. These are wiring/generated/runbook agreements, not behavioral source-text tests.
8. **`view` — architecture consolidation and projection preservation.** Inspect that no second resolver, entitlement evaluator, health scheduler, certificate worker, settings store or readiness state machine exists, and that anonymous patient projection still carries the existing bot/messenger fields. This is architecture/topology and typed-wiring review; existing public regression suites remain the oracle for observable projection behavior.

## Continuation review of the four retained behavior files

All four files remain behavior oracles under AGENTS.md §§10a/10b; none inspects source text, SQL, mock call
counts, ordering, or implementation shape.

| File / retained class | Decision and independent observable oracle |
| --- | --- |
| `runDomainHealthTick.unit.test.ts` — ordered activation; later routing/eligibility loss | Retain. The public tick result and persisted binding status prove that an unproved or no-longer-eligible custom hostname is not usable. The silent failure is a clinic remaining exposed through a broken custom host. |
| `custom-domain-binding/service.unit.test.ts` — live entitlement revocation | Retain. The public service denies custom resolution/ask and drops only the active-custom-host redirect while retaining the anonymous bot projection. The silent failure is continued use of a revoked custom-domain capability. The fixture was updated from the obsolete `{ username, deepLink }` shape to the current public `{ status: 'ready', publicId }` shape; this is a type repair, not an implementation oracle. |
| `domainCertificateProbe.unit.test.ts` — DNS → trusted TLS → exact routing | Retain and extend. Its result flags (`dnsReady`, `tlsReady`, `routingReady`) and issues are the public module contract. DNS-only activation is an expensive silent routing/certificate failure. The added mixed-apex answer below is a real red acceptance oracle, not a synthetic implementation check. |
| `proxy.productionTenantLookup.route.test.ts` — pending-host exposure | Retain. The exported production proxy returns status, headers and no resolved surface: only an authorized probe is reachable; ordinary pending/unknown requests hard-404. The failure is anonymous pre-activation tenant disclosure. |

No retained test was deleted: each names an authority-backed expensive silent failure and observes a public
state/HTTP outcome at the cheapest available boundary.

## Fault-injection evidence and retained acceptance

The interrupted auditor's recoverable run record
`/home/dev/brain/runs/agent-port/branding-domain-core-readiness-audit-20260907.json` states that four
temporary production mutations were made, their tests turned red, and all were restored: “DNS-order,
removal of active binding after routing failure, dynamic entitlement, and isolation of the pre-activation
probe.” The corresponding red oracles are respectively the probe readiness flags, the health-tick binding
state, the binding-service custom-host outcomes, and the exported-proxy status/surface assertions. The record
does not preserve the temporary patch hunks, so no claim is made about their exact textual form; it does preserve
the class, red assertion family and explicit restoration result.

This continuation made no temporary production edit. It added one bounded acceptance case for a previously
uncovered independent failure class:

| Fault / oracle | Result |
| --- | --- |
| Apex DNS returns the correct edge IP **and** a wrong IP; DNS must remain unready and must not start TLS/routing. `checkDomainCertificateHealth(..., { placement: 'apex', edgeIp: '203.0.113.10' })` asserts `dnsReady/tlsReady/routingReady === false` and `dns_mismatch`. | **RED on candidate.** Current result is all three `true`, because `resolved.includes(edgeIp)` accepts `203.0.113.10,198.51.100.5`. This is the acceptance test for M1 below, not a temporary product mutation. |

The predecessor's four temporary edits were reverted before its system interruption. This continuation made no
production edit; immediately before commit, the only auditor changes are the two reviewed test files, this
artifact and the queue verdict.

## Item-by-item audit result

| Kill-set item | Test/view evidence | Result |
| --- | --- | --- |
| 1. Ordered verifier, later failure and retry | Scheduled tick and owner recheck both call `runDomainHealthTick`; retained tests prove activation after DNS/TLS/routing, routing failure removes active use, and lost entitlement suspends it. `failed` can be reset to `pending` by the same owner’s same-host save; `dns_ready` and `suspended` are accepted by transition/ask. But a `failed` binding that needs first/reissued TLS cannot recover through owner recheck: `app.custom_domain_ask_is_authorized` excludes `failed`, so Caddy denies the handshake before the verifier can make progress. | **FAIL (M2)** |
| 2. Pending-host exposure | Retained exported-proxy test: authorized probe is `200`/`no-store` and has no surface; patient route and unknown probe are `404`. | PASS |
| 3. Active/current-entitled/published gates | Service test revokes ask/resolution/redirect on current entitlement loss while preserving the ordinary projection; tick separately suspends lost eligibility. | PASS within the non-live module boundary |
| 4. Server-owned lifecycle | Service computes hostname server-side; existing bounded route/service suites are reused. Browser fields cannot assert activation (`activate` route rejects it). | PASS |
| 5. Legacy backfill | View of `20260907T090000_org_custom_domain_binding_core.sql`: exact `app.<base>` maps to subdomain; other valid values map apex; invalid/platform/conflict abort before deleting legacy values. Owner-aware rollback preflight compiled/executed the pending body and rolled back. It does not seed legacy rows, so row-level migration behavior remains limited to inspection/preflight. | PASS with stated live-data limit |
| 6. Privilege/migration reality | View of migration/declaration/generated artifacts plus owner-aware preflight: table/index DDL runs as `app_object_owner`; four custom roots run as `app_seam_custom_domain_owner`; no migration grant/revoke/role creation; declaration typecheck/generator/census/static suite pass. | PASS |
| 7. Typed edge config and Caddy agreement | Current candidate includes accepted edge correction. Typed optional `CUSTOM_DOMAIN_EDGE_IP`/`CUSTOM_DOMAIN_CNAME_TARGET`, Caddy stable ask origin and runbook agree; local pinned parser and shell validation pass. | PASS (no live issuance/renewal claim) |
| 8. One architecture/projection | Diff/read view finds the existing tick, binding service, settings path and Caddy ask seam reused; anonymous bot projection remains typed and is retained by entitlement test. The stale “later verifier … not built in this slice” comments in `ports.ts` and ask route contradict the actual verifier, but do not create a reachable runtime/security/data-loss failure by themselves. They are a documentation correction, **not a MUST FIX** under the audit finding rule. | PASS with correction note |

## MUST FIX

1. **M1 — mixed apex DNS activates the custom binding.** `domainCertificateProbe.ts` marks an apex DNS answer
   ready whenever it merely contains the configured edge IP. Scenario: a clinic configures `A @` to both
   `203.0.113.10` and `198.51.100.5`; the scheduled tick receives both, proceeds through TLS/routing and can
   transition the hostname to `active`. Impact: the plan’s exact `A @ → <stable edge IP>` readiness proof is
   bypassed and traffic may be sent to a non-platform destination. Authority: implementation plan §1.2/B8/C5a.
   Evidence: retained focused suite is `1 failed / 21 passed`; the new test’s received readiness flags are all
   `true`.
2. **M2 — a failed binding cannot request/reissue TLS through owner recovery.**
   `app.custom_domain_ask_is_authorized` permits `pending`, `dns_ready`, `active`, `suspended`, but excludes
   `failed`; the owner-only recheck calls the verifier with the binding still failed. Scenario: a failed binding
   has no valid certificate after DNS/TLS correction; Caddy calls ask for the SNI hostname, receives denial and
   never reaches the trusted-TLS step. Impact: the owner cannot recover that permanent hostname claim without
   changing/saving it again, contrary to retry from `failed` without release. Authority: focused kill-set item 1
   and plan B8/C5a. Evidence: SQL lifecycle inspection plus the recheck route’s call to
   `runDomainHealthTick`; the rollback preflight proves only compilation, not status-row behavior.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest run src/app-layer/health/runDomainHealthTick.unit.test.ts src/modules/custom-domain-binding/service.unit.test.ts src/modules/domain-health/domainCertificateProbe.unit.test.ts src/proxy.productionTenantLookup.route.test.ts` before the new mixed-answer oracle | PASS: 4 files, 22 tests. |
| Same command after the retained mixed-answer oracle | FAIL as intended for M1: 4 files, 21 passed / 1 failed. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| `pnpm --dir apps/webapp exec eslint src/app-layer/health/runDomainHealthTick.ts src/app-layer/health/runDomainHealthTick.unit.test.ts src/modules/custom-domain-binding/service.ts src/modules/custom-domain-binding/service.unit.test.ts src/modules/domain-health/domainCertificateProbe.ts src/modules/domain-health/domainCertificateProbe.unit.test.ts src/proxy.productionTenantLookup.route.test.ts src/infra/repos/pgCustomDomainBinding.ts` | PASS. |
| `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges && node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --census && pnpm run test:db-privileges` | PASS; generated artifacts match, census reports 211 active relations / 3430 source files, command exit 0. |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | PASS: rollback-only named `bcb_webapp_dev`, pending=1, explicit `ROLLBACK`; no migration was applied. The bare preflight first refused its candidate env-path guard, then the documented candidate runtime-env-root form passed. |
| `bash deploy/caddy/validate-caddy-edge-config.sh && bash -n deploy/caddy/build-caddy-edge.sh deploy/caddy/validate-caddy-edge-config.sh && git diff --check a547ecc0ce585c791ab4fc55a7f3aa4582b6f960^ a547ecc0ce585c791ab4fc55a7f3aa4582b6f960 && git diff --check` | PASS; pinned local Caddy build/parser, shell syntax and both whitespace checks exit 0. |

## Verdict and limits

**FAIL — NOT FOR LAND.** Two reachable MUST FIX items (M1, M2) remain. No TEST/PROD host, DNS, certificate,
firewall, service, secret or live-clinic action was performed. A green repository test/preflight cannot prove
live DNS propagation, ACME issuance/renewal, Caddy deployment or an external routing probe; those remain
owner-authorized live gates after product fixes.

## Lead disposition after the audit

Correction `07eb02ba6` closes both bounded findings without adding a second resolver or lifecycle path:

- M1: apex readiness now accepts only the single configured edge IP; the auditor's retained mixed-answer
  oracle is green.
- M2: the existing Caddy ask root admits the permanently claimed `failed` state, so owner recheck can
  trigger issuance after DNS/TLS correction without resaving or releasing the hostname.

Post-correction evidence: the same focused command is **4 files / 22 tests PASS**; scoped ESLint and
`git diff --check` pass; the owner-aware named-DEV preflight executes the changed migration with
`pending=1` and ends in explicit `ROLLBACK`. Per `AGENTS.md` §§24.5–24.6, the same red acceptance oracle
was rerun by the correcting lead and no new surface was introduced, so a second blind audit is neither
required nor launched. Repository acceptance is **PASS AFTER FIX, FOR LAND**; live DNS/ACME/cutover and
renewal remain separate owner-authorized gates.
