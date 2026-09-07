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

## Evidence

**SYSTEM-INTERRUPTED, NOT FOR LAND.** The first audit turn reached the runner boundary before it
could finish candidate-test inspection, validation, findings and the queue verdict. Four behavior-test
files were salvaged for an independent continuation; no PASS is claimed by this intermediate record.
