# Short-lived TEST global-admin visual session

This is the canonical handoff for an authorized visual agent that needs `/app/admin/system-health` on TEST.
It uses the already registered owner global-admin account and does not use dev-bypass.

## Security model

- A root operator runs one repository helper on the TEST host.
- The helper requires `webapp.test` to be a regular non-symlink `root:deploy 0640` file with no duplicate env keys.
  Its `DATABASE_URL_GLOBAL_ADMIN` must be PostgreSQL on exact `127.0.0.1:5432/bersoncarebot_test`.
- Before sending credentials, the helper proves that `bersoncarebot-webapp-test.service` is active as
  `bcb-web-test:bcb-web-test` (its own dedicated OS identity since the B-1 split — see
  `docs/_TODO/B1_B2_IDENTITY_SPLIT_RUNBOOK.md`), has the canonical TEST standalone working directory, and
  that its `MainPID` owns the `127.0.0.1:6300` listener.
- Credentials are read internally from the existing strict `/opt/env/bersoncarebot/saas-smoke-login.env` parser.
  Values never enter argv, stdout, logs, repository files, or the handoff manifest.
- Authentication uses ordinary `POST /api/auth/email-password/login` through the exact
  `https://test.bersoncare.ru` origin after the helper proves the local TEST listener identity.
- The root-only TEST helper re-signs the verified admin session with bounded factor assurance, `expiresAt`, and
  `operatorSession.purpose=test_global_admin_visual`. Webapp session renewal explicitly refuses to slide it.
- TTL defaults to 30 minutes and is restricted to 5–60 minutes.
- The separate Netscape cookie jar is `/run/bersoncarebot-visual/global-admin.cookies`, directory `root:dev 0750`,
  file `root:dev 0640`. It is outside both repositories and separate from the product-smoke packet.
- Expiry is cryptographic: the signed cookie becomes invalid at `expiresAt`. `revoke` removes the handoff file
  immediately; the visual agent must also close its isolated browser profile and remove any local copy.

This is intentionally an owner-only helper, not an automatic deploy step: an ordinary global-admin session is
created only for an explicit visual-review window.

## Operator commands

Run from a root shell on the TEST host, after the exact target commit is deployed and health is green:

```bash
cd /opt/projects/bersoncarebot-test
node deploy/host/test-visual-global-admin-session.mjs issue --ttl-seconds 1800
```

The command prints only the fixed handoff path and ISO expiry. It never prints the email, password, cookie, session
payload, user ID, or protected packet contents. If an unexpired handoff already exists, issuance fails until the
operator revokes it.

The authorized `dev` visual agent may inspect safe status without reading the cookie value:

```bash
cd /home/dev/dev-projects/BersonCareBot
node deploy/host/test-visual-global-admin-session.mjs status
```

Use the jar only through the constrained repository capture wrapper. The wrapper accepts no base URL, cookie path,
output path, or route argument: it fixes the origin to exact `https://test.bersoncare.ru`, the jar to the handoff
above, and the route to `/app/admin/system-health`. It also strips the inherited environment before starting the
underlying screenshot engine.

```bash
cd /home/dev/dev-projects/BersonCareBot
node deploy/host/capture-test-global-admin-system-health.mjs capture
```

Direct invocation of `/home/dev/brain/host-orch/shot.mjs` with this global-admin jar is forbidden. In particular,
never pass the jar to a caller-controlled `BASE`, route, or origin. The wrapper creates its own UTC run directory
under `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/` and prints only that path. A zero exit from the underlying
engine is not success by itself: the wrapper requires exactly one non-empty, structurally valid PNG with the fixed
System Health filename in that exact directory. It removes the engine's `last-shot.json` and every unexpected
artifact before reporting success, and fails closed if the PNG is missing, malformed, ambiguous, or a symlink.

Do not copy `last-shot.json` into durable evidence: it may contain page text. Keep only sanitized findings/manifest
and reviewed screenshots. Never print, `cat`, archive, commit, or send the jar.

Immediately after capture, from the root operator shell:

```bash
cd /opt/projects/bersoncarebot-test
node deploy/host/test-visual-global-admin-session.mjs revoke
```

Then the visual agent closes the isolated browser context and removes any browser profile or copied jar. `status`
must report `absent`. If cleanup is missed, the cookie still cannot slide and expires within the bounded TTL.

## Refusal and residual boundary

- The helper refuses non-root issuance/revocation, non-canonical TEST env metadata, duplicate env keys, non-local
  PostgreSQL host/port, non-TEST database names, wrong systemd/listener identity, malformed protected packets,
  invalid session signatures, non-admin sessions, unsafe TTL, symlink output directories/files,
  and overwrite of an existing handoff. The capture wrapper rejects non-dev callers, expired/mis-scoped/non-Secure
  cookies and every caller-supplied argument.
- The fixed System Health route has its own global-operator layout: it still requires `role=admin` and a
  factor-verified session, but deliberately does not require a tenant organization membership. Before Chromium starts, the
  wrapper follows only same-origin redirects for the exact route and emits one classified line containing only the
  fixed origin, normalized path, HTTP status and category. Redirect loops, cross-origin redirects, auth failures and
  non-200 terminal responses fail closed without exposing headers, cookie values, response bodies or page text.
- It does not modify TEST DB data, services, nginx, passwords or grants.
- Immediate server-side denylisting does not exist for the application's stateless HMAC cookies. `revoke` removes
  the controlled handoff, while the non-renewable signed expiry is the hard upper bound for a copy already taken.
  Keep TTL minimal and revoke/close the isolated profile immediately.
