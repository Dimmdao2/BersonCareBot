# TEST c069 acceptance fixes: role-login auth doors

Role: WORKER. Start with the `AGENTS.md` heading map, then read the complete relevant parts of §1/1a/1b, §4a,
§5, §§7/9/10/10a/10b, §§15–17/21 and §24. Read
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially TPB-19..23, and
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`. Work only in the supplied current-feat worktree. Do not
deploy, push, mutate TEST/DEV data, touch PROD, or create a new auth resolver/store.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` TPB-21 —
«Служебная email-доставка подтверждения регистрации и восстановления доступа работает независимо от выключенного
passwordless email-code login.»

Current deployed TEST SHA `c0690ddaac7d2abcf2f531ac0e585a405589f515` has two reachable acceptance failures:

1. Opening `/app?intent=specialist` on the shared TEST host shows the specialist password login, not specialist
   signup. `AuthBootstrap` resolves the signup intent, but `AuthFlowV2` currently applies it only when both
   `emailOtpEnabled` and `specialistSignupEnabled` are true. Staff passwordless email-code is intentionally OFF;
   TPB-21 requires signup confirmation email to remain independent. Make specialist signup reachable without
   re-enabling passwordless staff email login and without adding a role chooser.
2. The patient and platform-admin login pages expose email-code according to their explicit role-login policy, but
   `POST /api/auth/email-otp/start` returns `503 {error: auth_channel_disabled}` on TEST because the route resolves
   policy from Host, which is intentionally shared and resolves to staff. Carry the existing `RoleLoginPortal`
   audience from each explicit login door through email OTP start and confirmation/resend, resolve policy through
   the existing `authPolicyNameForRoleLoginPortal`, and enforce `roleCanUsePortal` before minting the final session.
   A patient/admin credential on the wrong portal must not gain a cross-product session. Inspect whether the
   password route needs the same explicit portal enforcement; extend the same choke point if it does, not a second
   portal resolver.

Reuse `RoleLoginPortal`, `authPolicyNameForRoleLoginPortal`, `roleCanUsePortal`, the existing AuthBootstrap/AuthFlow
props and existing OTP routes. Preserve branded-host surface behavior. Do not weaken disabled-channel checks and do
not tie signup/recovery delivery to passwordless login.

WORKER DOES NOT WRITE, EDIT, RENAME OR DELETE TESTS. Run retained auth/route behavior tests, webapp typecheck,
scoped ESLint and `git diff --check`; no full CI or live shared server. Commit only explicit touched paths, never
`git add -A`. Report exact SHA, root causes, files, checks and the remaining TEST live rerun.
