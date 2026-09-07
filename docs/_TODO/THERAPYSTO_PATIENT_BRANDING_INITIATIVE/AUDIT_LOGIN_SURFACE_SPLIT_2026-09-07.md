# Final independent audit — login surface split and staff 2FA (`33d01514a`)

Candidate: `33d01514a61f37fa9c81bc86fa57504adc1e6460`
Recorded candidate parent/base: `fa2fad18a27c9a2c21481cd505b6f29770944f53`

## Final-pass classification before test reading

| Acceptance item | Classification fixed before opening tests |
| --- | --- |
| `TPB-17` / `TPB-17a`: staff OAuth/passkey remain implemented, disabled by default, and policy-gated | Repeatable behavior at policy and public-route seams; visibility is live view only. |
| `TPB-18`: patient email code and verified TherapyGo-bot contact on standard/branded patient surfaces | Repeatable behavior; reuse the earlier route/unit kill-set. |
| `TPB-19`: independent staff/platform-admin/patient global policy cells | Repeatable behavior at settings/policy and direct-route seams; settings presentation is live view only. |
| `TPB-20`: distinct staff login and specialist registration, existing fields/confirmation, no role chooser | Route/auth behavior is testable; labels, hierarchy, desktop/narrow presentation and absence of role-selection clutter are live view only. |
| `TPB-21`: password-only staff login unless personal TOTP; signup/recovery mail independent of passwordless login | Repeatable security and delivery behavior at public route/service seams. |
| `TPB-22`: TherapyGo login wording, no role chooser, patient default methods and policy-enabled OAuth/passkey | Method authorization is repeatable behavior; wording, role clarity and responsive presentation are live view only. |
| `TPB-23`: owner-only, org-scoped, default-off staff 2FA; TOTP wins, otherwise verified-email factor | Repeatable authorization, tenancy and factor-selection behavior; switch placement/presentation is live view only. |
| Host/product separation, canonical cross-product links and post-auth guards | Repeatable route/redirect/authorization behavior; branded presentation is live view only. |

No acceptance test may assert source text, function/call shape, formatting, DOM/layout/copy details, or element/table counts.

## Final-pass blind kill-set (recorded before test reading)

The first five faults are reused from the earlier login-surface audit; faults 6–14 extend it for the 07.09 staff-policy surface.

1. A second auth engine or Host resolver is added, or Host resolution is used to grant authorization.
2. Staff or platform-admin presentation exposes a role chooser; platform-admin exposes a patient/staff escape link.
3. A staff-to-patient or patient-to-staff link preserves the current origin, or forwards an untrusted `next` across products.
4. A patient path is served on a staff Host, a staff path is served on a patient Host, or an unknown/wrong-product Host no longer fails closed.
5. A post-auth role/membership guard is bypassed or a surface's resolved auth policy is not enforced.
6. Correct staff email+password with no personal TOTP still requires an email code while org-wide staff 2FA is off.
7. A personally enrolled TOTP is skipped, or org-wide policy replaces it with the email factor.
8. Org-wide staff 2FA is on, no personal TOTP exists, and login completes without a verified-email code (or sends the factor to an unverified address).
9. Org-wide staff 2FA defaults on, leaks across organizations, can be changed by a non-owner, or trusts a browser-selected tenant instead of the authenticated membership.
10. Disabling passwordless staff email-code login also disables signup confirmation or password recovery email.
11. Staff signup/login reintroduces a role chooser, removes an existing signup field/confirmation step, or enables phone/SMS/messenger/OAuth on first launch.
12. Patient first-launch policy enables OAuth/passkey, or enabling an existing patient global-policy cell fails to make the method both visible and authorized without a code change.
13. TherapyGo patient login exposes patient/client role selection or the wrong product purpose; staff/platform-admin separation regresses at desktop or narrow width.
14. Host-selected presentation becomes an authorization grant, allowing an account without the required role/membership through a protected product path.

## Interrupted final-pass disposition

The final-pass runner was stopped by the system after 43 minutes before it could finish the live views,
write a verdict, or commit. Its durable test work was recovered from the isolated clone. This section records
only evidence that exists; it is not a `PASS`.

An owner correction arrived after the blind list was written: patient OAuth/passkey switch values belong to the
owner in admin settings. The implementation and audit must not prescribe or migrate them. Therefore the first
clause of fault 12 (a fixed patient default) is superseded and its red assertion was removed. The remaining
contract is unchanged: toggling an existing patient policy cell must control both visibility and direct-route
authorization without a code change.

Recovered evidence:

- `pnpm --dir apps/webapp exec vitest run --project route src/modules/auth/passwordAuth.route.test.ts
  src/app/api/auth/specialist-signup/start/route.route.test.ts src/app/api/doctor/settings/route.route.test.ts`
  → `3` files, `27` tests, PASS on the unmodified candidate.
- The auditor removed two implementation-shaped RSC prop assertions and UI assertions tied to copy/channel count.
  The lead additionally removed the scoped source-scanning cookie-writer test; the two observable `Set-Cookie`
  behavior checks remain.
- The recovered first-launch oracle has one valid red result: the staff policy default still exposes passwordless
  email login. The separate patient-Yandex red result is invalid under the newer owner correction and is not a
  finding.

Reachable finding retained for correction:

- `LOGIN-F1`: a specialist on the staff surface is offered passwordless email login because
  `auth_surface_staff_email_enabled` defaults to/persists as true. Owner behavior requires email + password as
  the first step; email code is only the optional clinic-wide second factor for staff without personal TOTP.

The owner subsequently clarified a further acceptance requirement: credentials/contact proof must never create
a session on another product surface (staff, platform-admin and patient audiences are disjoint). This post-list
surface still needs an independent behavior oracle. A bounded continuation audit must also finish the six live
desktop/narrow views. Current verdict: **INCOMPLETE — NOT FOR LAND**.

## Lead completion after the interrupted audit

The owner instructed the lead to finish the candidate without another agent round. This continuation does not
rewrite the interrupted independent verdict into an independent `PASS`; it records the correction and evidence
performed directly by the lead.

Corrections:

- `LOGIN-F1` is fixed at both compiled-default and persisted-data seams. Staff starts with password/TOTP only;
  migration `20260907T214444_disable_staff_passwordless_channel_defaults.sql` switches old persisted staff
  email/SMS/Telegram/MAX login cells off. Clinic-wide email factor after a correct password is a separate
  org-scoped setting and remains available.
- `setSessionFromUser` now rejects a role that does not belong to proxy's trusted resolved product surface before
  writing the cookie. The gate is central to password, OTP, messenger, passkey and OAuth session minting. It is
  deliberately dormant only when staff and patient origins are the same, preserving the documented one-Host
  DEV/TEST transition.
- No patient OAuth/passkey value was changed. Those cells remain controlled by the owner through existing admin
  settings.

Behavior and static evidence on the corrected candidate:

- Fault injection before the session gate existed: all `8` wrong-surface cases resolved instead of rejecting.
  After the correction,
  `pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/sessionColdComposition.unit.test.ts`
  → `1` file, `13` tests, PASS; the four permitted role/surface combinations still write a session cookie.
- `pnpm --dir apps/webapp exec vitest run --project route src/proxy.route.test.ts`
  → `1` file, `97` tests, PASS.
- `pnpm --dir apps/webapp exec vitest run --project route src/modules/auth/passwordAuth.route.test.ts
  src/app/api/auth/specialist-signup/start/route.route.test.ts src/app/api/doctor/settings/route.route.test.ts
  src/modules/auth/independentAuthMethodToggle.route.test.ts src/proxy.route.test.ts`
  initially produced `125/126` with the sole failure being the old staff default expectation; after that
  expectation was corrected, the changed proxy file passed `97/97`, while the other four files had already
  passed on the same product SHA.
- `pnpm --dir apps/webapp exec vitest run --project ui
  src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx` → `1` file, `5` tests, PASS;
  `pnpm --dir apps/webapp exec vitest run --project unit src/app/app/AppEntryRsc.unit.test.ts`
  → `1` file, `2` tests, PASS after removal of implementation-shaped assertions.
- `pnpm --dir apps/webapp typecheck` and scoped ESLint over the five changed TypeScript/test files → PASS.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`
  → PASS, `pending=2`, `total=141`, rollback complete. Rights analysis: this migration creates, changes and drops
  no database objects or grants; it updates four existing `system_settings` rows, and the existing mirror trigger
  updates their public runtime projection.

Live candidate evidence on isolated `127.0.0.1:5211`:

- staff login, specialist registration, platform-admin login and standard TherapyGo patient login returned 200
  and were inspected at `1440×1000` and `390×844`; the products, purposes and layouts are distinct and have no
  overflow or clipped controls;
- admin hydration required the existing process-local `NEXT_ALLOWED_DEV_ORIGINS` seam with
  `admin.staff.localhost`; after that the interactive login rendered normally;
- the old DEV data still visibly offered staff passwordless email and phone login. This is the live defect that
  expanded the pending correction from one setting to all four staff channel cells; candidate preflight proves
  the forward migration, but it was not executed before landing;
- `berson.patient.localhost` returned a hard 404 because named DEV currently exposes no active public brand
  projection for that slug. The candidate did not mutate clinic data to manufacture a screenshot. Known active
  slug and custom-domain resolution remain covered through the exported production proxy in
  `proxy.productionTenantLookup.route.test.ts`.

Lead disposition: **CODE-READY, HOLD BEFORE LAND.** The remaining acceptance is operational: owner-authorized
landing, migration execution, and final live staff/branded checks against the resulting runtime. Full CI and
landing were explicitly excluded until a separate owner command.

## Earlier login-surface audit evidence (`a3183f03e`)

## Classification before test reading

| Acceptance area | Evidence |
| --- | --- |
| Route isolation, canonical cross-origin navigation, selected auth policy, post-auth guards | Repeatable behavior: route/behavior tests and fault injection where a stable public seam exists. |
| Information hierarchy, clarity, absence of role-selection clutter, branding, desktop and narrow responsive presentation | Live view only; no copy/DOM/count/layout tests. |

## Blind fault list (before test reading)

1. A second auth engine or Host resolver is added, or Host resolution is used to grant authorization.
2. Staff or platform-admin presentation exposes a role chooser; platform-admin exposes a patient/staff escape link.
3. A staff-to-patient or patient-to-staff link preserves the current origin, or forwards an untrusted `next` across products.
4. A patient path can be served on a staff Host, a staff path can be served on a patient Host, or an unknown Host no longer returns 404.
5. A post-auth role/membership guard is bypassed or a surface's resolved auth policy is not enforced.

## Candidate inspection

`a3183f03e` keeps the existing `AuthBootstrap`/`AuthFlowV2` engine and the existing
`resolveRequestSurface` Host resolver. The resolver selects a surface and auth policy; proxy still
applies the independent role/membership post-auth gates. The login-door route constraint accepts
only staff → doctor, platform-admin → admin, and patient → patient. `AppEntryRsc` constructs the
two permitted escape links from typed `PATIENT_DEFAULT_SURFACE.origin` / `STAFF_SURFACE.origin` and
passes no `next` value; admin receives `null`.

## Behavior evidence

- `pnpm --dir apps/webapp exec vitest run --project route src/proxy.route.test.ts` → 97/97 pass.
  The stale platform-admin expectation was changed from `/app/doctor/login` to `/app/admin/login`;
  compact cases now prove that doctor and patient login doors are 404 on the platform-admin Host.
- `pnpm --dir apps/webapp exec vitest run --project unit src/config/surfaceRoutes.unit.test.ts src/app/app/AppEntryRsc.unit.test.ts src/modules/auth/redirectPolicy.unit.test.ts` → 20/20 pass.
  The added RSC acceptance proves both canonical origins, no forwarded hostile `next`, the absent
  admin alternate link, and the resolved auth policy passed to the shared engine.
- `pnpm --dir apps/webapp exec vitest run --project ui src/shared/ui/patient/auth/AuthFlowV2.oauthProviders.ui.test.tsx` → 3/3 pass.
  Replaced two implementation-ID assertions with the observable password method; no harmful
  source, call-shape, count, or layout test remains in this scoped cleanup.
- Scoped ESLint and `git diff --check` passed. `pnpm --dir apps/webapp typecheck` failed outside
  these test changes because the workspace cannot resolve `@bersoncare/platform-merge` and
  `@bersoncare/shared-contracts`; the same failure also reports existing implicit-`any` errors.

## Fault injection

| Deliberate fault | Failing oracle |
| --- | --- |
| Allow doctor login on platform-admin Host | `proxy.route.test.ts` expected 404, received 200. |
| Build staff → patient escape link on staff origin | `AppEntryRsc.unit.test.ts` expected Therapygo origin, received Therapysto origin. |
| Accept external `next` from admin login | `redirectPolicy.unit.test.ts` expected `/app/admin/system-health`, received attacker URL. |
| Enable patient passkey in the default surface policy | `proxy.route.test.ts` policy snapshot detected the extra enabled method. |

All temporary product mutations were reverted before the final green suites.

## Live gate

An isolated candidate was started on free `127.0.0.1:5211` with only process-local safe DEV overrides:
`APP_BASE_URL=http://staff.localhost:5211` and
`PATIENT_APP_ORIGIN=http://patient.localhost:5211`. It reached Next readiness, but the first staff
login compilation failed before a page could render: `Module not found: @bersoncare/platform-merge`.
Therefore staff, platform-admin, and patient desktop/narrow views were not performed. The exact
candidate process group was terminated; `ss -ltn '( sport = :5211 )'` confirmed listener cleanup.

## Queue verdict

**FAIL — HOLD, NOT FOR LAND.** `a3183f03e` is behaviorally covered by the named tests, but the required live
acceptance and webapp typecheck are blocked by unresolved workspace packages. Restore the workspace package
resolution, then repeat one isolated six-view staff/admin/patient desktop+narrow pass; `TPB-20`–`TPB-22` remain
outside this earlier substage's acceptance.
