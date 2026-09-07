# #787 — split the three login experiences by product surface

You are the implementation worker on a dedicated clone/branch created from the committed branding candidate plus current `feat/doctor-ui-rebuild`. Complete this bounded stage in one turn, commit before ending, and do not push, land, deploy, mutate DEV/TEST/PROD, touch DNS/TLS/services, or write/change/delete tests.

## Mandatory reading and authority

1. Before every action follow the repository header-map rule. Read `AGENTS.md` route and §§5, 7, 10a, 10b, 11, 14a, 15, 16, 17, 21 and 24 in full. Read `docs/ORCHESTRATION_BINDINGS.md` and `/home/dev/brain/docs/MODEL_TIERS.md`. Use code-search before blind grep.
2. Authority is `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially §§1.2c, 2 `TPB-02`, `TPB-03`, `TPB-05`, `TPB-18`, `TPB-19`, and `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §§1–4.
3. Read the current implementation end to end: `proxy.ts`, `config/surfaceRoutes.ts`, `shared/lib/surface/requestSurface.ts`, `AppEntryRsc`, `AppEntryLoginContent`, `RoleLoginPortalHeader`, `AuthBootstrap`, `AuthFlowV2`, `modules/auth/roleLogin.ts`, and the three role-login pages.

## Exact product result

- `therapysto.ru` is the staff product. Its login is for specialists, clinic owners, clinic administrators and clinic employees. The user never selects a role; account and organization membership determine permissions after authentication.
- `admin.therapysto.ru` is a separate platform-operator login. It must not be presented as the place where a clinic administrator signs in, and it has no patient/staff role chooser.
- `therapygo.ru`, `<slug>.therapygo.ru`, and an active custom clinic domain are patient products. Their login is only for patients and uses the resolved TherapyGo/clinic identity.
- Each screen renders only the authentication methods allowed by its already-resolved `authPolicy`. Do not rebuild or duplicate authentication logic.
- The three experiences must not look like one generic role-selection screen with a heading bolted on. Reuse the shared auth engine beneath clear surface-specific presentation; do not create a second auth flow.
- A staff↔patient escape link may remain only as a small cross-product link and must change origin: staff → canonical patient origin; any patient/branded host → canonical staff origin. It must never point to `/app/patient/*` on a staff Host or `/app/doctor/*` on a patient Host. Platform-admin login has no alternate-role link.
- Preserve safe `next` handling and post-auth role/membership guards. Host chooses the product surface, not authorization.

## Current reachable defect

All three route pages call the same `AppEntryRsc`/`AuthBootstrap`; that reuse is correct internally, but the presentation is only a shared card plus different title. `RoleLoginPortalHeader` builds doctor↔patient links by changing path on the current origin. With distinct Hosts the destination is rejected/404 instead of entering the other product. Fix the presentation and canonical cross-origin navigation through existing typed surface config/resolved surface data. Do not introduce another Host resolver, hardcoded production domain, browser-host inference, or environment key.

## Scope and validation

- Keep changes to the smallest existing login/surface presentation seams. Do not redesign authenticated cabinets, clinic management, bot logic, reminders, booking, payment, domains/DNS/TLS, or unrelated navigation.
- Worker does not touch tests. If a UI test asserts exact copy/DOM/count/layout or a behavior test encodes same-host role switching, report its path for the independent auditor; do not satisfy it by preserving the bad behavior.
- Run the existing surface-routing, role-login, auth-policy and post-auth redirect behavior suites; webapp typecheck; scoped ESLint for changed TypeScript/TSX; and `git diff --check`. Do not run full CI and do not start shared ports.
- Stage explicit product paths only, never `git add -A`. Commit with `#787`, do not include this brief, and do not push.
- Report changed paths, exact canonical-link construction, commands/results, any old harmful tests found, and commit SHA. Do not finish while a foreground command is running.
