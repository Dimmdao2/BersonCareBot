# Worker brief — clinic domain self-service settings UI (#787)

This brief is for launch only after the accepted core/API candidate is present in the worker base. Read the mandatory `AGENTS.md` header map before every action, then §§9, 10, 10a, 10b, 11, 12, 16, 17, 21, 22, 24; `README.md`; `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`; `docs/ORCHESTRATION_BINDINGS.md`; and the exact owner requirements in `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §§1.1–1.2, TPB-14, B8 and C5a. Use code-search before broad grep.

## Outcome

Replace the current misleading “literal hostname → saved” organization setting with the complete owner-only self-service journey backed by the accepted custom-domain binding API. Extend the existing settings section and existing domain/slug surface; do not create another settings page, generic store, duplicate API, duplicate cards, or BersonCare-specific branch.

The user journey must be:

1. Enter one base domain such as `clinic.ru`.
2. Choose one of exactly two placements:
   - the domain has no existing site: app address is server-computed `clinic.ru`, instruction `A @ -> <server-returned stable edge IPv4>`;
   - the root already has a site: app address is server-computed `app.clinic.ru`, instruction `CNAME app -> <server-returned platform target>`.
3. Browser sends base domain plus placement only. It never sends or invents final hostname, IP, CNAME target, lifecycle state, organization id, certificate fact, or entitlement.
4. After the API response, show the server-computed hostname, exactly one applicable DNS instruction, and honest lifecycle/readiness: waiting for DNS, certificate being prepared, active, or actionable error/suspended state according to the accepted API contract.
5. Provide one recheck action backed by the accepted server route. Never change nginx, run Certbot, imply an operator issues certificates, or claim “saved/active” before the returned lifecycle says so.
6. Disabling/changing a pending or failed custom domain leaves the technical `<slug>.therapygo.ru` address usable. Active custom-domain canonical behavior is server-side; the UI may link to the returned active URL but must not implement redirects.

Also correct every existing settings-page URL derived from that patient surface. The clinic's technical
root/card address is `https://<slug>.therapygo.ru/` from the accepted patient surface/domain config,
not `APP_BASE_URL/<slug>`. The separate public booking link keeps its existing `/book/<slug>` path but
its origin is the configured patient origin (`therapygo.ru` in split PROD), never the staff
`APP_BASE_URL=therapysto.ru`. Preserve existing slug rename rules and do not collapse the card/root and
booking links into one concept.

Access boundaries:

- Keep domain mutations owner-only and custom-domain-entitlement gated using server state. Read-only/non-entitled UI must not offer an enabled mutation.
- Never rely on hiding controls as the authorization mechanism; the accepted API owns enforcement.
- Preserve existing TEST single-host behavior through its configured fallback; do not hardcode production branching in components.

## UI and test boundaries

- Reuse `DoctorSection`, `DoctorSectionHeader`, `DoctorSectionTitle`, `DoctorField`, doctor primitives, standard `Button size="sm"`, and the existing settings loader. No new dependency or local card system.
- For the placement control, follow §22: human `displayLabel`, never leak enum values. Reuse an existing radio/select pattern.
- Keep copy concise. DNS record/host/target and honest errors are required information, not optional explanatory prose.
- Worker writes no tests. `OrgCustomDomainSection.ui.test.tsx` was already deleted in integration commit `d82f9b71e`: its only oracle pinned wording, labels and control state that the cheaper owner/entitlement HTTP boundary already covers. Keep it deleted and do not recreate/adapt it to the new copy/DOM. Report genuinely UI-only stable action behavior, if any, for the independent auditor; visual/copy acceptance is live, desktop and mobile.
- Do not modify schema/migrations/privileges, proxy/request-surface code, Caddy/nginx/deploy files, or the accepted core API except for a genuinely necessary typed client projection at the settings composition seam. If the API contract is insufficient, stop with the exact blocker rather than inventing a parallel route.

## Validation and delivery

Run scoped Prettier/ESLint, webapp typecheck, and existing targeted settings tests that remain relevant. Do not run full CI unless a concrete uncovered integration risk appears. Run `git diff --check`; inspect desktop and mobile on an isolated allowed DEV path if the environment supports it, otherwise record that live visual acceptance remains unexecuted. Stage explicit task paths only, commit all scoped work with a `#787` message naming why/evidence/B8 and what remains, and do not push/land/deploy.
