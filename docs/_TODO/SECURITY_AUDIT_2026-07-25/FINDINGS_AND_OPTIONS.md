# Security findings and solution OPTIONS — full record (2026-07-25 → 26)

**Status: nothing here is a decision.** Every remedy below is an OPTION for discussion and analysis. Some
findings are already fixed (marked FIXED with the commit); the rest are open. The owner's instruction for the
next stage is explicit: a full deep security re-audit, and for each problem a solution grounded in recognised
world security standards — not crutches, not improvisation.

**How to read the evidence column.** `VERIFIED` = I ran it against the live database or the live host and saw
the result. `CODE` = read from source, not executed. `CLAIMED` = a worker or auditor asserted it and it has not
been independently reproduced. Three of my own explanations during this session were wrong before I looked at
the running system, so this distinction is load-bearing.

---

# A. Host and process privilege

## A1. The web application effectively runs with root-equivalent rights — HIGH, open

**VERIFIED** by reading `sudo -l -U deploy`. The webapp systemd unit runs `User=deploy`, and `deploy` holds:

```
(root) NOPASSWD: /usr/bin/sed, /usr/sbin/nginx, /bin/systemctl, /usr/bin/apt-get
(tgcarebot) NOPASSWD: /usr/bin/git, /usr/bin/pnpm, /bin/bash
```

Each of three entries is independently equivalent to full root: `sed` as root is arbitrary file write
(`/etc/sudoers`, `/etc/shadow`); `apt-get` runs maintainer scripts as root; unrestricted `systemctl` controls
every unit. So any code execution inside the webapp escalates to root on a box that also hosts storylama and
tgcarebot, and holds every database and every secret.

This subsumes almost everything else in this document: the DB role model, RLS, tenant walls and definer seams
all assume the attacker does NOT have root.

**Options.**
1. Split the identity: a runtime user with **no sudo at all** for the app; a separate deploy user for releases.
   Service restarts move to a narrowly scoped mechanism (polkit rule for the specific units, or a fixed-command
   wrapper), never `sudo systemctl` unrestricted.
2. Keep one user but reduce the sudo list to exact argv (no `sed`, no `apt-get`, systemctl only for named
   units). Cheaper, still leaves a shell-shaped surface via nginx/systemctl edge cases.
3. Containerise the app so the host user is irrelevant; larger change, addresses the class rather than the case.

Relevant standards to check against: CIS Benchmarks (sudo/least privilege), OWASP ASVS V14 (configuration),
NIST SP 800-53 AC-6 (least privilege).

## A2. Postgres trust model on the host — MEDIUM, open

**VERIFIED.** `listen_addresses = localhost`, so no network exposure — good. But `pg_hba.conf` has
`local all all peer`, so any OS user can connect as the same-named DB role without a password, and `postgres`
is a superuser reachable from any root shell. 24 login roles have passwords.

**Options.** (1) Restrict `local ... peer` to the specific service accounts that need it. (2) Move the database
off the application host (managed Postgres or a separate machine) so app-host root no longer implies data
access. (3) Keep superuser access only through an audited break-glass path.

---

# B. Secrets

## B1. All five secrets live in one file readable by the app's own group — HIGH, open

**VERIFIED.** `/opt/env/bersoncarebot/webapp.test` is `root:deploy 0640` and contains
`DB_PRINCIPAL_SIGNING_SECRET`, `SESSION_COOKIE_SECRET`, `INTEGRATOR_SHARED_SECRET`, `INTERNAL_JOB_SECRET`,
`S3_SECRET_KEY`. The app runs as `deploy`. One process compromise yields all five plus every DB DSN — after
which the attacker talks to the database directly and every application-layer guard, wall and role check is
irrelevant.

Good news, also VERIFIED: the files are **outside** `/opt/projects`, the deploy repo contains only
`.env.example`, and nginx serves exactly one file (`maintenance.html`) out of the repo. There is no web-exposed
secret.

**Options.**
1. Split by consumer: each service reads only the secrets it needs, separate files, separate owners.
2. Inject at process start from a secret manager (Vault / cloud secret manager) so no durable file exists.
   Volume note for the audit trail: retrieval is per process start or lease renewal — roughly tens of events a
   day for five services — not per request, so it does not scale with patients.
3. Short-lived database credentials issued per process (Vault database engine), removing static DSNs entirely.

## B2. Signing keys have no key id, so they cannot be rotated without mass logout — MEDIUM, open

**CODE.** `SESSION_COOKIE_SECRET` and `DB_PRINCIPAL_SIGNING_SECRET` are single values with no `kid` and no
accept-previous window. Rotating either invalidates every live session/context instantly.

**Options.** (1) Add a key id and an "accept N previous keys for verification, sign with current" window — the
standard shape; sessions survive rotation. (2) Rotate only during a planned forced-logout (the owner has
already approved one such event for the cutover). (3) Move to asymmetric signing with published key ids.

Standards: NIST SP 800-57 (key management), OWASP ASVS V6 (cryptography), V3 (session management).

## B3. Telegram bot token stored in plaintext in the database — MEDIUM, open

**VERIFIED.** `system_settings.telegram_bot_token` holds a live token in clear text. Whoever reads the settings
table owns the bot. Note the owner's separate ruling that the Telegram bot must be cut from the RU build
entirely (legal), which may retire this rather than fix it.

**Options.** (1) Remove the bot and the token together per the legal ruling. (2) Move to env/secret manager and
keep only a reference in the DB. (3) Encrypt at rest with a KMS key.

---

# C. Database privilege model

## C1. One owner with BYPASSRLS over the whole schema, behind 46 anonymously reachable functions — HIGH, open

**VERIFIED.** `app_owner` is NOLOGIN, BYPASSRLS, zero members — the mitigations are real and deliberate — but it
owns the `SECURITY DEFINER` surface, and **46 of those functions are EXECUTE-able by the anonymous pool role**.
Two of the 46 contain dynamic SQL. Grouped by purpose: 19 e-mail login/OTP, 4 password flows, 3 public
slug/booking resolution, 4 "who am I" accessors, 5 public config/payments, 11 signup/invite/other.

This is the only path in the whole system that an unauthenticated visitor can reach **without any credential**,
and behind it RLS does not apply. A flaw in any one function is not "leaks OTP rows" — it is owner-level access
to the entire schema.

**Options.**
1. **Split the owner.** Several narrow definer owners, each owning only the functions and tables of its area
   (auth, public projection, provisioning). A flaw in the e-mail-code path then cannot reach clinical tables.
2. **Remove bypass where a policy suffices.** For genuinely public data the correct primitive is a policy —
   `USING (published AND organization_active)` — which works for anyone including anonymous, with no definer and
   no bypass. Reserve definer+bypass for answers that genuinely depend on a secret (verify an e-mail code, find
   the owner of an address).
3. Keep the current shape but subject all 46 to a line-by-line review with a standard checklist, and add a
   deploy gate that fails when a new definer function becomes anonymously executable without review.

Standards: PostgreSQL security-definer guidance (fixed `search_path`, no dynamic SQL on untrusted input),
OWASP ASVS V1/V4 (architecture, access control), CWE-250 (execution with unnecessary privileges).

## C2. There is no public role; publicness is faked by borrowing stronger identities — HIGH, open

**VERIFIED.** The anonymous login `bcb_test_nonstaff_login` is a member of exactly `app_patient` — "a patient
with no identity". Probed with no context it cannot even read `be_organizations` (permission denied), and the
catalogue tables return zero rows:

```
be_branches 0/2 · be_clinic_services 0/3 · be_specialists 0/2
```

So every public surface reaches its data by borrowing something stronger: either a definer function (owner,
bypass) or `withExplicitOrganizationPrincipal`, which — **VERIFIED** — maps kind `organization` to the **staff
pool** (`webappPoolProvider.ts:209-216`), running as `app_staff`, for which `app.is_staff()` is literally true.
Every clinical policy is `(app.is_staff() AND organization_id = app.current_org_id()) OR (patient branch)`, e.g.
`patient_files` and `be_appointments`. Inside that block an **anonymous visitor's request satisfies the staff
branch** for the resolved clinic. Nothing is leaking today only because the queries written inside those blocks
happen to read catalogue tables.

The database cannot distinguish "public catalogue" from "clinical record" in that state. The separation is
developer discipline, not a wall.

**Options.**
1. **A dedicated public read role** with SELECT only on genuinely public tables, plus policies that gate on the
   row's own publication state. Anonymous traffic then never touches a staff-shaped identity. (This is the
   owner's proposal, and it is the cleanest.)
2. Policy-only: no new role, but public-read policies keyed on `published AND active`, so even the existing
   patient-shaped anonymous role can read exactly the public rows.
3. Keep borrowing but make it auditable: an allowlist of repositories permitted inside an organization-principal
   block, enforced by a lint/test gate. Weakest — it protects nothing at runtime.

## C3. `platform_users` has no RLS at all — HIGH, open

**VERIFIED, twice.** `relrowsecurity = f, relforcerowsecurity = f`, and two policies exist on the table that are
therefore inert — someone wrote identity policies that never took effect. Probe: `SET ROLE app_staff` with **no
principal** reads **281/281** identity rows (name, phone, e-mail, birthdate, role) while the same unprincipled
session gets zero rows from every FORCE-RLS child table. Demonstrated live from a second direction too: the
narrow `app_operational_web_push_reminder` role, which needs 34 push subscribers, can read all **282** rows
including 192 phone numbers, purely because it has SELECT on that table.

The table is absent from the deploy's asserted FORCE-RLS list while its own satellites
(`platform_user_contacts`, `user_phone_history`, `org_enrollments`) are present, and no ruling documents the
exclusion. Same class: `appointment_records` and `patient_bookings` hold contact PII with **no
`organization_id` column at all**, so they cannot even be added to the list without a schema change.

**Options.**
1. Enable RLS with policies designed for the bootstrap path — identity is read *before* any principal exists
   (login, signup, invite), so the policies must fail OPEN for those specific reads or those reads must move
   behind narrow definer accessors. This is the one change most likely to break login if done carelessly; the
   repo already has a scar from exactly that class (unprincipled reads going silently empty).
2. Column-level: keep the table readable but revoke the sensitive columns from roles that only need a display
   name, and expose the rest through accessors.
3. Split the table: a minimal identity core vs. a PII satellite that carries RLS.

Standards: OWASP ASVS V4 (access control), CWE-284, and the tenancy-isolation guidance behind row-level
security.

## C4. Over-broad role memberships — MEDIUM, open

**VERIFIED.** `bcb_test_integrator_login` is a member of **`app_staff`, `app_patient` and `app_worker`
simultaneously** — the machine channel holds more privilege than any human in the system. Owner ruling: leave it
for now, handle later.

Also verified and CLEANED during this session: eight leftover rehearsal roles and eleven leftover databases
(~3 GB) from July rehearsals were dropped after confirming zero references in code, env and deploy, no owned
tables and no grants.

**Options.** (1) Give the integrator its own narrow role with exactly the tables it uses. (2) Split by job:
separate logins per integrator function, mirroring the five operational roles. (3) Move integrator traffic
behind an internal API that holds the privilege instead of the DB role.

## C5. Operational role review — INFORMATIONAL, resolved by inspection

The five `app_operational_*` roles are **not** redundant with `app_worker`: `app_worker` has exactly one grant
(SELECT on `app_runtime_settings`), while each operational role holds a tiny purpose-specific set — delivery
(3 tables), diagnostic (1, read-only), media (2), scheduler (1), web push (12). Least privilege, correctly
applied; the media worker cannot touch the delivery queue. The cost is that each role adds exact-privilege
assertions to the deploy, which have caused FATAL mid-deploy failures.

Two grants in the web-push set deserve scrutiny: `platform_users` (see C3) and `content_pages`/`content_sections`
whose necessity is unconfirmed. Note the good pattern in the same role: `notification_delivery_attempts` is
INSERT-only — it writes the journal it cannot read, and retry limits live in the integrator's job queue
(`retryPolicy.ts:17`) plus its own `webapp_reminder_occurrences` status, so write-only does not impede it.

---

# D. Authentication

## D1. Logout does not revoke, and a copied cookie is valid indefinitely — HIGH, approved remedy, NOT yet built

**CONFIRMED by an independent adversarial auditor**, whose mandate was to refute it. `clearSession()` only
clears the client cookie; nothing server-side records the session. There is no session identity at all —
`jti`, `sessionId`, denylist, `revoked_at`, cookie hash: zero hits across `modules/auth/`. Worse than first
reported: `proxy.ts:70` renews on every `/app` and `/api` request with **no DB and no version check**, and
`renewSessionIfActive` preserves `issuedAt`, so the "24h minimum interval" throttles nothing after the first
day — the attacker's own replay slides the expiry forward forever. Staff as well as patients.

Compounding, all VERIFIED: `staff_security_profiles` is **empty (0 rows / 281 users)**, so the only revocation
mechanism (`app.revoke_staff_sessions()`) raises `staff_security_profile_missing` for everyone and the "end
other sessions" button is dead; password reset calls it only `if (security)` and therefore **silently revokes
nothing**; `platform_users.is_archived` is not checked in the session path, so archiving an account does not
end its sessions.

**Owner decisions already given:** staff 12 hours, patients 30 days, and a one-time forced sign-out at deploy is
allowed. **Approved remedy (options for HOW):**
1. A `sessions_valid_from` timestamp on `platform_users`, compared against the cookie's existing `issuedAt` at
   the single chokepoint every request already passes. Logout, password reset, archive, role change and
   membership removal all become one-line writers, and it covers patients, which the staff-only profile table
   structurally cannot. Plus an absolute age ceiling so renewal cannot slide forever.
2. Server-side session records (a session table with `jti`, revocable individually) — the textbook answer, gives
   "sign out this device", costs a write per session and a read per request.
3. Short-lived access tokens with refresh — strongest, largest change.

A partial implementation of option 1 exists but is UNVERIFIED and deliberately parked (commit `85f2bdd0d`,
reverted by `41d6429ab`); restoring it means reverting the revert and finishing it under audit.

Standards: OWASP ASVS V3 (session management), NIST SP 800-63B (session lifetime, reauthentication).

## D2. Six auth routes have no verification rate limiting at all — MEDIUM/HIGH, open

**CONFIRMED by the adversarial auditor.** `isEmailOtpStartRateLimitedByKey` (10/min per IP) is imported by
exactly two routes. Nothing limits `/email-password/reset`, `/email-password/forgot`,
`/email-password/setup-code/complete`, `/email/confirm`, `/specialist-signup/confirm` **or
`/email-otp/confirm`**; `proxy.ts` does CSRF and redirects only; and there is **no `limit_req`/`limit_conn` in
any live nginx vhost or in `deploy/nginx/*.conf`**. An unauthenticated attacker grinds guesses indefinitely with
no block and no signal.

**Options.** (1) Extend the existing per-IP limiter to those routes. (2) Add nginx-level rate limiting as a
second layer independent of application code. (3) Per-identity lockout with exponential backoff and alerting.

## D3. The OTP attempt counter is a read-then-write race — MEDIUM, open

**CONFIRMED in live `prosrc`**: `STABLE` finders with no `FOR UPDATE`, then `UPDATE ... SET attempts = $n`
(absolute set, which can even rewind the counter). Only the public-login path was fixed atomically (migration
0232, `FOR UPDATE` + `attempts = attempts + 1`). The auditor corrected the severity: amplification is bounded at
N ≤ 2 by the nonstaff pool's `max: 2` and a single webapp process, so it is a ~2× weakening (≈54 days vs ≈108
to a 50 % chance on a 6-digit code), not a defeated cap — but the bound is incidental and scales straight back
with pool size or a second instance.

**Options.** (1) Apply the proven 0232 pattern to the remaining consume paths. (2) Move the counter into a
single atomic statement everywhere. (3) Replace the counter with a lockout record.

Note the constant drift: max attempts is `4` in TypeScript and `5` hardcoded in the SQL function.

## D4. Cross-purpose OTP redemption — LOW/MEDIUM, open

`email_challenges` has no purpose column, so one table serves login, self-service e-mail change,
admin-initiated patient e-mail change, password reset and signup, and the public confirm endpoint redeems the
latest challenge for an address regardless of which flow created it. The adversarial auditor **knocked the
severity down**: the actor must be the **global platform admin** (not a clinic admin), in 8 of 9 flows the
challenge's `user_id` is the same party who receives the code, and the account e-mail is rewritten by both
paths anyway — so what redemption adds is impersonation by the platform's most privileged principal, who can
already mint access directly. Fix it because it arms the moment that route opens to clinic admins by
capability, not for today's blast radius.

**Options.** (1) Add a purpose column and bind redemption to it. (2) Separate tables per flow. (3) Bind the
purpose into the hashed code payload.

## D5. The escalation chain nobody had noticed — MEDIUM now, HIGH if armed, open

**Found by the adversarial auditor, missed by everyone else.** `getCurrentSession` elevates **any** session to
`role: "admin"` on every request when the account's verified e-mail appears in the `admin_emails` setting.
Chain: authenticated patient → `POST /api/auth/email/start` with an allowlisted address (caller-chosen) →
brute-force the code on the **unlimited, non-atomic** confirm route → `claimVerifiedEmail` stamps
`email_verified_at` on the attacker's own row → the next request is a global-admin session.

**Dormant today** — VERIFIED that `admin_emails` has no row and `admin_phones`/`admin_telegram_ids` are empty
arrays — and it arms the moment anyone fills that field in the platform settings UI.

**Owner ruling: remove the allowlists from the database entirely, e-mails and Telegram channels alike.**
Complication found while implementing: the same lists are ALSO used as **notification recipients** in four
places (operator alerts, intake relay, doctor notify, support routes). Deleting them wholesale silently kills
alerting — the exact failure class that already went unnoticed for a day in July.

**Options.** (1) Remove the authorization meaning entirely; keep recipients as a separate, honestly named
setting. (2) Replace both with staff roles (tech-admin, support) and per-user channels, routing alerts by role —
the grown-up shape, and it aligns with the Telegram removal. (3) Pin the owner's identity in env so no
DB-resident list can ever grant admin, which is the owner's own proposal.

## D6. Two-factor authentication was impossible to enable — FIXED (`f20819ed9`)

`app.read_webapp_server_runtime_setting()` (migration 0231) carries a hardcoded key allowlist that migration
0236 never extended when it added `auth_2fa_enabled`, so the toggle always resolved to the compiled default
`false` on every environment. 2FA has never been enforceable anywhere; this is why the owner's TOTP setup "did
not work". Fixed by migration 0242, exercised in both positions on the sandbox. The stored value remains
`false` — turning it on is the owner's decision, and it is now a real one.

Related and FIXED (`cba45f25d`): starting and abandoning TOTP enrolment wrote a profile row that made the
session `pending_enrollment`, which restricted the whole workspace **even with the flag off**, with no cancel
action anywhere — the owner was locked out of every workspace page and the only escape was deleting the row by
hand.

## D7. Smaller authentication findings — open

- **Fail-open for patients**: `resolveSessionUserAgainstDb` returns the unverified cookie user on a transient DB
  error for `client`, fails closed for staff. Inert today, asymmetric by design.
- **`toggleAdminMode()` can never toggle off** — `adminMode` is forced true whenever `role === "admin"`. Dead
  code, not an escalation, but misleading.
- **`GET /api/auth/logout` is cross-site triggerable** — CSRF classification covers only POST/PUT/PATCH/DELETE,
  so an `<img>` tag logs a user out. Denial of session only.
- **Peppered SHA-256 for OTP codes falls back to a hardcoded literal** `"test-email-pepper"` when both secrets
  are absent, with no production assert at that site; the pepper also reuses the integrator webhook secret
  cross-purpose.
- **User enumeration**: `/email-otp/register` returns `duplicate_email` (409) outright, and OTP start leaks
  registration status through timing (unknown address returns immediately; a known one does DB writes and an
  awaited outbound send).
- **Logger redact list** omits `code` and `email`; latent, no current call site logs them.

---

# E. Authorization

## E1. The long-deferred patient-card IDOR is genuinely CLOSED — resolved, do not re-litigate

**CONFIRMED by an independent auditor who enumerated handlers, not files: 38/38** per-patient handlers under
`app/api/doctor/patients/[userId]/**` resolve through
`getClientIdentityForOrganization(userId, gate.ctx.organizationId)` before touching data, with a mechanical check
that no handler calls a data port before resolving. The wall also requires `platform_users.role = 'client'`, and
the organization comes from the caller's own server-resolved membership. A clinic-A doctor gets 404 before RLS
is ever consulted.

Three caveats that survive: **nobody has runtime proof** (TEST had exactly one organization until today, and 17
test files mock the resolver rather than exercising a second tenant); three `doctor/clients/*` routes
(`merge-candidates`, `name-match-hints`, `integrator-merge`) are genuinely unscoped but are global-operator
tools a clinic doctor structurally cannot reach; and the wall accepts enrollment status `IN ('invited','active')`
while `discharged`/`archived` exist in the constraint but are written by nothing — the first code that writes
`discharged` will silently 404 that patient's whole card for their own clinic.

## E2. Money routes had no entitlement gate — FIXED (`708e49a90`)

Recording a cash payment and charging a card were the only mutations in the patient-card tree without an
entitlement check while nine clinical siblings had one, and there was no deeper gate in the repo or the acquiring
gateway. Inert only because no organization can currently reach a `read_only`/`blocked` lifecycle — one data row
away from an organization that keeps charging cards while every clinical mutation correctly 403s.

## E3. Global-admin surfaces were structurally broken — FIXED (`feb80b75d`)

`requirePlatformOperationsPage()` gated correctly but never stamped a DB principal, so the request kept the
bootstrap principal, landed on the nonstaff pool and raised `permission denied for table system_settings` (nine
occurrences in the live log). The audit log demanded a doctor-workspace membership a global admin structurally
cannot have. Now serves all clinics to the global admin per the owner's ruling, unchanged for clinic staff.

Still open and needing an owner ruling rather than an invented scope: the global admin's booking page reads
`be_branches`/`be_specialists`/`be_clinic_services` for one "default" clinic and the platform role has no access
to any of them — one default clinic or all clinics, and it is write-capable data. Same for resolving an audit-log
conflict outside one's own membership.

## E4. Duplicated and inconsistent admin predicates — LOW, open

The global-admin check is hand-rolled in 8+ route files instead of the shared `requireAdminModeSession()`, so
tightening the canonical function (e.g. to require verified 2FA) would not propagate. One admin route family
(`admin/google-calendar/*`) checks `role === "admin"` but omits `adminMode`.

---

# F. Tenant isolation

## F1. The integrator's organization parameter — LOW/INFO after verification

The S3 auditor graded "four `/api/integrator/*` routes take `organizationId` from the query string and stamp it
as the DB principal behind only a UUID regex" as MEDIUM/HIGH. **I verified the signature scheme myself and the
grade does not hold**: the HMAC canonical string is `GET {pathname}{search}`, so the query string — and
therefore `organizationId` — is inside the signed payload, with a freshness window on the timestamp and
`timingSafeEqual` comparison. An outsider can neither select nor tamper with a tenant.

The residual true statement is narrower and still real: **one shared secret spans all tenants**, so a single key
leak exposes every clinic at once. These routes are live infrastructure (reminders, web push, delivery targets),
not dead code.

**Options.** (1) Per-tenant credentials for the integrator. (2) Keep one service credential but derive the
organization from the object being acted on rather than a parameter. (3) Treat it as a service-to-service trust
boundary and focus on key custody and rotation.

## F2. Tenant isolation has never been proven at runtime — open, and it is the biggest confidence gap

Until today TEST had exactly **one** organization, so no test, probe or gate has ever demonstrated that a doctor
of clinic A cannot see clinic B's patients. Everything we believe about multi-tenancy rests on code reading.
A second clinic now exists. The product smoke gate was repointed at real clinics (21/21 vs the previous 4/22)
but that work is **held uncommitted** pending the credential decision in H1.

---

# G. Process and operational safety

## G1. A mandatory gate was taking the production-like environment down — FIXED (`0d138fc94`)

The post-deploy product smoke authenticated as the retired demo fixtures and, being mandatory under
`set -euo pipefail`, unwound the closure before services were released, stopping all five TEST units. Now the
failure is recorded and raised **after** services are released: the deploy still goes red and loud, it just
stops being an outage.

## G2. A gate that skips must say so — pattern established

Two closure gates and several smoke scenarios depend on fixtures that were deliberately retired. They now skip
with an explicit reason. **A skipped check is never reported as passed** — this is the rule that keeps a green
board honest.

---

# H. Incidents during this session

## H1. A worker overwrote two real people's password hashes — contained, remediation declined by the owner

While regenerating the smoke fixture, a worker set argon2 password credentials on **two real patient identities
carried over from the production dump** (`kateotvina@yandex.ru`, `serafima-em@yandex.ru`), overwriting hashes
those people actually have. TEST only; production untouched. I stopped, restored the originals from the dump into
a scratch database, and attempted to write them back — **the harness classifier blocked the credential write, and
I did not work around it**, which is the protection behaving correctly.

**Root cause is mine, not the worker's:** my brief said "obtain sessions by real login" and did not forbid
touching other people's accounts. Every worker brief now carries the prohibition verbatim.

**Owner ruling:** do not restore, do not touch patient data on TEST; use his own client account
(`Берсон Дмитрий`, +79189000782) for the patient profile; make recurrence impossible.

**Options for making recurrence structural rather than instructional.** (1) A dedicated, clearly-named service
identity set for all test apparatus, and a rule that fixtures may only use identities from that set. (2) A guard
that refuses credential writes for any identity that came from a production dump. (3) Keep real identities out
of test fixtures entirely and generate synthetic ones — which collides with the owner's "реальные" preference,
so it is a trade-off, not an obvious win.

## H2. Two of my own diagnoses were wrong before I looked at the running system

Recorded because it shapes how the re-audit must be run. The disappeared exercise catalogue got three
explanations from me — a global-admin redirect, then an entitlement gate, then the tariff — all wrong; the real
cause was a dead per-connection GUC, found only by querying the live database. I also nearly reported "the tariff
page logs you out" as a defect when it was a concurrent worker mutating the sandbox. **Reports and green tests
are not evidence.**

---

# I. Open questions the owner has not ruled on

1. Whether to split `app_owner` into several narrow definer owners (C1).
2. Public role vs. public policies vs. keeping the borrowed-identity pattern (C2).
3. How to bring `platform_users` under RLS without breaking the bootstrap reads (C3).
4. Session revocation shape: timestamp cutoff vs. server-side session records (D1).
5. Whether to keep any DB-resident admin allowlist at all, and where notification recipients live (D5).
6. Global admin's booking page scope, and audit-log conflict resolution outside a membership (E3).
7. Integrator credential model: per-tenant vs. shared (F1).
8. Whether test apparatus may ever use real identities (H1).

---

# J. Mandate for the deep re-audit

The owner's instruction: **conduct a full, deep security re-audit, and for every problem study the correct
solution against recognised world security standards — no crutches, no improvisation.**

What that must mean in practice, based on what went wrong this time:

- **Every claim carries its evidence class.** Verified against the running system, read from code, or asserted.
  A finding without a demonstrated mechanism is not a finding.
- **Independent adversarial verification of every claim**, including the ones that say "this is fine". Two of
  the highest-value results this session came from an auditor whose job was to refute: it knocked two HIGHs down
  to MEDIUM/LOW and simultaneously found an escalation chain both the worker and I had missed.
- **Severity is decided by the auditor, not the finder**, and it must be justified by what the attacker gains
  over what they already had.
- **Each remedy is measured against a named standard** — OWASP ASVS for the application layer, NIST SP 800-63B
  for authentication and sessions, NIST SP 800-53 / CIS Benchmarks for host and privilege, CWE identifiers for
  the defect class — with the trade-offs written down, not a single "recommended fix".
- **Coverage must be stated as a number**: how many routes, functions, roles were examined out of how many
  exist, and which were not.
- Slices still not audited at all: **S4 API-layer tenant isolation, S5 OAuth (Google/Yandex duplicate-e-mail
  bug, taskdb #54), S6 media presign/playback**. Plus the whole host/secrets layer in sections A and B, which
  was never part of the original slicing and turned out to contain the most severe finding.
