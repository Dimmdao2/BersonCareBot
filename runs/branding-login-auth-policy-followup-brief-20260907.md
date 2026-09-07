# #787 — finish first-launch staff/patient authentication policy

You are the implementation worker continuing the committed login-surface candidate in `/home/dev/dev-projects/bcb-wt-branding-login-split-20260907`. Complete the bounded owner requirements below in one turn and commit before ending. Do not push, land, deploy, mutate DEV/TEST/PROD, touch DNS/TLS/services, or write/change/delete tests.

## Mandatory reading and authority

Before every action follow the repository header-map rule. Read `AGENTS.md` route and §§1 migration rules if a migration is needed, 2–5, 7, 10a, 10b, 11, 14a, 15–17, 21 and 24 in full. Read `docs/ORCHESTRATION_BINDINGS.md` and `/home/dev/brain/docs/MODEL_TIERS.md`. Use code-search before blind grep.

Authority is `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.6 and atomic requirements `TPB-20`, `TPB-21`, `TPB-22`, plus the already implemented `TPB-17`–`TPB-19`. Read the initial login worker diff first and extend its existing seams; do not duplicate the auth flow, policy resolver, Host resolver or transactional email path.

## Exact product result

- On Therapysto, specialist registration and staff login are distinct screens without a role chooser. Reuse the existing specialist signup start/confirm/slug flow and fields; this task does not invent new profile requirements. Registration verifies email.
- On first launch staff login offers email + password only. Phone, SMS, messenger and OAuth methods remain supported capabilities but are disabled by staff policy. Passkey remains preserved and disabled by default. Do not delete providers or hardcode the presentation around one permanent method.
- A normal correct staff password logs in without an email OTP. If that user enrolled TOTP, preserve the current mandatory factor step. Do not introduce clinic/role-mandatory TOTP.
- Separate transactional email availability (specialist signup confirmation and password recovery) from the switch that enables passwordless email-code login. Today the shared email-channel gate can make signup/recovery unavailable when passwordless staff email login is off; remove that coupling through the existing policy/configuration boundaries. Do not add a bypass specific to one route.
- Patient login copy is «Войти в личный кабинет» without patient/client role labels or selection. First-launch patient methods remain email and phone confirmation through the bot. OAuth and passkey code/configuration stay present but are disabled by initial patient policy; enabling a cell in global admin must expose and authorize the existing method without a code change.
- Preserve all post-auth guards, safe `next` handling and the initial worker's cross-origin links. Host chooses product presentation; account/membership chooses authorization.

## Scope and validation

Keep changes to the smallest existing auth-policy, signup/recovery email gate, login presentation and forward-default seams. If a default-setting migration is required, follow generated-forward/privilege rules and do not mutate a named DB. Do not redesign authenticated cabinets, booking, bots, reminders, domains or unrelated global-admin UI.

Worker does not touch tests. Report any stale or harmful test, especially source/call-shape/copy/DOM/count assertions, for the auditor. Run the existing specialist-signup, password login/TOTP, recovery, surface-policy and login routing suites; webapp typecheck; scoped ESLint; migration consistency checks if applicable; and `git diff --check`. Do not run full CI or start shared ports.

Stage explicit product paths only, never `git add -A`. Commit with `#787`; do not include either brief and do not push. Report changed paths, the exact policy/email separation, commands/results and commit SHA. Do not finish while a foreground command is running.
