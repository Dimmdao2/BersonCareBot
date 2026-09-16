# #787 — patient public-origin fixer after independent FAIL

You are the implementation worker in `wt/branding-domain-absolute-links-20260907`. Work once, finish the whole bounded implementation, commit before ending, and do not push, land, deploy, or touch TEST/PROD/DNS/TLS/services.

## Mandatory reading and authority

1. Run `grep -n "^## \\|^### " AGENTS.md`, then read the route plus `AGENTS.md` §§5, 7, 10a, 10b and 24 in full. Follow code-search-first and explicit-path staging. Never use `git add -A`.
2. Read:
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially the current owner decisions and B3;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`;
   - `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` §§9.3–9.4;
   - `/home/dev/brain/runs/agent-port/branding-domain-absolute-links-audit-20260907.json` only as recovered audit evidence.
3. The owner requirement is exact: a patient uses the clinic's active custom domain when one exists; otherwise the permanent normal address is `https://<slug>.therapygo.ru`. `therapysto.ru` is staff. `<slug>.therapygo.ru` is not an emergency URL. Pending/failed/suspended custom domains never receive patient links.
4. Yandex remains one global patient registration. This task preserves the trusted patient origin across its callback; it does not create per-clinic OAuth registrations or change provider branding.

## Accepted independent findings — implement, do not re-audit

- F-1: organization-bound patient payment returns, booking/confirmation links, notifications, broadcasts and reminders currently use staff `APP_BASE_URL`. Implement one canonical `organizationId -> patient public origin` seam: active custom hostname wins, else permanent slug origin. Reuse/extend the existing anonymous patient surface projection and composition wiring; do not create per-producer resolvers or parallel DB reads. Before adding a wrapper/function, explicitly check whether `productionTenantSurfaceLookup` or the existing custom-domain projection can be parameterized/reused without violating its request-bound responsibility.
- F-2: `yandexOAuthCallbackHandler` already receives trusted `ResolvedSurface`; patient redirects must preserve its `publicOrigin`, while staff stays on the staff origin. Never trust arbitrary `next`, `Host`, forwarded headers, or callback query values as an absolute redirect origin.
- F-3: reminder organization context must not be selected from a browser-supplied organization id/cookie. Organization-bound reminder links now have an organization-specific origin, so use the trusted resolved patient surface/resource relationship as authority. A modified query string must not switch a multi-clinic patient into another clinic. Reuse the existing patient-organization service and request-surface context; do not create a second membership model. Preserve an honest recovery path for legacy/unscoped links.

## Required call-site pass

Apply the one F-1 seam to every confirmed organization-bound producer named in the audit, including:

- `modules/payments/service.ts` and its doctor/staff acquiring callers;
- memberships and patient booking payment/confirmation/ICS paths;
- doctor broadcasts, doctor-reply notification and patient web push;
- webapp reminder materialization/projection and the integrator reminder callback URL path.

Keep the audit's PASS-classified staff/admin/operator/protocol URLs on staff `APP_BASE_URL`. Do not mechanically replace every occurrence.

## Tests and validation

- Worker must not author, delete, rename, or rewrite tests. Existing auditor oracles are fixed acceptance criteria:
  - `apps/webapp/src/app/api/payments/patientAcquiring.route.test.ts`
  - `apps/webapp/src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts`
- Make both red tests green. Run the cheapest relevant existing tests for changed public behavior, strict typecheck for each changed package, scoped ESLint, and `git diff --check`.
- Do not run full CI; the lead owns the single final integration CI.
- No disposable database. Do not mutate named DEV. If a DB-backed live proof would be required, report it for the lead instead of inventing a database or migration.

## Completion

Inspect the full branch diff from the audited base, ensure no test file changed in your commit, stage only explicit intended paths, and commit with `#787`. Report: product paths, the one shared seam, exact commands/results, remaining external gate if any, and commit SHA. Do not end while a foreground command is still running.
