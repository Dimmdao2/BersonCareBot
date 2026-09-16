# #915 final named-DEV PWA bootstrap recheck

Date: 2026-09-09. Candidate HEAD: `ba26d21405b6f746e462694edf1b53a4e2b1242b`. This SHA contains the merged
native-push keyring correction (`fd3f6a3b5` "fix(mobile): degrade missing push keyring safely #915",
independently confirmed **PASS** on K18/K19 by
`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md`, merged via `8e94cb55a`
which `git merge-base --is-ancestor` confirms is an ancestor of this candidate).

Product code and tests were **not modified**. This is the one-time HTTP/HTML/manifest inspection required by
`.lead/briefs/mobile-pwa-live-bootstrap-recheck-auditor-20260909.md`.

## Verdict summary

| Point | Result |
| --- | --- |
| 1. Ordinary bootstrap no longer throws `native_push_token_keyring_unavailable` | **PASS** |
| 2. Default Therapy Go HTML metadata + manifest | **PASS** |
| 3. Therapysto staff HTML metadata + staff manifest | **PASS** |
| 4. Platform-admin excluded from both PWA identities | **PASS** |
| 5. Published branded-patient host preserves its own identity | **BLOCKED — no live branded host exists on this DEV instance (see below)** |
| 6. Install URLs and doctor redirect; no `/setup` | **PASS** |

## Environment setup

- `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` confirmed present, `-rw-r-----` (`0640`), owner
  `dev:dev`, size 70862 bytes (`ls -la` / `stat`). Contents were never read, printed, grepped, or copied.
- `/home/dev/dev-projects/BersonCareBot/.env` confirmed present, `-rw-r-----` (`0640`), owner `dev:dev`. Contents
  were never read, printed, grepped, or copied.
- Exposed to the candidate only as temporary symlinks `apps/webapp/.env.dev` and `.env` (root `.gitignore` lines
  3/67 already cover `.env` and `.env.*`; `git status --porcelain` showed nothing while the symlinks existed).
  Both symlinks were removed during cleanup; `git status --porcelain` after cleanup is empty (confirmed below).
- `pnpm install --offline --frozen-lockfile` and the standard workspace-package builds
  (`packages/shared-contracts`, `packages/db-principal`, `packages/platform-merge`, `packages/error-tracking`,
  `packages/operator-db-schema` — all five `pnpm-workspace.yaml` packages besides `apps/*`) were run to make the
  local candidate resolvable; none write product/test files.

## Candidate process

Started directly (no wrapper, no port-killer script) on isolated port `5211` (5210–5219 range; `ss -ltnp` before
launch showed nothing bound in that range):

```bash
cd apps/webapp && setsid nohup npx next dev -H 127.0.0.1 -p 5211 > /tmp/pwa-recheck-5211.log 2>&1 < /dev/null &
```

Readiness (explicit timeout, curl-poll loop, no infinite blocking):

```bash
deadline=$((SECONDS+300))
while [ $SECONDS -lt $deadline ]; do
  status=$(curl --connect-timeout 3 --max-time 10 -sS -o /dev/null -w '%{http_code}' -H 'Host: therapygo.ru' http://127.0.0.1:5211/app)
  [ "$status" != "000" ] && [ -n "$status" ] && break
  sleep 5
done
```

No DB migration or write was performed at any point.

## Point 1 — keyring bootstrap fix (real HTTP, unmodified env)

First candidate boot used the named-DEV env **unmodified** (only the read-only-confirmed symlinks above). Requests
against the loopback host that this DEV's `APP_BASE_URL` actually resolves to (see "DEV platform-origin
discovery" below) returned real page responses, not a 500:

```bash
curl -sS -D - -H 'Host: 127.0.0.1:5211' http://127.0.0.1:5211/       # -> HTTP/1.1 200
curl -sS -D - -H 'Host: 127.0.0.1:5211' http://127.0.0.1:5211/app    # -> HTTP/1.1 404 (route-level, not surface crash)
```

`grep -iE 'error|500|keyring' /tmp/pwa-recheck-5211.log` (excluding the unrelated Node TLS `DeprecationWarning`)
returned **no output** — no `native_push_token_keyring_unavailable`, no 500, no other runtime error, across the
entire boot and every probe in this report (both the unmodified-env boot and the second boot used for points
2–6 below). The exact blocker named by the prior confirmation report
(`.lead/runs/mobile-pwa-live-acceptance-confirmation-20260909/90-final-audit-report.md`) is gone on this
candidate. **PASS.**

## DEV platform-origin discovery (why points 2–6 needed one additional, non-secret env override)

Before asserting Therapy Go / Therapysto / platform-admin identity, the actual configured platform Hosts on this
named DEV were discovered live (not assumed from the static domain map), per the brief's own instruction:

```bash
for h in "127.0.0.1:5211" "therapygo.ru" "therapysto.ru" "admin.therapysto.ru" "app.bersoncare.ru"; do
  curl -sS -o /dev/null -w "$h -> %{http_code}\n" --max-time 15 -H "Host: $h" http://127.0.0.1:5211/api/me
done
# 127.0.0.1:5211    -> 200 (matches STAFF surface via the loopback-any-port compatibility rule in
#                          requestSurface.ts's requestPlatformHost)
# therapygo.ru       -> 404
# therapysto.ru      -> 404
# admin.therapysto.ru -> 404
# app.bersoncare.ru  -> 404
```

`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §"Webapp dev env: подтвержденные ключи" independently documents this
DEV's confirmed `APP_BASE_URL=http://127.0.0.1:5200` with no separate `PATIENT_APP_ORIGIN` override; `env.ts:270`
falls back `PATIENT_APP_ORIGIN` to `APP_BASE_URL` when absent — i.e. this named DEV currently runs the
documented single-shared-loopback-host transitional mode (`isSharedStaffAndPatientHost` in
`requestSurface.ts`), where `staffHost === patientHost` and the resolver's own first branch always returns
`'staff'` for that host. A `127.0.0.1`-based origin also cannot carry the `admin.<host>`/`<slug>.<host>`
label prefix used by platform-admin/branded lookups — `new URL('http://admin.127.0.0.1:5200')` throws
`Invalid URL` (verified directly with `node -e`) because a bare IPv4 literal cannot take a subdomain label.
Real, distinguishable Therapy Go / Therapysto / platform-admin Hosts are therefore structurally unreachable
against this DEV's own `127.0.0.1` platform origin, independent of the keyring fix.

The sanctioned prior workaround for exactly this situation is on record:
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_LOGIN_SURFACE_SPLIT_2026-09-07.md:192-193` launched an
earlier candidate with `APP_BASE_URL=http://staff.localhost:5211` and
`PATIENT_APP_ORIGIN=http://patient.localhost:5211` as **process env overrides on top of** the named-DEV env,
never editing the env file. The same technique is used here for points 2–6: these two non-secret deploy-config
values (hostnames only, no credential, no DB/session config) were set as process env when relaunching the same
candidate on the same port 5211, all other named-DEV env untouched:

```bash
cd apps/webapp && APP_BASE_URL=http://staff.localhost:5211 PATIENT_APP_ORIGIN=http://patient.localhost:5211 \
  setsid nohup npx next dev -H 127.0.0.1 -p 5211 > /tmp/pwa-recheck-5211.log 2>&1 < /dev/null &
```

This second boot **also** produced zero keyring/500 errors in its log (grepped as above) — point 1's evidence
holds independently on this boot too.

## Point 2 — default Therapy Go metadata + manifest

```bash
curl -sS -D - -H 'Host: patient.localhost:5211' http://127.0.0.1:5211/app/patient
# HTTP/1.1 307 Temporary Redirect
# location: http://patient.localhost:5211/app/patient/login?next=%2Fapp%2Fpatient

curl -sS -H 'Host: patient.localhost:5211' http://127.0.0.1:5211/app/patient/login -o /tmp/patient_login.html
```

Observed HTML metadata (`/app/patient/login`, `content-type: text/html`):

- `<title>Therapy Go</title>`
- `<link rel="manifest" href="/manifest.webmanifest"/>`
- `<link rel="apple-touch-icon" href="/therapygo-apple-touch-icon.png" sizes="180x180"/>`
- `<meta name="apple-mobile-web-app-title" content="Therapy Go"/>`

```bash
curl -sS -D - -H 'Host: patient.localhost:5211' http://127.0.0.1:5211/manifest.webmanifest
```

`HTTP/1.1 200 OK`, `content-type: application/manifest+json; charset=utf-8`. Body:

```json
{
  "id": "/app",
  "name": "Therapy Go — забота о твоём здоровье",
  "short_name": "Therapy Go",
  "start_url": "/app/patient",
  "scope": "/app",
  "display": "standalone",
  "icons": [
    { "src": "/therapygo-pwa-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/therapygo-pwa-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/therapygo-pwa-icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Matches M1-01/M1-02 acceptance (`id: '/app'`, `scope: '/app'`, `start_url: '/app/patient'`, Therapy Go name,
192/512 `any` + separate `maskable` 512). **PASS.**

## Point 3 — Therapysto staff metadata + staff manifest

```bash
curl -sS -D - -H 'Host: staff.localhost:5211' http://127.0.0.1:5211/app/doctor
# HTTP/1.1 307 Temporary Redirect
# location: http://staff.localhost:5211/app/doctor/login?next=%2Fapp%2Fdoctor

curl -sS -H 'Host: staff.localhost:5211' http://127.0.0.1:5211/app/doctor/login -o /tmp/staff_login.html
```

Observed HTML metadata:

- `<title>Therapysto</title>`
- `<link rel="manifest" href="/manifest-staff.webmanifest"/>`
- `<meta name="apple-mobile-web-app-title" content="Therapysto"/>`

```bash
curl -sS -D - -H 'Host: staff.localhost:5211' http://127.0.0.1:5211/manifest-staff.webmanifest
```

`HTTP/1.1 200 OK`, `content-type: application/manifest+json; charset=utf-8`. Body:

```json
{
  "id": "/app-staff",
  "name": "Therapysto",
  "short_name": "Therapysto",
  "start_url": "/app/doctor",
  "scope": "/app",
  "display": "standalone",
  "icons": [
    { "src": "/therapysto-pwa-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/therapysto-pwa-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/therapysto-pwa-icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Matches M1-03 acceptance (Therapysto name, `start_url: '/app/doctor'`, separate icon set from Therapy Go).
**PASS.**

## Point 4 — platform-admin excluded from both PWA identities

```bash
curl -sS -D - -H 'Host: admin.staff.localhost:5211' http://127.0.0.1:5211/app/admin
# HTTP/1.1 307 Temporary Redirect
# location: http://admin.staff.localhost:5211/app/admin/login?next=%2Fapp%2Fadmin

curl -sS -H 'Host: admin.staff.localhost:5211' http://127.0.0.1:5211/app/admin/login -o /tmp/admin_login.html
# <title>Therapysto</title>  -- present
# no <link rel="manifest" ...> anywhere in the body
# no <meta name="apple-mobile-web-app-..."> anywhere in the body

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: admin.staff.localhost:5211' http://127.0.0.1:5211/manifest.webmanifest
# 404
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: admin.staff.localhost:5211' http://127.0.0.1:5211/manifest-staff.webmanifest
# 404
```

Neither manifest route resolves on the admin host and no install-metadata tag is present in its HTML.
Matches M1-05 acceptance. **PASS.**

## Point 5 — published branded-patient host (live discovery)

The brief requires discovering the actually published branded host live rather than assuming one from the
static domain map. This DEV's tenant/custom-domain lookup (`productionTenantSurfaceLookup.ts`) resolves a
branded host through exactly two backing tables: `public.org_custom_domain_bindings` (active custom domain) and
`public.clinic_public_directory_entries` (published `<slug>.therapygo.ru`). Both were queried **read-only**
(`BEGIN READ ONLY; ...; ROLLBACK`) as the `postgres` superuser over the local admin socket, which bypasses RLS —
so a `0` result here is a real count, not an RLS-masked one (`AGENTS.md` §1b "Zero под RLS is not empty" is
satisfied by using a role that bypasses RLS entirely):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "
BEGIN READ ONLY;
SELECT count(*) FROM public.be_organizations;                        -- 1
SELECT count(*) FROM public.org_custom_domain_bindings;               -- 0
SELECT count(*) FROM public.clinic_public_directory_entries;          -- 0
SELECT count(*) FROM public.organization_slug_claims;                 -- 0
ROLLBACK;"
```

This named DEV has exactly one organization (the owner's own clinic) and it has **no** active custom domain and
**no** published patient-subdomain slug. There is therefore no branded-patient host live on this DEV instance to
probe — fabricating a Host header for a nonexistent binding would not be real evidence. **BLOCKED**, not FAIL:
the M1-04/M7-03 branded-identity-preservation behavior itself is unchanged and untouched by this recheck; there
is simply no live subject to exercise it against on this DEV database today. This slice remains open pending
either a live custom-domain/slug fixture created through the normal product flow (owner action, not this
read-only recheck) or a TEST-environment pass where one may already exist.

## Point 6 — install URLs, doctor redirect, no `/setup`

```bash
curl -sS -D - -H 'Host: patient.localhost:5211' http://127.0.0.1:5211/app/patient/install
# HTTP/1.1 307 Temporary Redirect
# location: http://patient.localhost:5211/app/patient/login?next=%2Fapp%2Fpatient%2Finstall

curl -sS -D - -H 'Host: staff.localhost:5211' http://127.0.0.1:5211/app/doctor/install
# HTTP/1.1 307 Temporary Redirect
# location: http://staff.localhost:5211/app/doctor/login?next=%2Fapp%2Fdoctor%2Finstall

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: patient.localhost:5211' http://127.0.0.1:5211/setup   # 404
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: staff.localhost:5211'   http://127.0.0.1:5211/setup   # 404
```

Both install routes exist (not 404) and correctly redirect unauthenticated requests to their surface's login
with `next=` preserving the install destination — proving the routes are wired, not absent. `/app/doctor/install`
is the compatible specialist redirect per M1-06; its authenticated final destination (account install tab) is
explicitly deferred to the integrated M7-03 browser/PWA pass per the plan's own text ("Живой browser/PWA проход
остаётся частью M7-03 и не подменён unit-проверками"), unchanged by this recheck. `/setup` does not exist on
either surface — no new install surface was introduced. **PASS** for what real unauthenticated HTTP can prove at
this stage; the authenticated end-to-end walk stays with M7-03 as already scoped.

## Cleanup

```bash
kill -TERM -3407126   # process-group TERM of the setsid-owned next dev group
```

After termination:

```bash
ss -ltnp | grep -E ':(521[0-9])\b'   # no output — 5210-5219 clean
pgrep -af 'next dev -H 127.0.0.1 -p 521'   # no output
```

`apps/webapp/.env.dev` and `.env` symlinks removed; `git status --porcelain` empty. All temporary HTML/manifest
bodies and the server log under `/tmp` were deleted. No cookies, screenshots, or credentials were retained. No
DB migration or write occurred at any point in this recheck.

**убито 0 / непойманных 0.** This is a one-time live HTTP/HTML/manifest inspection; no fault injection applies
without adding a prohibited test of launch circumstances or substituting a direct builder call for runtime
behavior.

## Scope note

Browser-native file fallback and iframe Jitsi remain explicitly out of scope, left for the later integrated
M7-03 pass, per the brief. Point 5's branded-identity live proof also remains open, blocked on the absence of a
published branded organization in this DEV database rather than on any code defect.

## Validation

```bash
git diff --check
```

Run clean after creating this report and before staging it.
