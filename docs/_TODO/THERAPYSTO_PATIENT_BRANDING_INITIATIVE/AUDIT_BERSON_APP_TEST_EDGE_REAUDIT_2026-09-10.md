# Independent re-audit — Berson Care TEST edge and branded-root transport (#787)

**Verdict: FAIL — NOT LAND-READY.** The previous public-DNS blocker is closed. The installer does not satisfy the brief's hostname-validation and failure-rollback requirement. No product/deploy code or tests were changed.

## Candidate and authority

- Exact inspected HEAD, obtained with `git rev-parse HEAD`: `0c5eb25b592954f1e6abfeb663cd7594d72df6a3`.
- Exact product diffs read with `git show --format=fuller 122e99fe6` and `git show --format=fuller ee342afc2`: edge `122e99fe69ca44318079769d923f157f01dfa398`; rewrite correction `ee342afc22bb4ab4bf7f2555590da1266590bfad`.
- Both are ancestors of HEAD (`git merge-base --is-ancestor <product-ref> HEAD`). `git diff 122e99fe6 HEAD --exit-code -- deploy/host/apply-test-surface-domains.sh deploy/host/apply-test-vpn-dns.sh deploy/host/deploy-test.sh deploy/postgres/test-settings-override.sql` and `git diff ee342afc2 HEAD --exit-code -- apps/webapp/src/proxy.ts` passed: those inspected implementations remain unchanged.
- Authority: this bounded re-audit brief; implementation plan §1.2/§1.2a (owner decision 10.09.2026), B3/B5/B7/B8/C5a/D1–D3; historical first-audit queue row for `122e99fe6`. Existing nginx plus exact Certbot TLS is the temporary TEST exception; Caddy/new PROD and the external website remain outside this gate.
- Read AGENTS heading map and complete §1/§1b/§5/§9/§10a/§10b/§24, Git/communication sections, README, relevant SERVER CONVENTIONS and HOST_DEPLOY_README sections, LOCAL_DEV_AND_AGENT_TESTING, Cursor entry rule and CLAUDE entry. Checked owner/authority registry back-references and current plan; dated TEST exception governs the broader automatic-edge prose.

## Classification before inspection

| Brief item | Class | Evidence method |
| --- | --- | --- |
| Public/local DNS | VIEW | Read-only resolver answers |
| First-install ACME, exact certificate, rollback | VIEW | Installer control flow and existing certificate-validator observation |
| TEST-only scope and preserved ingress | VIEW | Exact diffs, rendered configuration and existing checker |
| Standalone branded-root transport | VIEW | Existing resolver → patient projection → rewrite code path |
| Syntax/render/diff checks | VIEW | Existing dry-run commands and syntax checks |

No permanent test, source/DOM/count/copy test or fault-injection framework was created.

## DNS: prior blocker closed

Observation timestamp: `date -u '+%Y-%m-%dT%H:%M:%SZ'` → `2026-09-10T03:28:48Z`. `hostname -I` confirms local TEST address `151.241.228.122`.

Each command returned only `151.241.228.122`:

```bash
dig +short +time=2 +tries=1 @1.1.1.1 app.bersoncare.ru A
dig +short +time=2 +tries=1 @8.8.8.8 app.bersoncare.ru A
dig +short +time=2 +tries=1 app.bersoncare.ru A
dig +short +time=2 +tries=1 @172.31.9.1 app.bersoncare.ru A
```

The installed `/etc/dnsmasq.d/awg-test.conf` still names the retired TEST hostname; candidate dry-run renders the new branded name to the VPN gateway. This is pending installation, not a remaining public-DNS blocker. `sudo -n test -s /etc/letsencrypt/live/app.bersoncare.ru/fullchain.pem` returned failure: the exact TEST certificate is not installed.

## F1 — required certificate-validation/rollback gate is incomplete

**Requirement:** brief item 2 requires hostname coverage verification and restoration of previous TEST configuration on every validation/issuance/reload/final-check failure.

**Observed hostname-validation failure.** `apply-test-surface-domains.sh:68` treats the exit status of `openssl x509 -checkhost` as the match result and discards its output. On this host the following read-only command prints `Hostname app.bersoncare.ru does NOT match certificate`, yet reports `exit=0`:

```bash
sudo -n openssl x509 -in /etc/letsencrypt/live/therapysto-test-surfaces/fullchain.pem -noout -checkhost app.bersoncare.ru
result=$?; printf 'openssl checkhost exit=%s\n' "$result"
```

Executing only the candidate's existing validator, without running its installer, also reports `exit=0` for that mismatching certificate:

```bash
source <(sed -n '41p;62,73p' deploy/host/apply-test-surface-domains.sh)
assert_cert_covers /etc/letsencrypt/live/therapysto-test-surfaces app.bersoncare.ru
printf 'candidate assert_cert_covers exit=%s\n' "$?"
```

Thus this gate accepts wrong-host material; it cannot establish the exact-host TLS readiness it claims. This observation does not claim Certbot issued a wrong certificate.

**Reachable failure exits without rollback, established by control-flow inspection.** After installing/enabling the candidate and removing the retired vhost, the script reloads nginx at line 334. Certificate validation at line 344 can call `fatal` (missing/unreadable material, parse/expiry failure), which exits immediately. The sole EXIT trap at lines 265–266 deletes temporary render files; it does not restore nginx. Likewise, a failing final `sudo nginx -T` at line 351 exits under `set -e` before the guarded checker/restore block. The enclosing `deploy-test.sh:143` cleanup does not restore edge configuration either. These paths leave the changed edge installed despite failed validation; on first installation a failure before the final certificate reload leaves the temporary wrong-host TLS configuration serving and the previous TEST vhost removed. They were not induced on the live host.

Explicit nginx validation/reload failures, nonzero Certbot issuance and a nonzero final Node checker do call `restore`; that does not cover the exits above. Restoration itself uses sequential `cp -a`, not the atomic install helper, and suppresses its nginx validation/reload errors. Therefore successful restoration on every required failure cannot be accepted.

## Other bounded checks

- First-install ordering is correct: missing branded certificate uses existing surface material only for bootstrap; the HTTP challenge location is exposed before `certbot certonly --webroot -w /var/www/html --non-interactive --keep-until-expiring --cert-name app.bersoncare.ru -d app.bersoncare.ru`. No issuance was executed.
- Exact edge diff preserves staff/admin, TherapyGo/known-tenant surfaces, existing integrator routing, payment callback paths/allow-list, VPN restrictions and forwarded headers. The branded vhost preserves Host and uses the existing TEST webapp upstream. Changes are confined to TEST edge/split-DNS/settings/docs and deployment wiring; no PROD/Caddy/external website mutation was performed.
- `proxy.ts:208` retains the same `NextResponse.rewrite` and request headers. Only `127.0.0.1`/`localhost` targets switch to HTTP; public/non-loopback targets are untouched. Surface resolution still precedes this change and derives public protocol from forwarded headers. Serialized tenant/surface context passes through the existing rewrite. `patientTreeRewritePath` still projects branded root to the shared clinic-card path or `/app`; no second resolver or page tree was added. This is code-path acceptance, not live rendering acceptance.
- Passed: `bash -n deploy/host/apply-test-surface-domains.sh deploy/host/apply-test-vpn-dns.sh deploy/host/deploy-test.sh`; `node --check deploy/host/webapp-health-host.mjs`; both `bash deploy/host/apply-test-surface-domains.sh --dry-run` and `bash deploy/host/apply-test-vpn-dns.sh --dry-run`; `git diff --check`; `git diff 122e99fe6^ 122e99fe6 --check`; `git diff ee342afc2^ ee342afc2 --check`.
- `sudo -n nginx -t` passed for the **currently installed** configuration. Candidate dry-run proves rendering/forwarded-host checks, not that its future certificate paths are usable. Optional local Next module resolution returned `MODULE_NOT_FOUND`; no dependencies were installed and no runtime claim relies on that attempt. Full CI, product lint/typecheck/build and live UI were not run for this read-only deployment audit.

**Handoff:** correct F1 in the existing installer. Exact TEST certificate issuance, loading the candidate build and a live branded Host request remain future authorized deploy acceptance; this report closes neither that acceptance nor the broader B/C/D checklist. No apply, reload, deployment, migration, DB mutation, provider call or additional Next process occurred. Dry-run temporary files were removed by their existing EXIT traps; the validator observation created no files.
