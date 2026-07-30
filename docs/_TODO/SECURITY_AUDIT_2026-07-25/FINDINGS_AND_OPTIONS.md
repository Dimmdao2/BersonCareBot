# Security findings and solution OPTIONS — full record (2026-07-25 → 26)

**Status: remedies below are not decisions except sections explicitly marked OWNER DECISION (currently §J1).**
Every other remedy below is an OPTION for discussion and analysis. Some findings are already fixed (marked FIXED
with the commit); the rest are open. The owner's instruction for the next stage is explicit: a full deep security
re-audit, and for each problem a solution grounded in recognised world security standards — not crutches, not
improvisation.

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

### A1 addendum, 2026-07-26 — a fourth root path that needs no sudo at all, and a much cheaper fix than expected

**VERIFIED** on the box:

- `id deploy` → `groups=1000(deploy),100(users),990(docker),105(tgcarebot),987(storylama)`, and
  `systemctl is-active docker` → **active**. Membership of `docker` with a live daemon is root by design
  (`docker run -v /:/host`), requiring **no sudo entry whatsoever**. Reducing the sudo list therefore does not
  close A1 on its own — this path survives it. The `tgcarebot` and `storylama` group memberships additionally
  give the webapp read access to two unrelated projects' files.
- **All five BCB TEST units run `User=deploy` / `Group=deploy`** — verified with `systemctl cat` on
  `bersoncarebot-{webapp,api,worker,scheduler,media-worker}-test`. The prod unit files carry the same
  `User=deploy`.
- **The deploy actor is NOT `deploy`.** `deploy/host/deploy-test-saas.sh:15` states "Run as user `dev` (uses
  sudo for postgres/deploy/systemctl)", and `id dev` → `groups=1001(dev),27(sudo),990(docker)`. So releases are
  already performed by a different identity, and `deploy`'s own sudo entries look like residue of the old,
  now-unused deploy path.

That last point makes option 1 much cheaper than it appeared: the runtime/deploy split the owner proposed is
**already half-done in practice**. What remains is (a) a dedicated service account for the units that is in no
privileged group and has no sudo, (b) re-owning `/opt/env/bersoncarebot/*` and the release trees to it,
(c) removing `deploy`'s sudo residue once nothing invokes it. Owner note (2026-07-26): the old deploy path is
not in use and should be deleted rather than left dormant.

**Options.**

1. Split the identity: a runtime user with **no sudo at all and no `docker` group** for the app; a separate
   deploy user for releases. Service restarts move to a narrowly scoped mechanism (polkit rule for the specific
   units, or a fixed-command wrapper), never `sudo systemctl` unrestricted.
2. Keep one user but reduce the sudo list to exact argv (no `sed`, no `apt-get`, systemctl only for named
   units). Cheaper, still leaves a shell-shaped surface via nginx/systemctl edge cases — **and does not close
   the `docker` group path at all**, so on its own it is not a remedy.
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

1. Enable RLS with policies designed for the bootstrap path — identity is read _before_ any principal exists
   (login, signup, invite), so the policies must fail OPEN for those specific reads or those reads must move
   behind narrow definer accessors. This is the one change most likely to break login if done carelessly; the
   repo already has a scar from exactly that class (unprincipled reads going silently empty).
2. Column-level: keep the table readable but revoke the sensitive columns from roles that only need a display
   name, and expose the rest through accessors.
3. Split the table: a minimal identity core vs. a PII satellite that carries RLS.

Standards: OWASP ASVS V4 (access control), CWE-284, and the tenancy-isolation guidance behind row-level
security.

## C6. Общая карточка пациента отдаёт 500 во второй клинике — HIGH, open (карточка `#803`)

**Найдено живьём** owner-ready проходом по TEST: в клинике B карточка общего пациента показывает ошибку
загрузки блока сообщений — и при обычном открытии, и при перезагрузке; `conversations/ensure` отвечает
`500`. В клинике A тот же экран работает нормально. Там же скрытая `403` при смене e-mail на общей карточке.

**Почему это здесь, а не в TEST-задачах** (решение владельца 29.07: «относится к доработке стен»): TEST был
способом увидеть, а не предметом. Симптом — поведение границы тенантов на пациенте, принадлежащем двум
клиникам, то есть ровно та поверхность, которую описывают C2 и C3: публичность изображается одалживанием
более сильной личности, а `platform_users` читается без принципала. Различие A/B при одинаковом коде
указывает на данные или на принципала, а не на общий баг экрана.

**Связь с картой стен.** `SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` держит открытым пункт «доказать матрицу
общего пациента: каждая клиника видит только своё, при этом общий пациент виден обеим». `#803` — живой
контрпример к этому пункту, найденный раньше, чем до него дошла плановая проверка.

**Что требуется** (формулировка владельца 29.07): изучить, повторить, найти причину. Не «починить 500», а
понять, почему граница ведёт себя по-разному в двух клиниках — иначе фикс закроет симптом и оставит класс.

**Options.** Осознанно не выбраны: этот документ фиксирует находки и варианты без решения. Диагностика
предшествует выбору — сначала воспроизведение и причина, потом варианты правильного решения по стандартам,
как требует сама задача `#1001`.

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

> ⚠️ **SUPERSEDED (2026-07-26).** The owner has now ruled on the options below: allowlist-based role granting
> (`admin_emails` and the sibling `admin_*`/`doctor_*` keys) is removed as a grant mechanism, the owner's
> identity is pinned in env, and admin/support access is invite-only. Canon:
> [ADMIN_ACCESS_MODEL.md](../../ARCHITECTURE/ADMIN_ACCESS_MODEL.md). The same keys' use as notification
> recipients (mentioned below) is a separate, still-open concern — not resolved by this ruling.

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

## D8. Password proof admission was raceable and held HTTP requests for minutes — #1065, corrective implementation pending gate

The first #1065 implementation added the right thresholds but not an atomic protocol: a read-only lock check
ran before Argon2, identifier failure and account failure were separate writes, and 30/60/120/240/480-second
backoff was implemented by sleeping inside the request. Concurrent requests could all pass admission before
any failure write; a success could race an arriving lock; occupied HTTP workers made the throttle itself an
availability risk.

Owner-approved corrective model (30.07): one DB transaction serializes account+identifier (unknown email:
identifier only) and issues an exact 30-second lease before Argon2; Argon2 runs outside the transaction; only
completion of that current lease may authenticate. Attempts 5–9 set the *next admissible time* and return
immediately; attempt 10 locks for 15 minutes; no permanent lock. A visible self-hosted ALTCHA proof is required
from attempt 5, signed over purpose+identifier+challengeId+expiry and atomically consumed once. Recovery and
successful password replacement reset password state but never the shared per-IP `auth.confirm` budget.
Implementation lives in migration `0274_password_login_atomic_admission_altcha.sql` plus
`pgPasswordLoginProtection.ts`; do not mark FIXED until the #1065 gate is sealed.

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

## J1. OWNER DECISION — единая карта ролей и стен после стабилизации (2026-07-30)

Решение владельца, дословно:

> «Хорошо, значит, если я правильно понимаю, то эту конструкцию нужно будет разрабатывать корректно в процессе
> аудита безопасности, который у нас запланирован, когда мы будем перепроверять все роли, все стены, составлять
> карту того, как должно работать, когда мы уже систему доработаем, проведем все тесты, сделаем ее стабильной. И
> на основании этого, для того, чтобы в будущем не возникло опасных изменений, нужно будет сделать, если я
> правильно понимаю, такую карту и такую проверку.»
>
> «Хорошо, тогда сейчас, если я правильно понял, имеет смысл просто удалить этот вредный гейт-скрипт и записать
> найденные тобой правильные решения с указанием источников в план по аудиту, который у нас уже есть. Новых задач
> под это создавать не надо.»
>
> После уточнения, что сейчас удаляется хрупкий product-role allowlist, а не нужная runtime-защита целиком:
> «Хорошо. Значит, сделай так. Сделай так, чтобы продолжить дальнейшую работу без тупых блокировок там, где это не
> нужно. Оставь только самые необходимые сейчас действия в скрипте, продолжай работать по плану дальше.»

Это уточнение входит в существующий workstream `#1001` / §K1; отдельная taskdb-карточка и отдельный plan-файл
не создаются.

После стабилизации системы глубокий аудит формирует одну утверждённую декларативную карту:

```text
principal
→ business role
→ PostgreSQL login role
→ membership path (SET / INHERIT / ADMIN)
→ effective DB role
→ resource + action
→ tenant scope
→ ACL + RLS + FORCE RLS
→ explicit owner / SUPERUSER / BYPASSRLS / SECURITY DEFINER exceptions
```

Карта становится единственным source of truth / policy-as-code. Static и runtime drift checks должны
генерироваться из неё или читать тот же артефакт; второй ручной allowlist рядом запрещён. Static-проверка
сопоставляет модель с `pg_roles`, `pg_auth_members`, ACL, `pg_policy`, `relrowsecurity` / `relforcerowsecurity`,
owners и `SECURITY DEFINER` surfaces. Runtime-проверка поднимает disposable PostgreSQL и прогоняет положительную
и отрицательную матрицу: своя организация разрешена; чужая, отсутствие principal и неожиданная роль запрещены;
direct/inherited/`SET ROLE` пути проверены отдельно; owner/`BYPASSRLS` исключения явно перечислены и доказаны.

До завершения этого аудита проверки применяются только к security-impacting изменениям ролей, memberships,
ACL/RLS, ownership и definer surfaces, а полная матрица — на security milestone/release. Обычные изменения кода
и подготовка DEV-базы не блокируются глобальным хрупким product-role allowlist. Новая роль в период активной
разработки всё равно получает локальный контракт и targeted positive/negative proof; это не заменяет будущую
полную карту.

Источники для проектирования и приёмки:

- PostgreSQL 16: [Role Membership](https://www.postgresql.org/docs/16/role-membership.html),
  [`pg_auth_members`](https://www.postgresql.org/docs/16/catalog-pg-auth-members.html),
  [Row Security Policies](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).
- [NIST SP 800-218, Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final) —
  security requirements and verification throughout the SDLC.
- [OWASP ASVS 5.0, V8 Authorization](https://github.com/OWASP/ASVS/blob/v5.0.0_release/5.0/en/0x17-V8-Authorization.md)
  — единый проверяемый authorization design и deny-by-default controls.
- Open Policy Agent: [policy-as-code model](https://www.openpolicyagent.org/docs) и
  [policy testing](https://www.openpolicyagent.org/docs/policy-testing). OPA здесь — reference pattern, а не
  заранее выбранная зависимость; конкретный формат утверждается по результатам инвентаризации.

---

# K. Консолидированный workstream безопасности и доступов (`#1001`)

Этот раздел сохраняет непотерянный scope карточек группы 17 перед их предложенной свёрткой в одну
workstream-карточку `#1001`. Он не превращает options выше в решения и не объявляет remediation выполненной.

## K1. `#1001` — полный глубокий реаудит

- [ ] Провести полный глубокий security re-audit по mandate §J; для каждой находки указать класс доказательности,
      независимый adversarial verdict, severity через дополнительную возможность атакующего, named standard с
      trade-offs и численное покрытие.
- [ ] Включить неаудированные срезы S4 API tenant isolation, S5 OAuth, S6 media presign/playback и весь host/secrets
      layer A/B. Известный duplicate-email defect `#54` остаётся отдельной карточкой без плана и не сворачивается.
- [ ] Не потерять уже принятый, но не построенный session ruling: staff **12 часов**, patients **30 дней**,
      one-time forced logout at deploy разрешён.

Исходный verified baseline широкой карточки:

- A1: webapp runtime user имел три sudo-пути, эквивалентных root; A1 addendum добавил четвёртый путь через
  active Docker group;
- B1: пять secrets в одном group-readable файле;
- C1: один BYPASSRLS owner и **46** anonymously executable definer functions, из них **2** с dynamic SQL;
- C2: dedicated public role отсутствует;
- C3: `platform_users` без RLS, verified read **281/281** identity rows;
- D1: logout не отзывает session, server session identity отсутствует, sliding renewal не имеет абсолютного ceiling;
- D2: шесть auth routes без verification throttling;
- D5: dormant patient → global-admin escalation через `admin_emails`;
- прежний аудит вообще не покрывал S4/S5/S6 и A/B.

## K2. `#881` — Security CI stack

- [ ] Реализовать в GitHub Actions: Gitleaks, Semgrep и fast Trivy на каждый PR; ZAP и full Trivy еженедельно и
      перед release. Garak оставить на этап после AI agents; Zeropath не включать.
- [ ] Направлять ZAP active scan только на ephemeral/TEST instance, никогда на PROD; для VPN-locked TEST нужен
      self-hosted runner либо локально поднятый webapp.
- [ ] Все findings отправлять на owner triage без auto-fix; allowlist допускается только как осознанное,
      датированное исключение.
- [ ] Получить подтверждение владельца, что найденные только в git history старые Rubitime и
      Telegram/webhook credentials отозваны/ротированы; после ответа решить history rewrite или датированное
      исключение, не выбирать самостоятельно.

Канон leaf-части: `../SECURITY_CI_STACK_PLAN.md`; решение состава:
`../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`. CI surface —
`.github/workflows/ci.yml` с существующими `setup-pnpm` и cancel-on-failure composite actions. Мотив карточки:
медданные и прошлый инцидент prod credentials в dev `.env`. Приоритет: очень высокий для
Gitleaks/Semgrep/Trivy, высокий для ZAP.

## K3. `#935` — pre-production hardening umbrella

- [ ] Сверить current code/task state с `#770/#797/#933/#934/#881`, не создавая дубли implementation work.
- [ ] Исполнять residual repository/DEV scope по
      `../STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` и canonical order product roadmap.
- [ ] TEST/PROD/host/telemetry/deploy запускать только после отдельного owner gate; full CI — на phase milestone,
      не на каждый slice.

## K4. `#982` — E3-A1 high-risk candidate

- [ ] В рамках только существующих E3-02/04/05/09/11/12 исправить: validated snapshot vs post-validation
      mutation/getters; `__proto__` passthrough без prototype mutation; реальную isolation base-vs-candidate
      benchmark; recursive JSON-safe producer typing; adversarial/logger-silence/projection-fallback tests.
- [ ] Не менять frozen schema/sample matrix и performance budget; после кандидата провести один свежий независимый
      audit. Owner numeric budget остаётся gate родителя `#980`.

Границы карточки: не integrate/push; DB/TEST/PROD/deploy запрещены.

## K5. `#1014` — внешне заблокированный dependency audit

- [ ] Дождаться совместимого `eslint-config-next` / `eslint-plugin-react`, затем поднять ESLint до 10 и
      `typescript-eslint` до `>=8.65`, прогнать `pnpm run ci` и закрыть
      `GHSA-mh99-v99m-4gvg` (`brace-expansion@1.1.16`).

`brace-expansion@1.1.16` — последний release линии 1.x; единственный consumer — `eslint@9.39.4` через прямую
зависимость `minimatch@3`. Поэтому текущий blocker внешний, а не локальный незакрытый override.

Не повторять три уже проверенных тупика:

1. `brace-expansion` 5.x в slot `minimatch@3` ломает lint: `TypeError: expand is not a function`;
2. overrides `@eslint/config-array` / `@eslint/eslintrc` на `minimatch@10` оставляют vulnerable package в tree;
3. ESLint 10 упирается в latest published `eslint-plugin-react@7.37.5` через `eslint-config-next`:
   `context.getFilename()` удалён. Upstream: `https://github.com/vercel/next.js/issues/89764`.

Решение владельца 26.07: TEST deploy с этой красной строкой разрешён; shim `@eslint/compat` не ставить. Риск
ограничен DoS в dev glob expander и не касается runtime request. Канон: `../NIGHT_PLAN_2026-07-26.md` G-5;
commits `6a793fb8c` и `28003858d`.

## K6. `#1015` — не потерять удалённый TEST signal

Содержимое удалённой с разрешения владельца строки `saas_isolation_events`, дословно:

```text
id: 09fc6733-163f-4235-8c1f-f744f928697e
fingerprint: v2:role_pool_mismatch:webapp:auth_role_config
event_class: role_pool_mismatch
source_service: webapp
source_operation: auth_role_config
explanation_status: unexplained
lifecycle_status: active
occurrence_count: 5
first_seen_at: 2026-07-26 03:23:06 +03
last_seen_at: 2026-07-26 03:24:25 +03
```

- [x] Воспроизвести, какой путь `auth_role_config` выбирает неверный pool, и проверить после deploy 26.07;
      возможный fix через `publicAuthSnapshot/isOAuthProviderEnabled` не считать доказанным без прогона. —
      2026-07-30: fingerprint агрегировал любой PostgreSQL `42501` семейства `auth_role_config`, поэтому
      удалённая строка не хранит конкретный key/relation/route. Старый login-path из семи DB allowlist reads
      удалён коммитом `5f81febc4`; текущий `resolveRoleAsync` не читает role allowlist из БД. TEST deploy
      `6398c404e` содержит этот fix. Read-only `BEGIN; SET LOCAL ROLE bcb_test_nonstaff_login` доказал:
      exact DB `bersoncarebot_test`, `EXECUTE` server-runtime accessor = true, прямой `SELECT` из
      `public.system_settings` = false. `publicAuthSnapshot/isOAuthProviderEnabled` исключён: он помечен
      отдельным operation family `public_auth_config`.
- [x] При повторении на TEST разбирать по горячим следам и не удалять signal. — 2026-07-30 read-only запрос
      `WHERE fingerprint = 'v2:role_pool_mismatch:webapp:auth_role_config'` вернул 0 строк после старта
      `bersoncarebot-webapp-test.service` 2026-07-29 23:42:18 MSK; повторения на текущем TEST нет. Старый
      `smoke-e1-webapp-runtime-config.mjs` не запускался, потому что он сам вставляет этот fingerprint.

Связанный, но отдельный defect: deploy closure переигрывал migration `0193` поверх `0201/0202` и падал на
законной строке.

## K7. `#1026` — DEV credentials в agent log

Инцидент: worker `#1003` вывел `DATABASE_URL`, `DATABASE_URL_STAFF`, `DATABASE_URL_NONSTAFF` вместе с паролями,
сам сразу остановился и доложил. Scope — только local DEV (`bcb_webapp_dev` и runtime roles), не TEST и не PROD;
лог локальный на этом же box.

- [ ] Когда dev server `:5200` свободен, отдельно оценить полезность ротации DEV passwords; карточка считает её
      необязательной hygiene и запрещает ломать параллельную работу ради немедленной ротации.
- [ ] В каждый worker brief добавить конкретный запрет: не выводить `DATABASE_URL` и производные ни в каком виде;
      подключаться через `source` env внутри команды без `echo`.

Канон запрета: `../HANDOFF_2026-07-26.md` №5. Этот инцидент того же класса, что leaked SMSC key `#1010`, но
`#1010` не имеет execution plan и не сворачивается.

## K8. `#1062` — направленный privilege/pool census

Метод и объём, которые должны остаться доказательством: live matrix
`210 public tables × 9 roles`, `33 integrator tables × 7 roles`, **218** RLS policies, **346** functions;
principal → pool → role пересечён с census **120** raw-SQL tables. Каждый hit проверен через
`BEGIN; SET ROLE; ...; ROLLBACK`. Лид лично подтвердил:
`SET ROLE bcb_test_nonstaff_login; SELECT count(*) FROM user_pins` → `permission denied`.

Десять подтверждённых hits:

1. PIN login мёртв для anonymous (`pgUserPins.ts:22,37,57,80`; `/api/auth/pin/{verify,login,set}` и
   `/api/auth/check-phone`), а `attempts_failed/locked_until/updated_at` не обновляются: есть только
   column grant `UPDATE(pin_hash)`.
2. `channel_link_secrets`: bootstrap role без прав, **13** rows.
3. `user_email_setup_tokens`: bootstrap role без прав, **29** rows, anonymous-reachable.
4. `user_oauth_bindings`: bootstrap role без прав, **14** rows; Google/Yandex/Apple login.
5. `login_tokens`: прав нет ни у bootstrap, ни у `app_patient`.
6. Doctor stats: `app_staff` имеет INSERT/UPDATE/DELETE, но не SELECT на
   `media_playback_resolution_events`, `media_playback_stats_hourly`,
   `media_playback_user_video_first_resolve`.
7. Silent empty: patient видит 0 из **1735** `reminder_delivery_events`; тот же класс у
   `user_subscriptions_webapp`, `mailing_logs_webapp`, `be_patient_package_items`, потому что
   `saas_org_dormant_p0_8_3/8_4` не имеет patient branch.
8. `webappPoolProvider.ts:232-236` сравнивает выражение с собой; detector role/pool mismatch никогда не работал.
9. Policy `s5_runtime_settings_isolation` ссылается на отсутствующую роль
   `app_runtime_nonstaff_login` (**0** rows в `pg_roles`).
10. Policies `app_worker` на `media_files/media_transcode_jobs` недостижимы из-за отсутствующих grants.

Telemetry подтверждала активный класс:

```text
role_pool_mismatch | webapp     | 818 | last 27.07 14:30 | unexplained
role_pool_mismatch | integrator | 104 | 26.07
role_pool_mismatch | worker     |  94 | 26.07
role_pool_mismatch | scheduler  |  73 | 26.07
```

Это почти **1100** накопленных отказов; fingerprint намеренно не содержит table name, поэтому сам по себе не
локализует источник.

- [ ] Для hits 1–5 использовать узкие `SECURITY DEFINER` accessors под bootstrap role по образцу
      `app.phone_challenge_store_*`; table grants bootstrap role запрещены.
- [ ] Для hit 7 либо добавить patient policy branch, либо получить явное решение, что patient read не нужен,
      и тогда revoke SELECT, чтобы failure стал громким.
- [ ] Для hit 6 выдать узкий SELECT staff, поскольку три write privileges уже существуют.
- [ ] Для hits 8–10 убрать/исправить dead detector/configuration/policies после отдельной проверки их runtime
      назначения.
- [ ] Собрать mechanical gate `route → principal → pool → role → has_table_privilege` из существующих
      `check-db-chokepoint.mjs` и перечислимых principal entry points. Gate должен ловить hits 1–6; RLS row
      visibility, dynamic table names, mid-request principal swap и swallowed denial остаются вне его покрытия.
      Оценка исходной карточки — около одного дня.
