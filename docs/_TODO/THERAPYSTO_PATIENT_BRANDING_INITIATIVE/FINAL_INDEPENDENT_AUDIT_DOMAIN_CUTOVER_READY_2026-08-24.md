# Therapysto future-domain cutover package — final independent audit 2026-08-24

- Audited candidate: `b97240812aecc9a550125f3677ab637b618b0131`
- Fix commit: `8f5197fbb`; current `feat` merge: `dddb633a9`; merge-seam correction: `b97240812`
- Authority/oracle: `CLOSING_AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md`, CF1-CF4
- Role: final independent auditor; no product-code fixes
- Verdict: **PASS**

No blocking finding remains. The package is ready for a later owner-authorized switch, but this audit does not
authorize merge or apply. The live `test.bersoncare.ru` scheme remains the active scheme.

## CF1-CF4 result

### CF1 — PASS: split TLS has no hostname exception

`therapysto-domain-cutover.sh` unconditionally requires both the platform certificate path and key path to differ
from the custom-clinic pair. There is no `.test.example` or other hostname-dependent waiver. The platform material
is checked for staff, platform admin, patient apex, patient wildcard and technical branded host; the custom material
is checked separately for the exact clinic host. The committed scenario using fixture-looking hostnames and one
shared pair now exits non-zero.

### CF2 — PASS: offline apply stops before host access

The `--offline` + `--apply` incompatibility is rejected immediately after argument parsing and before host-map file
validation, DNS, TLS, `sudo`, service or mutation work. The committed scenario supplies a valid owner digest and a
fake `sudo` marker; apply exits non-zero and the marker is absent.

### CF3 — PASS: DB and active runtime are gates, not operator prose

The apply path verifies `yandex_oauth_redirect_uri` through the webapp DB-backed `getConfigValue` chokepoint before
candidate creation, backup or mutation. The verifier accepts only the two distinct map callbacks after parsing and
sorting, and its failure output is constant; it never emits the stored setting. A mismatch exits before any fake
mutation/restart/reload event.

The successful ordering is: DB verifier → candidate compile → backups → env install → nginx install → installed
nginx validation → TEST webapp restart → active-service assertion → loopback health with `Host: <STAFF_HOST>` →
nginx reload → `apply OK`. Thus the new env is active and Host-aware runtime health is proven before success.

### CF4 — PASS: rollback oracle is hermetic and reaches mutation

All apply simulations select `THERAPYSTO_CUTOVER_HERMETIC_ROOT` below `/tmp`, which redirects both
`webapp.test` and `test.bersoncare.ru` to fixture files. DNS/TLS, `sudo`, `systemctl`, nginx and curl are fake
commands. The installed-nginx failure records `mutate-env` and `mutate-nginx` before `restore-env` and
`restore-nginx`; it then validates and reloads the restored nginx state. Restart and health failures restore both
files, restart the old env, require the service active and health-check the restored Host. Failures before runtime
activation leave the old process running; failures after activation restore and prove the old runtime.

The restored Host is derived by the merged strict `webapp-health-host.mjs` helper, not by shell slicing or a loose
URL parser. It accepts only an exact HTTP(S) origin without credentials. The strict-origin test rejects userinfo,
paths/query/fragment, leading whitespace and CRLF input with empty stdout, so those values cannot become curl's
`Host` argument.

## Executable flow versus runbook

`deploy/HOST_DEPLOY_README.md` states the same sequence as the executable: DB allowlist precondition; temporary
candidate compile; coupled env/nginx backups and installs; installed nginx validation; webapp restart and
`is-active`; Host-aware loopback health; nginx reload; success. Its rollback section matches the flags in the
script: independently restore every file whose mutation began, validate/reload restored nginx, and when runtime
activation began restart the old env and prove restored health with the old `APP_BASE_URL` Host. It explicitly
keeps the future path inactive and leaves the live-evidence boxes open.

## Exact checks on the exact candidate

The repository branch had advanced to `6643f6bfafb822e445fde69a0d1507929738490b`, but
`git diff --name-status b97240812..HEAD` listed only four orchestration Markdown files. The executable and runbook
tree is unchanged. All checks below nevertheless ran in a detached `/tmp` worktree whose
`git rev-parse HEAD` returned `b97240812aecc9a550125f3677ab637b618b0131`.

```text
node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs
11 tests, 11 pass, 0 fail; exit 0

node deploy/host/therapysto-domain-cutover.test.mjs
therapysto domain cutover contracts: PASS; exit 0

bash -n deploy/host/apply-test-nginx-webapp.sh deploy/host/therapysto-domain-cutover.sh deploy/host/check-therapysto-domain-certificates.sh
exit 0

node --check deploy/host/therapysto-domain-cutover.acceptance.test.mjs
node --check deploy/host/therapysto-domain-cutover.test.mjs
node --check deploy/host/webapp-health-host.mjs
node --check deploy/host/webapp-health-host.test.mjs
all exit 0

node --test deploy/host/webapp-health-host.test.mjs
2 tests, 2 pass, 0 fail; exit 0

git diff --check 023007142..b97240812
git diff --check
both exit 0
```

## One-time fault injections for the changed classes

Each mutation was made only in the detached `/tmp` candidate checkout, run once for its class, then reversed.

1. CF3: removed the DB callback precondition and ran
   `node --test --test-name-pattern='apply proves DB/runtime activation' deploy/host/therapysto-domain-cutover.acceptance.test.mjs`.
   Exit `1`; `DB callback mismatch must abort apply` turned red because actual status became `0`.
2. CF4/rollback: removed env restoration after mutation and ran the same targeted command. Exit `1`; the ordered
   event assertion turned red because `restore-env` was absent after `mutate-env`/`mutate-nginx`.
3. Strict origin: weakened the helper to accept non-exact credentialed URLs and ran
   `node --test deploy/host/webapp-health-host.test.mjs`. Exit `1`; the assertion reported
   `accepted unsafe APP_BASE_URL: "https://user:test@test.bersoncare.ru"`.

After reversal, `git diff --exit-code` and `git status --short` were empty. The targeted CF3/rollback scenario
returned `1 pass, 0 fail`, and the strict-origin suite returned `2 pass, 0 fail`.

## Live-state boundary

No DNS, certificate, nginx, env, systemd, DB, cron, DEV, TEST or PROD state was read or changed. No live env file,
secret or stored DB value was read or printed. No deploy, apply, merge or push occurred. Every stateful simulation
and fault injection stayed below `/tmp` with fixture files and fake commands.

**PASS — `b97240812aecc9a550125f3677ab637b618b0131`.**
