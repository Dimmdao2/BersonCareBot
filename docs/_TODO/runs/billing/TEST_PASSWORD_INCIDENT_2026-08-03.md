# TEST password restore + change-flow diagnosis — 2026-08-03

Authority: `docs/_TODO/runs/billing/TEST_PASSWORD_RESTORE_BRIEF_2026-08-03.md` (`ORCH_OPS`, bounded incident,
card #1057). No plan-file scope beyond this brief; done in-session, not orchestrated (owner 03.08: don't
spin up a worker/worktree for bounded work the session can do itself).

## 1. Which accounts were changed, and when

Per `apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs`, the three smoke-login actors resolve (via
the root-owned packet `/opt/env/bersoncarebot/saas-smoke-login.env`) to three real owner-controlled mailboxes —
confirmed by e-mail lookup only, no password/hash read at any point:

| actor | role | email domain |
|---|---|---|
| doctor (clinic owner) | `doctor` | `dimmdao@yandex.ru` |
| global_admin | `admin` | `dimmdao@gmail.com` |
| patient | `client` | `kinesiospace@gmail.com` |

`user_password_credentials.updated_at` for these three, read **before** any restore action:

- `dimmdao@yandex.ru` (doctor) — updated `2026-08-03 17:41:29+03`
- `dimmdao@gmail.com` (admin) — updated `2026-08-03 17:41:30+03`
- `kinesiospace@gmail.com` (patient) — updated `2026-08-02 11:10:16+03`

**Divergence from the brief's "changed=3" today:** only the doctor and admin credential rows were actually
rewritten during today's incident run (~17:41, matching the B0.3 timeline). The patient row's hash was last
written **the day before** (08-02 11:10), i.e. it already equalled the shared smoke password from an earlier
convergence run and today's run counted it `unchanged`, not `changed`. This doesn't change the remediation —
all three accounts were already on the shared, owner-unknown smoke password — but the brief's "changed=3
today" is not what the credential timestamps show; flagging it rather than silently inheriting the number.

## 2. Owner access restored

The product's own recovery path (email `forgot`/`reset`) depends on the owner actually receiving and reading a
mailed code, which this run cannot observe (no access to the owner's inbox) — see §3 for what was verified about
that path instead.

Per the brief's fallback, fresh, cryptographically random passwords (24-char base64url, `argon2id`, generated
in-process, never printed to any file/stdout/log/commit/taskdb) were written directly for all three accounts,
using the same parameterized credential-write shape as `convergeAccount()` in the smoke-login script (`INSERT
… ON CONFLICT DO UPDATE` on `user_password_credentials`, run under `sudo -u postgres` for the required DB-role
peer-auth) — not hand-crafted SQL with an inline hash. `auth_rate_limit_events` was cleared for each account the
same way the smoke script does it, so the new password isn't shadowed by a stale lockout.

The three new passwords were delivered **only** via `bash /home/dev/brain/host-orch/notify-owner.sh` (Telegram,
confirmed delivered: "✓ доставлено владельцу через Нео"). They exist nowhere else — not in this file, not in
shell history beyond the ephemeral child-process argv, not in the task DB.

`user_password_credentials.updated_at` after the restore (all three, same batch):

- `dimmdao@yandex.ru` (doctor) — `2026-08-03 18:04:07+03`
- `dimmdao@gmail.com` (admin) — `2026-08-03 18:04:07+03`
- `kinesiospace@gmail.com` (patient) — `2026-08-03 18:04:07+03`

`failed_attempts=0`, `locked_until=NULL` on all three.

## 3. Password CHANGE / RESET flow — diagnosis

Tested live against `https://test.bersoncare.ru` as an anonymous caller (product's own `forgot`/`reset`
endpoints), with the required `Origin`/`Referer` headers (the app's CSRF-origin gate 403s a bare request —
expected behavior, not a defect).

**Step 1 — `POST /api/auth/email-password/forgot` (email=doctor account):** `200 {"ok":true,
"retryAfterSeconds":60}`. Server-side this created a real `email_challenges` row (`purpose=password_reset`) and
dispatched to the integrator (`api.test`, `/api/bersoncare/send-email`), which logged
`"PRE_FORK_DEV_DELIVERY_PASSTHROUGH"` (the owner's address is on the TEST passthrough allowlist, so the send is
**not** redirected elsewhere) and returned `200 {"ok":true}` after ~6s — consistent with a real outbound SMTP
transaction via `nodemailer` completing, not a short-circuited "not configured" rejection. This **contradicts**
the stale comment in `/opt/env/bersoncarebot/api.test` ("EMAIL (DISABLED — no SMTP configured)") — SMTP config is
DB-resolved (`resolveSmtpOutboundConfig`, per repo rule that integration config lives in `system_settings`, not
env), and it resolved as configured. Flagging the env comment as stale, not re-litigating why.

**The one real defect found — non-blocking, in the audit-log side-channel, not on the delivery path itself:**
immediately after the passthrough log line, the integrator's `delivery.attempt.log` write failed:

```
level=50 correlationId=522e7825-d96b-4ec1-b249-fde82f14c9b3
err.code=42501 err.class=42 dbPrincipalSource=delivery-handler
msg="[db][query] error"
  (same correlationId, next line)
level=40 mutationType=delivery.attempt.log intentEventId=otp:email:7e8df071-0f39-431b-9dc8-989950f6a1eb channel=email
msg="delivery.attempt.log: direct public write fail-closed (no organizationId) — no write, no fallback"
```
— `apps/integrator/src/infra/db/writePort.ts` (`delivery.attempt.log` case, the "no organizationId" fail-closed
branch, ~line 1564). Postgres `42501` = insufficient_privilege. The HTTP response to webapp was still `200
{"ok":true}` and the `email_challenges` row was **not** deleted (webapp only deletes it on `sent.ok===false`) —
so this failure does **not** block OTP dispatch, it only silently drops the audit-log entry for
account-less/system-context email sends (password_reset has no `organizationId`). This is a real, reproducible
defect (RLS/grant gap on `delivery_attempt_logs` for unprincipled system sends) but it is not the owner's login
blocker; it gets its own slice per the brief, not a fix in this run.

**Step 2 — `POST /api/auth/email-password/reset` with a deliberately wrong code:** `400
{"ok":false,"error":"invalid_code"}` — correct, neutral rejection (same shape whether the account exists or
not, per the route's own ASVS-6.3.8 comment). Confirms the reset endpoint's validation leg is intact.

**What was not, and could not be, verified in this run:** actually receiving the code in the owner's mailbox and
completing a real `reset`/`login` round-trip — that step requires the owner's own inbox, which this run has no
access to and was not asked to obtain. Everything server-side up to a completed outbound SMTP transaction was
observed directly; end-to-end inbox delivery is unconfirmed, not disproven.

## 4. One cause or two

**Two separate causes:**

1. **Login failure** — direct, established consequence of today's B0.3 smoke-password convergence run
   overwriting the three accounts' hashes with the shared smoke password the owner doesn't know. Fixed in §2.
2. **Password-change/reset friction** — an unrelated, pre-existing gap in the TEST environment: the
   `delivery.attempt.log` audit write 42501-fails on any system-context (no-organizationId) email send. It does
   not block the reset email from dispatching (verified live), so it is not confirmed to be why a reset attempt
   would feel broken to the owner — but it is a real defect independent of today's incident and of Track D.

## Final status

- Password login on TEST: **yes** — fresh passwords for all three owner accounts delivered via
  `notify-owner.sh`, `updated_at`/`failed_attempts`/`locked_until` confirmed in `user_password_credentials`.
- Password change/reset flow on TEST: **partially — dispatch verified working, full inbox round-trip
  unverified; one non-blocking defect found** (`delivery.attempt.log` 42501 on system-context email sends,
  `apps/integrator/src/infra/db/writePort.ts` ~line 1564) — recommend its own slice, not fixed here.
