# Therapysto domain cutover readiness audit — 2026-08-24

- Candidate: `a3538b37d5cd5f21929cc475ba948186717edb42`
- Base: `5272a07614aa068067431f40b8f3495e93bea054`
- Role: independent `auditor-live`
- Verdict: **FAIL**

## Blind kill-set (written before reading candidate tests or implementation diff)

Oracle: `IMPLEMENTATION_PLAN.md` §1.2, §1.2a, B7, B8, C5a, Stage D/E;
`SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §1–§3; the audit brief; and the owner decision
that preparation stays unmerged and unapplied until a separate command. In particular,
`test.bersoncare.ru` must continue to work at its previous address and exact TEST host values
must not be invented.

1. **Existing TEST nginx seam survives (view).** A rendered candidate must retain the current
   VPN/IP allowlist, integrator routes, payment webhook exceptions, access log, maintenance
   fallback, upload/timeouts and forwarded `Host`. Losing one makes an already supported TEST
   request fail or changes its security boundary.
2. **Unknown TLS Host fails closed in real nginx syntax (view + one-off compile).** The
   catch-all TLS server must be structurally valid with its certificate boundary and refuse an
   unknown SNI/Host; a config that merely looks fail-closed but cannot pass `nginx -t` is not a
   prepared candidate.
3. **Host routing and branded redirect are exact (repeatable CLI behavior).** Staff,
   platform-admin, default-patient, technical branded and custom clinic hosts must select the
   intended upstream. The technical branded host must redirect to the custom host while
   preserving the full URI; unknown hosts must never fall through to a platform upstream.
4. **TLS names and key paths are truthful (repeatable preflight + view).** The platform patient
   certificate must independently cover the apex and wildcard names; wildcard-only coverage
   must fail. The custom clinic certificate must exactly cover its host. Every declared cert/key
   path must be used by the rendered nginx candidate, with no silent sharing across the exact-host
   boundary.
5. **DNS proves the approved target (repeatable CLI behavior).** Preflight and monitoring must
   compare every host with an explicitly approved target, not accept any non-empty A/AAAA/CNAME
   response.
6. **Runtime inputs switch with the hosts (repeatable preflight + view).** All origins and
   callbacks already consumed by the surface resolver/auth path must be required and rendered
   for cutover. Merely backing up the old env without preparing an atomic candidate env must not
   be reported as readiness.
7. **Owner gate, pre-reload validation and rollback are atomic (repeatable CLI behavior + view).**
   Apply must be impossible without the explicit owner gate; candidate nginx must be compiled
   before reload; a failed compile/install/reload must leave or restore the prior active file and
   the prior `test.bersoncare.ru` seam, together with any coupled env state.
8. **Offline/render has no host side effects and rejects guessed maps (repeatable CLI behavior).**
   Empty, duplicate, malformed, unapproved or omitted host values/certificate paths must fail.
   `--offline --render` may only write the requested temporary render output and must not mutate
   nginx, env, services, DNS, TLS, cron or other host state.
9. **Monitoring is actionable (repeatable CLI behavior).** Daily monitoring must compare DNS to
   the approved target and exit non-zero when certificate lifetime reaches the configured warning
   threshold; printing a date or a mismatched address with exit zero is a missed outage signal.
10. **Runbook matches the executable flow (view + one-off offline render).** Commands must validate
    the rendered candidate actually intended for install, document exact activation and rollback,
    preserve `test.bersoncare.ru`, and must not claim B7/B8/C5a/D1–D3/C5 complete before owner-gated
    live evidence.

## Results

1. **FAIL — existing TEST seam.** The one-off render contains the forwarded `Host`, but does
   not contain `test.bersoncare.ru`, any VPN allowlist, the `127.0.0.1:3300` integrator seam,
   YooKassa webhook exceptions, access log, maintenance fallback, body limit or proxy timeouts.
   `--apply` replaces `/etc/nginx/sites-available/test.bersoncare.ru` with that reduced file.
2. **FAIL — unknown TLS Host.** Real nginx 1.24 rejects the rendered default TLS server because
   it has no certificate. Before that isolated check, the unmodified render also fails because
   the accepted key path is ignored in favour of a hard-coded path.
3. **FAIL — host routing as a complete runtime path.** The nginx portion sends the four serving
   hosts to TEST webapp `:6300`, and the technical branded redirect preserves URI. However,
   `RequestSurfaceResolver` derives staff/admin/default-patient hosts from webapp
   `APP_BASE_URL`/`PATIENT_APP_ORIGIN`; this package neither requires nor prepares those values.
   After the documented apply the new platform hosts therefore reach the process but not their
   intended surfaces. The redirect sub-contract itself passed fault injection.
4. **FAIL — TLS model.** The renderer exposes one certificate pair for every host, ignores the
   declared key path, has no separate exact-host certificate pair for the custom clinic host,
   and checks only five concrete hosts. It never proves the separate apex and wildcard names
   required by B7, so an exact technical-host SAN can be mistaken for wildcard readiness.
5. **FAIL — exact DNS target.** Preflight accepts any non-empty `getent ahosts` result; no approved
   target exists in the candidate map or comparison. The same defect exists in monitoring.
6. **FAIL — runtime origins/callbacks.** Neither the example map nor preflight/apply contains
   `APP_BASE_URL`, `PATIENT_APP_ORIGIN` or the exact patient OAuth callback allowlist already
   consumed by `productSurfaces.ts`, `requestSurface.ts` and `yandexOAuthConfig.ts`. The runbook
   only copies `webapp.test` before apply; it never prepares, validates or atomically installs a
   candidate env/settings state.
7. **FAIL — apply/rollback as a whole.** The explicit Boolean owner gate is effective and was
   fault-injected successfully. After it, though, the first `sudo nginx -t` checks the old active
   configuration, the script installs the candidate, and only then checks it. On injected failure
   it exits with the rejected file still active and has no internal backup/restore. The gate is
   also not bound to the exact host-map values. The runbook's `sudo nginx -t` instruction does not
   point nginx at the rendered candidate, so it cannot supply the missing pre-install check.
8. **FAIL — offline/map validation as a whole.** Offline render did not call DNS, TLS, sudo or
   service binaries; duplicate and malformed host values are rejected, and these guards passed
   fault injection. The CLI nevertheless accepts a map without the runtime cutover inputs and
   has no value-level approval binding, so the full requirement is not met.
9. **FAIL — monitoring.** A DNS answer for the wrong target exits zero. An already expired
   certificate is printed as an `enddate` and also exits zero; there is no warning threshold or
   `openssl x509 -checkend` equivalent. The proposed cron job would therefore report success for
   both owner-defined outage conditions.
10. **FAIL — runbook truthfulness.** It says the old host remains, says the first command verifies
    a fail-closed nginx contract, and asks the operator to inspect the render with a command that
    only checks active nginx. The executable candidate contradicts all three claims. The plan
    correctly leaves B7, B8, C5a, D1–D3 and C5 unchecked; no premature checkbox closure was found.

## Blocking findings

### F1 — Applying the candidate deletes the existing TEST contract and the result cannot compile

- **Reachable scenario:** after owner authorization, `--apply` installs the renderer output at the
  exact active `test.bersoncare.ru` path. That output does not serve `test.bersoncare.ru` and omits
  its allowlist, integrator paths, payment exceptions, logging, maintenance and timeout/upload
  settings. Its TLS default server also has no certificate.
- **Impact:** the existing TEST entry and integrations are lost; nginx validation fails, leaving a
  rejected active file. This is an availability regression and breaks the existing security seam.
- **Requirement:** implementation-plan oracle “`test.bersoncare.ru` continues to work at its
  previous address”; SERVER CONVENTIONS TEST allowlist/topology; audit scenarios 1, 2, 7 and 10.
- **Evidence:** `therapysto-domain-cutover.sh:43-62,71`; the offline render absence check below;
  real `nginx -t` fails at rendered line 3 with `no "ssl_certificate" is defined`.

### F2 — TLS preflight proves a different, weaker certificate model than B7/B8

- **Reachable scenario:** the operator supplies the documented certificate/key pair. The script
  ignores `TLS_CERTIFICATE_KEY_PATH`, hard-codes another key, uses the same certificate on the
  platform and custom-host blocks, and validates concrete hosts only. A certificate for one
  technical branded host passes without proving wildcard coverage; the custom host has no
  separate exact-host boundary.
- **Impact:** candidate validation can pass a certificate set that does not cover future clinic
  subdomains or violates the custom-domain boundary; the ignored key can also make nginx fail or
  pair the wrong private key.
- **Requirement:** B7 apex + wildcard as distinct names; B8/C5a exact custom-host certificate;
  audit scenario 4 and “every declared key path is used”.
- **Evidence:** `therapysto-domain-cutover.sh:40-42,49-59,65-66`; failing acceptance subtest
  `offline render uses the declared certificate key path`; direct nginx compile first fails on the
  ignored hard-coded key.

### F3 — New nginx hosts are not connected to the existing resolver/auth runtime inputs

- **Reachable scenario:** nginx begins forwarding approved staff/admin/default-patient hosts while
  `webapp.test` retains the old `APP_BASE_URL` and unset/old `PATIENT_APP_ORIGIN`, and the Yandex
  exact callback allowlist remains unchanged. The resolver compares Host with those runtime origins;
  unmatched platform hosts fall into tenant lookup and fail closed.
- **Impact:** staff, platform-admin and default-patient entry are hard-404/unusable; OAuth on the new
  patient/custom origins is disabled by its exact allowlist. A backup of the old env does not prepare
  a cutover.
- **Requirement:** scenarios 3 and 6; Stage D host journeys; E land-ready truthfulness.
- **Evidence:** candidate map contains only five hosts and one cert/key pair;
  `apps/webapp/src/config/productSurfaces.ts:14-26`,
  `apps/webapp/src/shared/lib/surface/requestSurface.ts:137-181`, and
  `apps/webapp/src/modules/auth/yandexOAuthConfig.ts:20-69`; failing acceptance subtest for missing
  runtime origins/callbacks.

### F4 — Apply validates after replacement and has no atomic rollback or value-bound approval

- **Reachable scenario:** the old nginx config is valid, the rendered candidate is invalid, and the
  Boolean owner env is present. The first check passes against old nginx; install replaces the
  active file; the second check fails; the script exits without restoration. A syntactically valid
  but different map is accepted under the same Boolean.
- **Impact:** a rejected candidate remains in the active path; a later reload/restart can take TEST
  down, and rollback no longer restores the exact old seam atomically with env/settings.
- **Requirement:** owner-gated apply, candidate validation before reload/install, atomic rollback,
  preservation of `test.bersoncare.ru`; audit scenarios 7, 8 and 10.
- **Evidence:** `therapysto-domain-cutover.sh:68-72`; failing virtual-host-state acceptance subtest.
  The runbook's pre-apply `sudo nginx -t` has no `-c`/temporary include and tests active state only.

### F5 — DNS and certificate monitoring report owner-defined outages as success

- **Reachable scenario:** all names still resolve, but to an address different from the approved
  target; or the served certificate is expired/inside the warning window. `getent` and extraction
  of `notAfter` both succeed, so the cron command exits zero.
- **Impact:** patients can be routed away from the expected TEST host or meet an expired certificate
  while the daily operational signal stays green.
- **Requirement:** C5 daily exact-target and expiry monitoring; audit scenarios 5 and 9.
- **Evidence:** `therapysto-domain-cutover.sh:67`,
  `check-therapysto-domain-certificates.sh:9-12`; failing DNS-drift and expired-certificate
  acceptance subtests.

### F6 — The candidate test is a false green gate for the unsafe package

- **Reachable scenario:** `node deploy/host/therapysto-domain-cutover.test.mjs` passes by matching
  three rendered strings and one malformed hostname while the candidate is not nginx-valid and all
  findings above remain reachable.
- **Impact:** `pnpm test:scripts` can signal success for this surface without validating the costly,
  silent operational failures the test is supposed to prevent.
- **Requirement:** AGENTS.md §10a/§10b and §24.5: public behavior, blind kill-set, and targeted fault
  injection; audit brief's explicit CLI scenarios.
- **Evidence:** candidate test exits 0; the acceptance command below exits 1 with six behavioral
  failures. `package.json:21` includes both under `deploy/host/*.test.mjs`.

## Acceptance tests and fault injection

The added `deploy/host/therapysto-domain-cutover.acceptance.test.mjs` uses only the public shell
CLIs, temporary files and fake external binaries. The protected failures are expensive and silent:
domain outage/misdirection, an invalid active nginx file, unusable auth surfaces and a green monitor
during DNS/certificate failure. It does not inspect production source text.

Command on the restored candidate:

```text
node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs
→ exit 1; 9 tests: 3 pass, 6 fail
```

The six failing fixed oracles are: declared key path not used; wrong DNS target accepted by
preflight; missing origin/callback inputs accepted; failed nginx validation leaves the candidate
active; DNS drift exits zero in monitoring; an expired certificate exits zero in monitoring.

Green contracts were independently mutated and restored:

- removed `$request_uri` from the technical-host redirect →
  `node deploy/host/therapysto-domain-cutover.test.mjs` exited 1 at its redirect assertion;
- made the owner condition tautological →
  `node --test --test-name-pattern='apply without the owner gate' deploy/host/therapysto-domain-cutover.acceptance.test.mjs`
  exited 1;
- forced DNS access during offline render →
  `node --test --test-name-pattern='offline render does not call' deploy/host/therapysto-domain-cutover.acceptance.test.mjs`
  exited 1;
- weakened the distinct-host count from `-eq 5` to `-ge 1` →
  `node --test --test-name-pattern='host-map validation rejects duplicate' deploy/host/therapysto-domain-cutover.acceptance.test.mjs`
  exited 1.

After restoration,
`git diff --exit-code -- deploy/host/therapysto-domain-cutover.sh` exited 0.

## Exact commands and results

```text
git diff --stat 5272a0761 a3538b37d
→ 8 files changed, 179 insertions(+), 1 deletion(-)

node deploy/host/therapysto-domain-cutover.test.mjs
→ exit 0; "therapysto domain cutover contracts: PASS"

node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs
→ exit 1; 9 tests: 3 pass, 6 fail

bash -n deploy/host/therapysto-domain-cutover.sh deploy/host/check-therapysto-domain-certificates.sh
node --check deploy/host/therapysto-domain-cutover.acceptance.test.mjs
→ both exit 0

pnpm exec prettier --check deploy/host/therapysto-domain-cutover.acceptance.test.mjs \
  docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md
pnpm exec eslint deploy/host/therapysto-domain-cutover.acceptance.test.mjs
→ not run: this worktree has no installed `prettier` or `eslint`; pnpm exited 254 for both commands
```

One-off offline topology inspection used:

```text
bash deploy/host/therapysto-domain-cutover.sh \
  --host-map /tmp/bcb-therapysto-audit-hosts.env --offline \
  --render /tmp/bcb-therapysto-audit-rendered.conf
→ exit 0

for pattern in 'test\.bersoncare\.ru' 'allow 10\.9\.0\.0/24' \
  '127\.0\.0\.1:3300' 'saas-webhook|patient-acquiring-webhook' \
  'access_log ' 'maintenance\.html' 'client_max_body_size 55m' \
  'proxy_read_timeout 120s' 'proxy_set_header Host \$host'; do
  rg -n "$pattern" /tmp/bcb-therapysto-audit-rendered.conf || echo "MISSING: $pattern"
done
→ only `proxy_set_header Host $host` was present; the preceding eight patterns were MISSING
```

Real nginx syntax/compile checks were entirely local and used a one-day self-signed fixture:

```text
nginx -t -p /tmp/bcb-therapysto-nginx-prefix/ \
  -c /tmp/bcb-therapysto-audit-nginx.conf
→ exit 1: cannot load the hard-coded certificate key path

# After changing only that wrong key reference in a temporary rendered copy:
nginx -t -p /tmp/bcb-therapysto-nginx-prefix/ \
  -c /tmp/bcb-therapysto-audit-nginx-key-fixed.conf
→ exit 1: no "ssl_certificate" is defined for the default `listen ... ssl` server, rendered line 3
```

Full CI was not run: the audit added one local CLI acceptance file and its intentional red state is
the handoff oracle; a repository-wide run would add cost without changing the candidate verdict.

## Live state explicitly not touched

No connection or command was made against TEST or PROD. DNS, certificate issuance/storage, nginx,
systemd, env files, database/settings, cron/cronport, webapp/integrator processes and live resolver
state were not read or changed. No deploy, apply, reload, restart, merge, push or plan-checkbox update
was performed. All execution used the worktree and `/tmp` fixtures/fake binaries only.
