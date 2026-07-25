# Deep security audit — 2026-07-25 (owner-requested)

Owner request, verbatim intent: «Надо глубоко изучить модули, там, авторизации и прочие места, где могут
возникать уязвимости, чтобы нас не взломали, поскольку это чувствительные данные.»

**Method.** One worker per slice, then an INDEPENDENT ADVERSARIAL auditor per slice whose mandate is to
*refute* the worker — default verdict REFUTED when the mechanism cannot be demonstrated. Nothing in this file
is a fact until it carries a verdict. Severities written by a worker are proposals; the auditor's corrected
severity wins. This exists because on this very branch two of the twelve migration-pipeline defects, and one
of the branding fixes, were OUR OWN earlier logic being wrong while the report said green.

**Slices.** S1 e-mail OTP · S2 session + revocation · S3 per-route authorization (incl. the owner-deferred
`/api/doctor/patients/*` IDOR) · S4 tenant isolation at the API layer · S5 OAuth Google/Yandex (known
duplicate-e-mail bug, taskdb #54) · S6 media presign/playback.

**Status.** S1 worker done → auditor running. S2 worker done → auditor running. S3 worker running.
S4/S5/S6 not started. NOTHING here has been fixed yet; no fix lands before the owner triages, because several
of these carry product consequences (what "log out" means, how long a patient stays signed in).

---

## S1 — e-mail one-time-code login (worker output, AWAITING AUDIT)

| # | Proposed | Claim | Where |
|---|---|---|---|
| 1 | HIGH | **Cross-purpose redemption.** `email_challenges` has no purpose/flow column, so one table serves public login, self-service e-mail change, admin-initiated *patient* e-mail change, password reset and specialist signup. The public unauthenticated confirm endpoint redeems the latest challenge for an address regardless of which flow created it, and issues a session as that row's `user_id`. Claimed exploit: a clinic admin points a patient's e-mail at a mailbox they control, then logs in **as that patient**. | `modules/auth/emailOtpPublic.ts:113-125`; `db/drizzle-migrations/0232_email_otp_atomic_consume.sql:53-140`; `app/api/auth/email-otp/confirm/route.ts:73-90`; `app/api/doctor/patients/[userId]/email-change/route.ts:86` |
| 2 | HIGH | **Attempt cap is a read-then-write race** (`SELECT` → `attempts+1` in JS → `UPDATE … SET attempts = $n`, no `FOR UPDATE`) on every consume path *except* public login, which was already fixed atomically in 0232. Live on the fully public password-reset route and on specialist-signup confirm. | `modules/auth/emailAuth.ts:110-142`; `app/api/auth/email-password/reset/route.ts:57-59`; `app/api/auth/specialist-signup/confirm/route.ts:46,71` |
| 3 | MEDIUM | Timing side-channel enumerates registered addresses on OTP start: unknown address returns immediately, known address does DB writes **and an awaited outbound send** before responding. | `modules/auth/emailOtpPublic.ts:44-69`; `infra/integrations/email/integratorEmailAdapter.ts:32-54` |
| 4 | MEDIUM | `/api/auth/email-otp/register` returns `duplicate_email` (409) — direct account-existence oracle, contradicting the anti-enumeration stance of the sibling routes. | `app/api/auth/email-otp/register/route.ts:66-68` |
| 5 | LOW | Constant drift: max verify attempts is `4` in TS, `5` hardcoded in the SQL function. | `modules/auth/otpConstants.ts:5`; `0232_…sql:95,107` |
| 6 | INFO | Logger redact list omits `code` and `email`; no current call site logs them, so latent only. | `infra/logging/logger.ts:76-88` |

Worker's "verified safe" (auditor must re-check, not inherit): CSPRNG `randomInt` code generation; peppered
SHA-256 storage, never raw code in SQL; server-side expiry on every confirm path; the public-login consume is
genuinely atomic (`FOR UPDATE` inside one transaction) and re-checks `merged_into_id`; the `merged_into_id`
chain is walked at both create and redeem so a code cannot redeem into a dead identity; per-IP 10/min plus
per-address 60s cooldown; `X-Real-Ip` only (not `X-Forwarded-For`) and fail-closed in production.

### S1 — INDEPENDENT AUDIT VERDICT (both HIGH knocked down; a worse thing found underneath)

| # | Verdict | Correction |
|---|---|---|
| 1 | **PARTLY CONFIRMED → LOW/MEDIUM, not HIGH** | The missing purpose binding is real and confirmed on the live DB (no discriminator in the table, none encoded in `code_hash`, one single insert site with 9 callers, consume selects by e-mail only `ORDER BY created_at DESC LIMIT 1`). But the worker's **actor claim is false**: `app/api/doctor/patients/[userId]/email-change/route.ts:42` requires `session.user.role === "admin"` — the **global platform admin**, not a clinic admin (clinic admins are membership-capability, never session role `admin`). In 8 of the 9 flows the challenge's `user_id` IS the party receiving the code, so cross-redemption gains nothing; only the admin-initiated patient e-mail change is real, and there the delta over the intended flow is exactly one removed requirement — the patient's own session. The account e-mail is rewritten to the admin-chosen address by BOTH paths, so "hand the account to an outside mailbox" is already inherent in the shipped feature; what redemption adds is that the mailbox holder alone finishes it and gets a patient session. **Impersonation, not extra read, by the platform's most privileged principal — who can already mint elevated access directly.** No 2FA gate is skipped because none is armed (`auth_2fa_enabled=false`, zero `staff_security_profiles` rows). Fix it because it arms the moment the roadmap opens that route to clinic admins by capability, not for today's blast radius. |
| 2 | **PARTLY CONFIRMED → MEDIUM, not HIGH; "cap defeated" REFUTED** | The read-then-write shape is confirmed in live `prosrc` (`STABLE` finders, no `FOR UPDATE`, absolute `SET attempts = p_attempts`, each statement its own autocommit) and the absolute set can even **rewind** the counter. But the amplification is architecturally bounded at **N ≤ 2**: an unauthenticated auth route stamps a `bootstrap` principal, which routes to the nonstaff pool with `max: 2` (`webappPoolProvider.ts:209-216,384`), and there is a single webapp process. Arithmetic with 900 000 codes and cap 4: baseline 240 guesses/h → 50 % at ~108 days; with the race ≤480/h → **~54 days**, while emitting ≥60 unexpected OTP e-mails per hour to the victim for weeks. So it is a **~2× weakening, not a defeat** — but the bound is incidental and scales straight back if pool `max` or the instance count is raised. Worker error: `/specialist-signup/confirm` is not a real surface (the `challengeId` is an unguessable UUID from the attacker's own signup). |
| 3-6 | as reported | Timing/enumeration and the constant drift stand; the drift resolves as cap **4** on the JS paths and **5** inside the atomic function. |

**The bigger half of claim 2, which the worker buried: there is NO verification rate limiting at all on six auth
routes.** `isEmailOtpStartRateLimitedByKey` (10/min per IP) is imported by exactly two routes —
`email-otp/start` and `email-otp/register`. Nothing limits `/email-password/reset`, `/email-password/forgot`,
`/email-password/setup-code/complete`, `/email/confirm`, `/specialist-signup/confirm` **or `/email-otp/confirm`**;
`proxy.ts` does CSRF and redirects only; and there is **no `limit_req`/`limit_conn` in any live nginx vhost or in
`deploy/nginx/*.conf`**. An unauthenticated attacker grinds guesses indefinitely with no IP block and no signal.

**MISSED BY BOTH — the escalation payload, and it points at our own new global admin.**
`getCurrentSession` (`modules/auth/service.ts:990-998`) elevates **any** session to `role: "admin"` on every
request if the account's *verified* e-mail appears in the `admin_emails` setting. Chain: authenticated patient →
`POST /api/auth/email/start` with an allowlisted address (caller-chosen, `email/start/route.ts:41`) → brute-force
the code at `POST /api/auth/email/confirm`, which uses the **non-atomic** counter and has **no per-IP limit** →
`claimVerifiedEmail` stamps `email_verified_at` on the attacker's own row → the next request is a global-admin
session. **Dormant today** (`admin_emails` has no row; `runtimeConfig.ts:134` defaults it to `""`), and it arms
the moment that field is filled in the platform-settings UI. **MEDIUM now, HIGH when armed.** This is a concrete
reason never to populate `admin_emails` — the standing note `auth-role-by-allowlist-is-stopgap` should be read as
"do not arm it", and the hard `role='admin'` in the DB (owner ruling, migration 0233) is what makes the allowlist
unnecessary.

**And the highest-value brute-force target today is the freshly created global admin.** TEST holds one
`role='admin'` row in `needs_email_setup` state (e-mail set, `email_verified_at` NULL, no password credential).
`POST /api/auth/email-password/forgot` returns the `challengeId` **openly to an unauthenticated caller** for that
state (`forgot/route.ts:54-62`), and `/email-password/setup-code/complete` then **sets a password and issues a
session** on a correct code — on an unlimited, non-atomic counter, with no TOTP profile to stop it. Prod values
for `admin_emails` and `auth_2fa_enabled` were NOT read and may differ.

Every one of the worker's seven "verified safe" items was independently re-verified and **holds**, with two INFO
caveats it missed: `emailCodePepper()` (`emailAuth.ts:42-44`) falls back to the hardcoded literal
`"test-email-pepper"` when both secrets are absent, with no production assert at that site; and the pepper reuses
the integrator webhook secret cross-purpose. Single-round SHA-256 over a 6-digit code is safe only while that
pepper is secret. `X-Real-Ip` handling is genuinely safe — nginx overwrites any client value and the route answers
503 in production when it is missing.

Not verified: the race was never executed (no writes to TEST, no endpoint exercise) — the interleave is proven
from live `prosrc` plus the autocommit transport, and the ≤2 bound is derived from pool config and a
single-process `systemctl` state, not measured.

### Remedy queued for S1 (unambiguous parts, no owner decision needed)

1. Make the attempt counter atomic on every consume path — `FOR UPDATE` + `SET attempts = attempts + 1`, exactly
   the pattern migration 0232 already proved on the login path. Also settles the 4-vs-5 drift.
2. Add the existing per-IP limiter to the six unprotected confirm/reset routes, reusing the 10/min shape rather
   than inventing a second mechanism.
3. Bind a challenge to its purpose (a `purpose` column, checked at redemption) so a code minted by one flow cannot
   be redeemed by another. Latent today, mandatory before clinic admins get the patient e-mail-change route.
4. Never populate `admin_emails`; treat the DB `role` as the only admin source. Removing the session-elevation
   path entirely is an owner decision, not a defect fix.

## S2 — session cookie and revocation (worker output, AWAITING AUDIT)

| # | Proposed | Claim | Where |
|---|---|---|---|
| 1 | HIGH | **Logout does not revoke.** Sign-out only clears the client cookie and never bumps `session_version`; only the explicit "end other sessions" button and password reset revoke. A cookie copied once keeps working after the victim logs out — up to the full TTL. | `modules/auth/service.ts:1023-1033`; `0215_staff_security_profiles.sql:288-310`; `app/api/auth/logout/route.ts` |
| 2 | HIGH | **Patients have no revocation path at all** (`session_version` lives in `staff_security_profiles`; the revoke surface is staff-only), and the sliding renewal extends expiry on any request past half-TTL, so a replayed stolen patient cookie can ride indefinitely. Only deleting the `platform_users` row stops it. | `modules/auth/sessionCookie.ts:75-92`; `proxy.ts:47,54,70`; `app/app/account/StaffSecuritySection.tsx:112,180`; `guards/requireRole.ts:89-111` |
| 3 | MEDIUM | Removing a doctor from a clinic is **not** a session-revocation event; the session stays valid and keeps `account.self`, losing only org-scoped DB access. | `modules/organization-membership/service.ts:53-64`; `sessionPrincipal.ts:40-51` |
| 4 | LOW | `resolveSessionUserAgainstDb` fails **open** for patients on a transient DB error (returns the unverified cookie user) and fails closed for staff. | `modules/auth/service.ts:142-167` |
| 5 | INFO | `toggleAdminMode()` can never toggle off — `adminMode` is forced true whenever `role === "admin"`. Dead/misleading, not an escalation. | `modules/auth/service.ts:105-107,1035-1051` |
| 6 | INFO | Allowlist-based admin elevation (`admin_emails` in settings, `ADMIN_PHONES`/`ADMIN_TELEGRAM_ID` env) is still a parallel grant path beside `platform_users.role`; writing it is gated to existing admins. Matches the standing "role-by-allowlist is a stopgap" note. | `envRole.ts:112-171`; `app/api/platform/settings/route.ts:92-113` |

Worker's "verified safe" (auditor must re-check): MAC verified with a constant-time compare **before**
`JSON.parse`, algorithm server-pinned; absolute expiry enforced server-side regardless of cookie `Max-Age`;
`organizationId` is not in the cookie at all and `role` is re-derived from `platform_users` every request;
`session_version` mismatch kills the session on every guarded path including API routes, and the edge proxy
makes no auth decisions; `adminMode` cannot be forged independently of the DB role; `httpOnly`, `SameSite=Lax`,
`secure` in production, and **no `domain` attribute anywhere** (matters as custom clinic domains arrive);
CSRF is Origin/Referer based and fail-closed when both headers are absent.

Incidental, unrelated to security but in this area: the CSRF frozen-route-census test is currently failing on
a route count (517 expected vs 518 actual) — a merge-gate test that must be reconciled before landing anything
nearby.

### S2 — INDEPENDENT AUDIT VERDICT (all four claims survive; two got WORSE)

Auditor mandate was to refute. Result: citations exact, all four claims **CONFIRMED**, with corrections that
make the top two more severe, plus four things the worker missed.

| # | Verdict | Correction |
|---|---|---|
| 1 | **CONFIRMED, blast radius worse** | The window is **not** capped at 7d/90d. `proxy.ts:70` runs `applySessionRenewalToResponse` on every `/app` and `/api` request, and `sessionCookie.ts:138-155` does **no DB and no version check** — so the *attacker's own replay* slides `expiresAt` forward. A cookie copied once and used at least once per TTL stays valid **indefinitely** after the victim logs out. There is no server-side session identity anywhere to revoke: `rg "jti\|sessionId\|denylist\|revoked_at\|cookieHash"` over `modules/auth/` → zero hits. |
| 2 | **CONFIRMED, and it is not patient-only** | Renewal applies identically to staff, so **staff** sessions are also effectively permanent under replay. Real numbers: staff TTL 7d, patient TTL 90d, renew when remaining < TTL/2 **or** `now - issuedAt >= 86400`; since `renewSessionIfActive` deliberately preserves `issuedAt` (pinned by `sessionCookie.test.ts:56`), that second condition is permanently true after 24h — the "24h minimum interval" **throttles nothing**, every request renews. `issuedAt` is an available absolute-age anchor that nothing reads. |
| 3 | **PARTLY → downgrade to LOW** | Nothing anywhere bumps `session_version` except `app.revoke_staff_sessions()` and the TOTP functions — verified independently — but what a removed doctor's cookie still reaches is thin: `account.self` surfaces, `/api/account/security/*`, `/api/me`, own identity fields. Membership is re-resolved per request and fails closed; demoting the row to `client` kills even that on the next request. |
| 4 | **CONFIRMED, LOW is right** | Fails open for `client`, closed for staff, and the fail-open branch returns the same object so the version comparison trivially passes. Inert today. Notable detail: that branch keys off the **cookie's** role — the one place a role is read from the cookie — but it is HMAC-signed and a client cookie only ever gets client fail-open. |

**Missed by the worker, found by the auditor — the important part:**

1. **The single revocation mechanism does not function for ANYONE on TEST.** `SELECT count(*) FROM
   staff_security_profiles` → **0** (4 admins, 1 doctor, 276 clients, zero profiles).
   `app.revoke_staff_sessions()` raises `staff_security_profile_missing` without a row, and the route is
   additionally unreachable because it demands `staffSecurity.assurance === "factor_verified"`, obtainable only
   from a TOTP-enrolled profile. So "Завершить другие сеансы" throws for every current user.
2. **Password reset silently revokes nothing** for profile-less accounts:
   `api/auth/email-password/reset/route.ts:67-70` calls `revokeSessions()` only `if (security)`, and `getStatus()`
   returns `null` for all 281 TEST users. "Reset the password to kick the attacker out" fails silently.
3. **`platform_users.is_archived` is not a session kill switch** — `pgUserByPhone.findByUserId:114-122` has no
   `is_archived` predicate and no guard checks it. Two archived `admin` rows exist on TEST.
4. **LOW: `GET /api/auth/logout` is cross-site triggerable** (`csrfOrigin.ts:91` classifies only
   POST/PUT/PATCH/DELETE), so an `<img>` tag logs a user out. Denial-of-session only.

Every "verified safe" item was re-checked and **all six hold** (MAC-before-parse with constant-time compare,
server-side absolute expiry, DB-derived role with only dev-bypass/missing-DATABASE_URL/non-UUID exceptions that
are each gated and cannot ship to production, version compared on every guarded path, no cookie `domain`
anywhere, CSRF fail-closed when both headers are missing).

Not verified: no cookie was minted, forged or replayed (by instruction) — the acceptance-after-logout and the
unbounded renewal are proven by exhaustive path reading plus the DB state that makes the version comparison a
no-op. **All DB facts are TEST only; prod may differ and is out of reach by rule.**

### Proposed remedy for owner triage (NOT built)

The root cause is that a session has **no server-side identity**, so nothing can be revoked and nothing bounds
its life. Two contained changes fix all of it at one chokepoint, rather than per-flow patches:

1. **One timestamp column on `platform_users`** (e.g. `sessions_valid_from`), compared against the cookie's
   existing `issuedAt` in the one place every request already passes through (`service.ts:912`, beside the
   current `securityVersion` check). Setting it to `now()` invalidates every existing session of that user.
   Logout, password reset, archive, role change and membership removal all become one-line writers. This covers
   **patients too**, which the staff-only `staff_security_profiles` mechanism structurally cannot.
2. **An absolute age cap on renewal** — `issuedAt` is already carried and deliberately preserved, so refusing to
   renew past a fixed maximum age is a few lines in `sessionCookie.ts` and removes the "permanent under replay"
   property even for a cookie whose owner never logs out.

**Owner decisions this needs before it is built:** (a) the maximum life of a session before a fresh login is
required — separately for staff and for patients, since 90 days for a patient was a deliberate convenience
choice; (b) whether deploying it may sign everybody out once (setting the new column to `now()` at migration
time is the clean start, but it means every current user logs in again).

### S3 — INDEPENDENT AUDIT VERDICT (the IDOR really is closed; identity is the real hole)

**CLAIM 1 — CONFIRMED for the tree the finding was filed against, coverage stated.** The auditor enumerated
**handlers, not files**: 38/38 per-patient handlers in the 25 files under `app/api/doctor/patients/[userId]/**`
carry the org-scoped resolution, verified individually plus a mechanical check that **no handler calls a data port
before resolving** (zero ordering bugs). The wall is slightly *stronger* than the worker described — it also
requires `platform_users.role = 'client'`. `gate.ctx.organizationId` is server-derived with the session user id as
its only input. **The old owner-deferred IDOR is genuinely closed. Do not re-litigate it.**
Corrections to the worker's framing:
- The claim does **not** extend cleanly to the `doctor/clients/**` family: 22/31 handlers there are walled. Of the
  9 that are not, three are collection/create (org supplied from the gate), four are hard fail-closed stubs, and
  **three are genuinely unscoped** — `clients/[userId]/merge-candidates` (platform-wide name/phone/e-mail of
  candidates), `clients/name-match-hints` (global PII, up to 500 groups × 20 members) and
  `clients/integrator-merge` (ids taken from the **body**, no org filter). All three gate on
  `requireAdminModeSession()`, and a clinic doctor can never pass it (a global admin in admin mode holds only
  `platform.operations`, never `clinical.workspace`, and vice versa — `workspaceCapabilities.ts:41-42`). Unscoped
  **by design**, LOW.
- **Forward landmine:** the wall accepts enrollment status `IN ('invited','active')`. `discharged`/`archived` exist
  in the CHECK constraint but **nothing in the codebase writes them today**, so the wall is complete *now*; the
  first code that writes `discharged` will silently 404 that patient's entire card for their own clinic, and the
  tempting fix will be to loosen the wall.
- **Nobody has runtime proof.** 17 test files mock the resolver to null; grep for `other-org|foreign|cross-org`
  across both trees returns **zero**, and the live TEST DB has exactly **one** organization. The wall is
  code-verified and mock-verified, **never runtime-verified against a second tenant**. This is the single biggest
  hole in anyone's confidence — worker's or auditor's — and it is closable by seeding one second organization.

**CLAIM 2 — CONFIRMED and raised to HIGH.** `platform_users` has `relrowsecurity = f, relforcerowsecurity = f`,
and **two policies exist on it that are therefore entirely inert** — somebody wrote identity policies that never
took effect. Quantified (pure SELECT, rolled back): `BEGIN; SET LOCAL row_security=on; SET LOCAL ROLE app_staff;`
→ **281 of 281 identity rows visible with principal_org = NULL**, while the same unprincipled backend gets zero
rows from every FORCE-RLS child table. `app_staff` is a login role, not BYPASSRLS, not the owner. So identity has
**no** DB wall, not a weaker one. The table is **absent from the asserted 169-target FORCE list** in
`deploy/postgres/phase4-force-rls-cutover.sql` while its satellites `platform_user_contacts`, `user_phone_history`
and `org_enrollments` are present, and **no ruling documents the exclusion** — it reads as an oversight.
Over-approximation disclosed by the auditor: the probe ran via `SET ROLE` inside a `postgres` backend, which is
exactly the point (RLS is off table-wide, so no policy can filter it for any role, principal or not); a two-org
HTTP demo is impossible while TEST has one org.

**CLAIM 3 — CONFIRMED, MEDIUM latent, and "inert" holds for a different reason than the worker gave.** Neither
money handler calls `requireEntitlementForMutation` (9 sibling files do), and there is no deeper gate —
`pgPatientPayments.ts` and `registryAcquiringGateway.ts` contain zero mechanic/lifecycle references, and the
gateway is real, not a stub. What actually makes it inert is the lifecycle half: `resolveAccess`
(`pgOrgEntitlements.ts:81-118`) can only return `read_only`/`blocked` when a **trial row exists** past grace, and
`saas_organization_trials` has **0 rows** while the single org is `commercial_access_state='compatibility'`. So no
org can be blocked today — and it is **one data row from live**. The day the first trial expires with
`post_trial_behavior='read_only'`, that org keeps full ability to charge cards while every clinical sibling
correctly 403s. It is money; fix before tariff enforcement ships.

**MISSED BY THE WORKER — the direct counterexample to "the organization is always server-derived":**
**four `/api/integrator/*` routes take `organizationId` from the query string** and stamp it as the DB principal:
`integrator/delivery-targets`, `integrator/reminders/rules`, `integrator/web-push/subscriptions`,
`integrator/web-push/vapid`. Despite its name, `enterVerifiedIntegratorOrganizationPrincipal`
(`app-layer/principal/integratorOrganizationPrincipal.ts:6-14`) verifies **only a UUID regex** — nothing binds the
organization to the calling credential, and the HMAC is **one shared platform secret**. Any holder of that secret
stamps any tenant's principal at will. Possibly intended for a multi-tenant bot, but undocumented as such, and it
converts one leaked secret into full cross-tenant read. **MEDIUM/HIGH — needs an owner ruling on intent.**
Also missed: `appointment_records` and `patient_bookings` carry `phone_normalized`, `contact_phone`,
`contact_email`, `contact_name` with **no `organization_id` column at all** and no RLS — the same single-wall class
as CLAIM 2, and they cannot be added to the FORCE list without a schema change. And two handlers
(`clients/[userId]/supplementary-contacts` POST and `[contactId]` DELETE) pass the raw path `userId` instead of the
canonical resolved id — alias divergence at worst, no cross-tenant reach, one-line fix.

All four re-checked "verified safe" items hold (patient self-scoping resolves from the caller's own list;
`admin/settings` rejects non-per-org keys on both the batch and single-key paths; `/api/internal/*` is
`timingSafeEqual` on **13/13** routes and fails closed with 503 when the secret is unset; the only enumerable
integer on the surface is `integrator_user_id`, exposed solely by the two global-admin merge tools).

**Warning about local test signal:** migration `0234_current_patient_support_activity` fails `permission_denied`
(42501) in the vitest globalSetup, so route tests here run against **in-memory repos**. No green route test in
this repo should be read as DB-level evidence.

### OWNER DECISIONS (2026-07-25) — the remedy above is APPROVED and in build

- **Session lifetime: staff 12 hours of activity, patient 30 days.** Owner: «сотрудник — 12 часов активности,
  пациент — 30 дней - принимаю».
- **Signing everybody out on deploy is allowed.** Owner: «выкатке разлогинить всех можно - на проде там будет
  много нового в том числе юридические согласия, так что логично. Это еще доделаем до выкатки». So the migration
  backfills `sessions_valid_from = now()` for every row, and the legal-consent work due before the prod cutover
  will land in the same forced re-login.

Interpretation taken (stated to the owner, not re-asked): the approved numbers are the **idle** bounds — a
session unused for 12 h (staff) / 30 days (patient) is dead. Because the audit proved the sliding renewal is the
actual defect, an **absolute** ceiling is also needed, and it is taken from the CURRENT constants so that no
value anywhere grows: **staff 7 days, patient 90 days** maximum age from `issuedAt`, after which a fresh login is
required regardless of activity. Every number in the change either shrinks or stays the same.

Build shape (one chokepoint, per the owner's standing no-duplication rule): a `sessions_valid_from timestamptz`
column on `platform_users`, read in the single place the session identity is already re-derived from the DB
(`infra/repos/pgUserByPhone.ts` `findByUserId`) and enforced in the single place every request already passes
(`modules/auth/service.ts` beside the existing `securityVersion` comparison). Writers: logout (both the POST and
GET handlers), password reset (unconditionally — replacing the `if (security)` no-op), archiving a user, and any
role change. Clinic-membership removal is deliberately excluded (graded LOW: only `account.self` survives).

## S3 — per-route authorization (worker output, AWAITING AUDIT)

**Headline claim: the owner-deferred `/api/doctor/patients/*` cross-clinic IDOR is CLOSED** — and not by the DB
wall. The worker reports that all 25 route files under `app/api/doctor/patients/[userId]/**` (and the
`doctor/clients/[userId]/**` family, minus the intentionally global admin merge tools) resolve the patient
through `deps.doctorClientsPort.getClientIdentityForOrganization(userId, gate.ctx.organizationId)`, whose SQL
(`infra/repos/pgDoctorClients.ts:1151-1170`) requires an `org_enrollments` row for the caller's own
server-resolved organization, so a clinic-A doctor gets 404 for a clinic-B patient before the query ever reaches
RLS. Sub-object ids (`comorbidityId`, `fileId`, `visitId`, `complaintId`, `diagnosisId`) are additionally scoped
by `patientUserId` **and** `organizationId` in the same transaction. Attributed to the T0.3.35/T0.3.36 hardening
pass of ~2026-07-09; 11/11 existing tests pass, including "maps principal mismatch errors to not_found".
**This claim is under adversarial audit with an explicit coverage requirement** — a single unguarded handler
refutes it, and this is exactly the kind of "the old bug is gone" claim that must not be accepted on a report.
If it is confirmed, the standing memory note `idor-patient-routes-deferred-to-saas` and the docs listed below
are STALE and must be corrected: `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-04.md`,
`…-06.md`, and this file's own earlier framing.

| # | Proposed | Claim | Where |
|---|---|---|---|
| 1 | INFO (structural) | **`platform_users` — the core PII table (name, phone, e-mail, birthdate, gender) — has RLS disabled entirely** (`relrowsecurity=f, relforcerowsecurity=f`, read live), while every child clinical table carries FORCE RLS. So clinical data has two independent walls and *identity* has exactly one: the app-level org check above. Correct today, but a future route reading `platform_users` directly has no DB backstop. Worker did not quantify the blast radius. | live `pg_class`/`pg_policy` |
| 2 | MEDIUM (latent) | **Money routes are not entitlement-gated:** `patients/[userId]/payments` (record a payment) and `patients/[userId]/acquiring-charge` (charge a card) contain no `requireEntitlementForMutation`, unlike every clinical sibling in the same directory. The `payments` mechanic exists in the registry but is checked only for settings keys. Inert only because the mechanic defaults to enabled and enforcement is dormant — a real bypass the moment tariff enforcement ships. | `app/api/doctor/patients/[userId]/payments/route.ts`; `…/acquiring-charge/route.ts`; `modules/org-entitlements/types.ts:17` |
| 3 | LOW | The global-admin predicate is hand-rolled in 8+ route files instead of using the shared `requireAdminModeSession()`, so tightening the canonical function (e.g. to demand verified 2FA) would not propagate. | `modules/auth/requireAdminMode.ts` + the `admin/mode`, `admin/smtp-test`, `admin/rubitime/*` copies |
| 4 | LOW | One admin route family checks `role === "admin"` but omits `adminMode`. Harmless only because `adminMode` currently cannot be false for an admin (S2 INFO #5) — it becomes live if that is ever fixed. | `app/api/admin/google-calendar/calendars/route.ts:22-24` |

Worker's "verified safe" (auditor must re-check): the whole `doctor/patients|clients/[userId]` tree; `doctor/courses`
entitlement read+write; `admin/settings` per-key global-vs-per-org gating; the deliberately cross-tenant global
merge/dedup tools (all gated to true global admin); `platform/settings` and `platform/error-tracking`;
patient-side self-scoped routes (reminders, practice completion, media submission, diary purge) which resolve the
object from the caller's own list rather than by naked id; `doctor/treatment-program-instances|online-intake|tasks|
comments|messages` object-level org equality; `integrator/*` HMAC and `internal/*` `timingSafeEqual` bearer;
`references/[categoryCode]` public baseline data only. Also: patient/clinical ids are UUIDs everywhere; the only
integer path ids are Rubitime catalog rows behind global admin.

Coverage the worker itself flagged: ~90 of ~500 route files read line-by-line; the rest keyword-scanned only.

---

## LOGIN IS BROKEN ON TEST — root cause found and reproduced (2026-07-25, orchestrator)

The owner reported: cannot reset the password, cannot log in by e-mail code, only password is offered. Two
independent causes, both now understood.

**Cause 1 — the SMTP credential was scrubbed, and it WAS in the dump.** I previously told the owner the
credential is not in the prod dump (recorded in §3.6 of the deploy runbook). **That was wrong.**
`pg_restore --data-only -t system_settings` of `/tmp/bcb-prod-fresh.dump` into a scratch DB shows
`smtp_outbound` present with a real object value (`from, host, port, user, secure, password`). It is empty on
TEST because the **full-reset path deliberately scrubs it**: `deploy/postgres/test-settings-override.sql:88-91`
writes `{"value":null}` under `\if :test_settings_overlay_reset` (a code-only closure preserves it). That is a
send-safety measure, not a bug. Restored onto TEST from the dump via `dblink` so the value never passed through
a shell or a log; both `public.system_settings` and the `integrator.system_settings` mirror now carry it.
Send-safety on TEST is intact and is what makes this safe: `DEV_REDIRECT_EMAIL` sends everything to the owner's
address, with a two-address passthrough allowlist. **§3.6 of `SAAS_PROD_DEPLOY_PROCESS.md` must be corrected.**

**Cause 2 — the public login screen is structurally unable to see the setting.** `isSmtpConfigured()`
(`modules/auth/authChannelPolicy.ts:31-39`) → `getConfigValue("smtp_outbound","")` →
`readAdminSystemSettingString` → `readSystemSettingInnerValueByScopes`, which issues a **direct
`SELECT ... FROM system_settings`**. The login-config route stamps a **bootstrap** principal, which routes to
the nonstaff pool. Reproduced live:

```
BEGIN; SET LOCAL ROLE bcb_test_nonstaff_login;
SELECT scope FROM system_settings WHERE key='smtp_outbound' …;
→ ERROR: permission denied for table system_settings
```

`fetchFromDb` (`modules/system-settings/configAdapter.ts:103-109`) swallows the error and returns `null`, so the
env fallback `""` wins and the channel reports "not configured" **regardless of the credential**. `app_staff` has
the privilege; `bcb_test_nonstaff_login` and `app_patient` do not, by design. This is the known class recorded in
[[force-rls-cutover-breaks-unprincipled-reads]]: an unprincipled read goes silently empty instead of loud.

Confirmed the backend path itself is healthy — `POST /api/auth/email-otp/start` answers **200** (the route gates
on the `auth_email_enabled` toggle, not on `isSmtpConfigured`). **Only the login screen's channel list is
broken.** Fix in flight: a `SECURITY DEFINER` accessor answering the boolean "is outbound e-mail configured?"
and nothing else, granted to the public pool role, with the deploy's exact secdef count updated in the same
change (a mismatch there is a FATAL mid-closure).

Also confirmed while diagnosing: **`auth_2fa_enabled = false`** and `staff_security_profiles` is empty — which is
why the owner's TOTP enrolment "did not work" and why the "end other sessions" button raises for everyone.
`admin_emails` does not exist as a row at all; `admin_phones`, `admin_telegram_ids`, `allowed_telegram_ids` are
empty arrays — so the S1 escalation chain is unarmed today, though the code path is live.
**New find, unrelated slice:** `system_settings.telegram_bot_token` holds a bot token in **plaintext** — whoever
reads the settings table owns the bot.

### Correction to the S3 auditor: the integrator organization parameter is NOT untrusted

The S3 auditor graded "four `/api/integrator/*` routes take `organizationId` from the query string and stamp it
as the DB principal behind only a UUID regex" as MEDIUM/HIGH. I verified the signature scheme myself and the
grade does not hold: `assertIntegratorGetRequest.ts:18-19` builds the canonical string
`GET {pathname}{search}` — **the query string, and therefore `organizationId`, is inside the signed payload** —
and `verifyIntegratorSignature.ts:11-39` enforces a freshness window on the timestamp and compares with
`timingSafeEqual`. So an outsider cannot select or tamper with a tenant; only a holder of the shared secret can.
The residual, true statement is narrower: **one shared secret spans all tenants**, so a leak of that single key
exposes every clinic at once. That is a key-custody property of a single trusted backend service, not an open
door. **Corrected severity: LOW/INFO.** These routes are live infrastructure, not dead code — the integrator app
calls all four (`deliveryTargetsPort.ts`, `reminderRulesRoute.ts`, `webPushAccessPort.ts`), so cutting them is
not an option.
