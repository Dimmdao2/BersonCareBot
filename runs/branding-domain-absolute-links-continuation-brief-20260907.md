# #787 — patient public-origin continuation after final FAIL

You are the implementation worker continuing `wt/branding-domain-absolute-links-20260907`. Complete the bounded product fix in one turn, commit before ending, and do not push, land, deploy, mutate named DEV/TEST/PROD, touch DNS/TLS/services, or author/change/delete tests.

## Mandatory reading and authority

1. Run `grep -n "^## \\|^### " AGENTS.md`; read the route and `AGENTS.md` §§5, 7, 10a, 10b and 24 in full. Follow code-search-first, strict typing, one common seam, and explicit-path staging; never use `git add -A`.
2. Read the active owner decisions and exact evidence:
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially §§1, 1.1–1.5 and B1/B3/B4a/B8/C5a;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md`;
   - `runs/branding-domain-absolute-links-fixer-brief-20260907.md` and `runs/branding-domain-final-live-audit-brief-20260907.md`.
3. Exact product rule: `therapysto.ru`/`APP_BASE_URL` is staff. An organization-bound patient URL uses an eligible active custom domain; otherwise it uses the clinic's permanent alias under the typed `PATIENT_APP_ORIGIN` patient surface. `<slug>.therapygo.ru` is the production form, not a hardcoded universal value and not an emergency URL. Under the current deliberate one-host DEV/TEST configuration, generated patient links must stay on the exact configured patient origin until cutover. Pending/failed/suspended/quarantined custom hosts never win.

## Accepted findings to fix

1. Extend the existing `CustomDomainBindingService.resolvePatientPublicOrigin` seam; do not add a second resolver/getter. Remove the `therapygo.ru` literal from origin computation. Derive the permanent alias from typed `PATIENT_APP_ORIGIN`, preserving scheme and an explicit local port. In one-host transitional configuration, preserve the exact configured patient origin instead of inventing a slug subdomain. Keep eligible active custom domains on HTTPS.
2. `app/api/doctor/patients/[userId]/acquiring-charge/route.ts` must call only the public `resolvePatientPublicOrigin` service seam. Remove the inline `readAnonymousPatientSurfaceProjection` + helper fallback. An unavailable origin fails explicitly before the provider call; no mock-specific production path.
3. Diagnose the isolated signed `materialize-wake` 500 from the final audit. Treat the current named DEV facts honestly: the only organization has no directory row, binding, or published brand. If the failure is the deliberate one-host environment asking the organization resolver for a nonexistent slug projection, the shared typed-origin fallback must keep the existing DEV/TEST reminder path alive. If the cause is different, fix only the reached failure and report it. Do not hide it by swallowing errors or weakening signature/tenant checks.
4. Finish the original required call-site pass that commit `bdd8f9ec4` missed:
   - `apps/webapp/src/infra/repos/pgReminderProjection.ts` still builds patient deep links from staff `env.APP_BASE_URL`;
   - `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` still builds patient profile/mobile follow-up links from integrator staff `env.APP_BASE_URL`.
   Both were explicit F-1 call sites in the first independent audit. Route them through the same trusted organization-origin result, or reuse already-materialized trusted patient URLs; do not create a parallel origin algorithm in integrator and do not mechanically replace staff/admin/operator/service-to-service URLs.
5. Re-check F-3 provenance on the actual path before changing it. The signed wake body and DB principal are trusted; browser query/cookie data must not select a different organization. Keep the existing organization filter if it is useful, but do not invent signed browser tokens or a second membership model. If the prior F-3 wording does not match a reachable browser-controlled path, report that evidence rather than expanding scope.

## Architecture boundaries

- Parameterize/extend existing ports and composition roots where needed. No new domain store, Host resolver, tenant resolver, environment key, or per-producer DB read.
- Keep service-to-service webapp calls and staff links on staff `APP_BASE_URL`; only patient-visible destinations move.
- A new migration is not authorized by default. If the only valid integrator callback solution truly requires schema/DB-function change, stop that subpart with exact evidence instead of improvising DDL; complete the other fixes.
- Preserve strict TypeScript; no `any`.

## Tests and validation

- Do not edit test files. Reuse the auditor-owned acceptance tests and existing relevant suites. The worker writes product code only.
- Run at minimum the retained payment, Yandex, reminder materialization/route/config/custom-domain suites and relevant integrator reminder suites; run webapp and integrator typecheck if both packages change, scoped ESLint, and `git diff --check`.
- Do not run full CI; the lead owns the one final integration CI. Do not start a long-lived server or touch shared `:5200`.
- The adjacent `reminders.notifSettings.d22.test.ts` may pin UI copy/button counts; do not modify it as worker. Name it in the handoff so the independent auditor can classify it under §§10a/10b and delete it only if it has no legitimate behavioral failure.

## Completion

Inspect the entire branch diff from the audited base and every original F-1 call site. Stage only explicit product paths and commit with `#787`. Report the exact 500 cause, the one shared origin path, product paths, exact commands/results, unresolved blocker if any, and commit SHA. Do not finish while a foreground command is running.
