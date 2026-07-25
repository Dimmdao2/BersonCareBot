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

## S3 — per-route authorization

Worker running. Must establish, among the rest, the exact blast radius of the owner-deferred
`/api/doctor/patients/*` IDOR **now that FORCE-RLS with a signed per-request principal is live**: is the hole
masked by the DB wall, or still reachable because the stamped principal can see the row?
