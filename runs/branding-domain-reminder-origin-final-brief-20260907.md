# #787 — finish patient origin in integrator reminder callbacks

You are the implementation worker continuing the committed candidate in `/home/dev/dev-projects/bcb-wt-branding-domain-absolute-links-20260907` on branch `wt/branding-domain-absolute-links-20260907`. Complete this bounded product fix in one turn, commit before ending, and do not push, land, deploy, mutate DEV/TEST/PROD, touch DNS/TLS/services, or write/change/delete tests.

## Mandatory reading and authority

1. Before every action follow the repository header-map rule. Read `AGENTS.md` route and §§1 migration rules, 5, 7, 10a, 10b, and 24 in full. Read `docs/ORCHESTRATION_BINDINGS.md` and `/home/dev/brain/docs/MODEL_TIERS.md`. Use code-search before blind grep for discovery.
2. Read the active owner authority and evidence:
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially §§1, 1.1–1.5 and B1/B3/B4a/B8/C5a;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md`;
   - `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md`;
   - `runs/branding-domain-absolute-links-continuation-brief-20260907.md`;
   - `runs/branding-domain-final-live-audit-brief-20260907.md`.
3. Exact product rule: `therapysto.ru` and staff `APP_BASE_URL` are never patient destinations. An organization-bound patient URL uses an eligible active custom domain; otherwise the clinic's permanent alias under typed `PATIENT_APP_ORIGIN`. `<slug>.therapygo.ru` is the default production patient address for every clinic without paid custom-domain branding, not an emergency address. In deliberate one-host DEV/TEST configuration, preserve the exact configured patient origin until cutover. Pending, failed, suspended, or quarantined custom hosts never win.

## The remaining reachable defect

`apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` still constructs patient-visible profile/mobile/settings destinations from integrator staff `APP_BASE_URL` and contains a literal `bersoncare.ru`. The callback has a trusted canonical patient principal but its existing webapp write result does not expose the trusted organization needed to resolve the patient origin. `BaseContext.actor.tenantId`, browser query, cookies, callback text, or a caller-supplied organization are not trusted selectors.

Finish this path through the existing common seam; do not add a second origin algorithm:

1. Extend the existing narrow reminder callback result/function so the same trusted database operation that resolves the canonical patient also returns its trusted organization identity. Prefer extending the existing `app.patient_disable_reminder_messenger_topic(...)` / notification-settings seam and `RemindersWebappWritesPort`, not a new per-producer lookup or store.
2. Resolve the public patient origin only through the existing webapp-owned `CustomDomainBindingService.resolvePatientPublicOrigin(organizationId)`. If the integrator needs a new HTTP call, expose the smallest authenticated service-to-service route through the existing integrator↔webapp client/composition pattern. It is an adapter to the existing resolver, not another resolver and not duplicated domain-selection logic in integrator.
3. Use that trusted resolved origin for all patient-facing buttons/text produced by the affected reminder callbacks, including profile/mobile/settings references. Preserve staff/admin/service-to-service destinations on staff `APP_BASE_URL`.
4. Fail closed when trusted organization or patient origin cannot be resolved. Do not silently fall back to staff origin, `bersoncare.ru`, a browser host, or hardcoded `therapygo.ru`.
5. Inspect the entire committed branch diff and all original F-1 call sites. Report any remaining reachable patient-visible use of staff `APP_BASE_URL`; do not create a string/grep test for it.

## Remove the obsolete Rubitime booking fallback

The owner confirmed there is no alternative booking system: if the trusted internal booking URL cannot be formed, there is no substitute URL to send. `BOOKING_URL=https://dmitryberson.rubitime.ru` is currently present in both local DEV and the active TEST integrator env, and the live code can still use it as a fallback. Remove this obsolete product path completely:

1. Remove `BOOKING_URL` from the integrator runtime schema and dev defaulting. Remove every executable fallback that substitutes `env.BOOKING_URL` when an internal `/app/patient/booking` entry URL is unavailable. Fail closed by omitting the booking URL/button or by the existing honest error path; never substitute another host.
2. Remove `BOOKING_URL` from active env examples and active deployment documentation. Do not edit ignored live env files; the lead will remove the key from DEV/TEST only after the compatible code is landed and TEST is deployed.
3. Replace the stale active `docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md` Rubitime description with the actual internal TherapyGo/branded booking behavior, or remove obsolete Rubitime-only sections when no current behavior remains.
4. Remove executable Rubitime-only diagnostics/types from the active product where they no longer have a producer. Preserve historical/archive evidence and migrations; do not rewrite history or delete unrelated BersonCare personal menu content in this stage.
5. Use exact search after the change and report every remaining non-archive Rubitime occurrence. A source-text absence test is forbidden.

## Migration and privilege boundary

A minimal forward migration is authorized only to extend the already-existing reminder seam function result/signature needed above. Do not add tables, columns, roles, policies, stores, or a second lookup.

- Timestamp filename, statement owner markers, breakpoints, verification probe, and rehome marker must follow `AGENTS.md` §1 exactly.
- The migration must contain no `GRANT`, `REVOKE`, role, default-privilege, or policy statements. Declare function identity/execute access in `deploy/postgres/privileges/declaration.ts` and regenerate derived privilege artifacts using the existing generator if the signature changes.
- Preserve/reconcile the existing narrow `app_seam_reminder_patient_owner` boundary. Analyze and report: objects/signatures changed, statement/security-definer owner, runtime roles, table/column accesses required, and declaration coverage.
- Do not run migration execute or mutate a database. Candidate owner-aware rollback-only preflight is owned by the subsequent independent `auditor-live` gate.

## Architecture and scope limits

- Parameterize/extend existing ports and composition roots. No new domain store, Host resolver, tenant resolver, environment key, or parallel patient-origin helper.
- Reuse existing authenticated M2M conventions and strict types; never use TypeScript `any`.
- Do not refactor unrelated reminder behavior, bot menus, notification-channel product policy, UI, DNS, TLS, Caddy, or server configuration. Deployment documentation and env examples may change only to remove the obsolete `BOOKING_URL` contract above.
- A worker does not write tests under `AGENTS.md` §10b. Do not modify the adjacent `reminders.notifSettings.d22.test.ts`; name it for auditor classification because it may pin copy/button counts.

## Validation and completion

- Run the retained payment/Yandex/reminder materialization/route/config/custom-domain suites and relevant integrator reminder/booking-link suites already present without editing them. If an old test requires the removed `BOOKING_URL` fallback or is a harmful source/call-shape/count oracle, report its exact path for the auditor; the worker still does not modify tests.
- Run webapp and integrator typecheck, scoped ESLint for changed TypeScript, the existing migration/privilege generation consistency checks if a migration changes the signature, and `git diff --check`. Do not run full CI and do not start a shared server.
- Use explicit-path staging only; `git add -A` is forbidden. Commit every task-related product/migration/generated path with `#787`; do not include the brief and do not push.
- In the final report give: exact trusted-org flow, exact single origin seam, migration/privilege analysis if applicable, changed product paths, commands/results, remaining blockers, and commit SHA. Do not end while a foreground command is running.
