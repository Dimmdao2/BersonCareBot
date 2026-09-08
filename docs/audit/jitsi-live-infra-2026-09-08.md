# Jitsi/coturn TEST infra — live auditor-live pass (#1100 stream C)

Candidate branch: `wt/jitsi-live-fix-20260908`, exact SHA `7061cc94a31ec7f6987d6575e632f2585657d58a`.
Base before this correction: `29a4894c3`. Authority: owner scope #1100, VM-01..06 / ACC-06 / §4 / §6.5,8,9 of
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, plus `deploy/jitsi/README.md`, `NETWORK_POLICY.md`, `RUNBOOK.md`.
Host: `151.241.228.122` (confirmed via `hostname -I` before any server command). This pass audits only
`29a4894c3..7061cc94a` and the resulting TEST runtime; no product code was modified.

## Verdict: MUST FIX

`bin/health-check.sh` — the script this candidate's own README and the brief both name as the PASS gate for
"stack is configured and individually-functional" — deterministically returns `RESULT: FAIL` due to two
independent, reproducible defects inside the candidate diff itself (not flakiness, not a missing external
prerequisite). A third, lower-severity defect was found in the new `apply-nginx.sh`. Everything else audited
(coturn non-root identity/permissions, TLS lifecycle, nginx vhost apply, listener/container teardown) is
correct and evidence is recorded below.

## Bounded temp package

`mktemp -d` → `/tmp/bcb-jitsi-audit-c3WDH2`; `git archive -o <tmp>.tar 7061cc94a deploy/jitsi`, extracted into
it, `sudo chown -R deploy:deploy` + `chmod 750`. All `install.sh`/`health-check.sh`/`restart.sh`/`stop.sh`/
`apply-nginx.sh` runs below used this exact tree via `sudo -u deploy bash <tmp>/deploy/jitsi/bin/<script>`
(root-only scripts via plain `sudo`). Removed at the end of this pass (`sudo rm -rf <tmp> <tmp>.tar`); nothing
from it was copied elsewhere.

## 1. Static

- `bash -n` on all 10 scripts under `deploy/jitsi/bin/*.sh`: all OK.
- `git diff --check 29a4894c3..7061cc94a`: clean, no output.
- Diff read in full (`git diff --stat`/per-file): `.gitignore`, `NETWORK_POLICY.md`, `README.md`,
  `bin/apply-nginx.sh` (new), `bin/health-check.sh`, `bin/install.sh`, `bin/restart.sh`, `bin/rollback.sh`,
  `bin/stop.sh`, `bin/sync-coturn-tls.sh` (new), `docker-compose.override.test.yml`,
  `env/coturn-test.env.example`, `nginx/meet-test.vhost.template.conf`.
- Ownership/user: `docker-compose.override.test.yml` sets `user: "${COTURN_CONTAINER_UID:-1000}:${COTURN_CONTAINER_GID:-1000}"`
  on the coturn service and bind-mounts `${CONFIG}/coturn/tls:/etc/coturn/tls:ro` (private deploy-owned copy,
  never the root-owned ACME source) plus deploy-owned `./coturn/{log,state}` for writable paths — matches the
  authority's non-root/private-config requirement.
- `install.sh` fail-closed identity/port/config checks: added `COTURN_CONTAINER_UID`/`GID` requirement, a check
  that the caller's real UID:GID matches them, and mode/owner assertions (`0700`/`0600`, exact UID:GID) on the
  staged TLS dir/files before `--apply` proceeds — confirmed live in §3 below.
- `sync-coturn-tls.sh`/`apply-nginx.sh` atomicity: both render to a `mktemp` file/dir and `mv`/`install` into
  place, both restore-or-fail on validation error (`apply-nginx.sh` backs up the previous vhost and restores +
  reloads nginx on `nginx -t`/reload failure; none of that path was exercised live since no previous vhost
  existed, but the restore branch was read and is structurally correct: same `install`/`ln -sfn` idiom guarded
  by the same `nginx -t` gate as the apply branch).
- No script prints an env value, secret, or key: grepped the diff for `echo "\$` / `cat .*secret` / `printf`
  patterns against secret-named vars — none found; `render-secrets.sh` (unchanged this pass) already uses
  argv-safe substitution per README.

## 2. `sync-coturn-tls.sh` against the live `bcb-jitsi-test` ACME lineage

```
sudo bash <tmp>/deploy/jitsi/bin/sync-coturn-tls.sh
→ [jitsi-test-tls] staged certificate; coturn is not running
```

Evidence (modes/owners/SAN only, no content):

```
sudo stat -c '%a %U:%G %n' /etc/bersoncarebot/jitsi-test/config/coturn/tls            → 700 deploy:deploy
sudo stat -c '%a %U:%G %n' .../coturn/tls/fullchain.pem                               → 600 deploy:deploy
sudo stat -c '%a %U:%G %n' .../coturn/tls/privkey.pem                                 → 600 deploy:deploy
sudo openssl x509 -in .../coturn/tls/fullchain.pem -noout -ext subjectAltName
  → DNS:meet.test.bersoncare.ru, DNS:turn.test.bersoncare.ru
sudo openssl x509 -in /etc/letsencrypt/live/bcb-jitsi-test/fullchain.pem -noout -dates
  → notBefore=Sep 8 07:46:10 2026 GMT, notAfter=Dec 7 07:46:09 2026 GMT
```

PASS: destination `0700`, files `0600`, owner is TEST deploy UID/GID (`deploy:deploy` = `1000:1000`),
certificate SAN covers both TEST names, not expired.

## 3. `install.sh --check` / `--apply` as `deploy`

```
sudo -u deploy bash <tmp>/deploy/jitsi/bin/install.sh --check
→ all prerequisites present; --check complete, no changes made   (exit 0)

sudo -u deploy bash <tmp>/deploy/jitsi/bin/install.sh --apply
→ fetched pinned release stable-11146-2, preflight merged-compose validation, CONFIG tree created,
  coturn log/state dirs created 0700 deploy:deploy, secrets+templates rendered (no value printed),
  final merged-compose validated, stack brought up: coturn/prosody/jicofo/jvb/web all Created+Started
  (exit 0)
```

Both ran to completion in the foreground; no failure, no `stop.sh` needed for this step.

## 4. `health-check.sh` as `deploy` — FAIL, two independent root-caused defects

```
sudo -u deploy bash <tmp>/deploy/jitsi/bin/health-check.sh
→ RESULT: FAIL   (exit 1), reproduced identically after bin/restart.sh + a second full stop→apply→health cycle
```

All PASS lines: web/prosody/jicofo/jvb/coturn containers running; web answers on `127.0.0.1:8000`; JVB
`/about/health` → 200; `turn_external` override file and `turn_external_tls_port` present in the running
Prosody container; `prosodyctl check config` passes; rendered MUC config carries `muc_max_occupants = "2"`;
coturn answers STUN on `127.0.0.1:3478`; no-foreign-endpoint scan clean.

FAIL lines and root cause for each:

**F-A. `run_turn_allocation` (both UDP and TLS credentialed TURN allocation checks) never actually invokes
`turnutils_uclient` — `deploy/jitsi/bin/health-check.sh`.** The helper runs `docker exec ... sh -ceu '...'`
against the coturn image; that image's `/bin/sh` is `dash` (confirmed: `readlink -f /bin/sh` →
`/usr/bin/dash`), and the inline script uses the bash-only `[[ -n "$turn_secret" ]]` test. Reproduced the
exact invocation standalone:

```
docker exec --user 1000:1000 bcb-jitsi-test-coturn sh -ceu '... [[ -n "$turn_secret" ]] ...' sh 3478 udp
→ sh: 8: [[: not found                                          (exit 127, script aborts on set -e)
```

coturn's own TURN log line count was identical before and after this invocation (62/62) — `turnutils_uclient`
is never reached, so the "shared secret mismatch or ALLOCATE failure" message the script prints is always
false; the check cannot distinguish a working coturn from a broken one. Independently confirmed the real
credentialed allocation **does** work when the same secret-extraction logic is rewritten with a POSIX
`[ -n ... ]` test instead of `[[ ]]`: a manual `turnutils_uclient -y -n 1 -u healthcheck -W <secret> -p 3478
127.0.0.1` from the same non-root exec context returned exit 0 with a completed send/receive round trip.
**Impact:** the mandatory "credentialed TURN allocation over UDP and over TLS" gate in the authority's health
requirement can never report a true PASS as committed, and (same defect, opposite direction) could equally
hide a real allocation failure behind the same generic message — the check has no signal either way. Violates
the explicit runbook/brief requirement that `health-check.sh` prove "credentialed TURN allocation over UDP and
over TLS".

**F-B. `prosodyctl check turn` cannot reach coturn from the Prosody container due to Docker hairpin-NAT
asymmetry between the bridge network and `coturn`'s `network_mode: host` binding on the host's public IP —
topology introduced/kept by `docker-compose.override.test.yml`.** `/tmp/jitsi-test-prosodyctl-turn.log`:
`Error: No STUN response: timeout` against `turn.test.bersoncare.ru:3478` (resolves correctly to
`151.241.228.122` from inside the Prosody container — confirmed via `getent hosts`). Root-caused live:

```
# unconnected UDP STUN request from Prosody's own network namespace, correct STUN wire format
docker run --rm --network container:bcb-jitsi-test-prosody-1 python:3-alpine python3 -c '...'
→ connected-recv ERR: timed out
→ UNCONNECTED GOT 40 bytes from ('172.20.0.1', 3478)      # NOT 151.241.228.122:3478
```

The reply to a container-originated packet addressed to the host's own public IP comes back from the bridge
gateway address (`172.20.0.1`, the `meet.jitsi` network's own gateway), not from `151.241.228.122` — classic
Docker hairpin-NAT source-address rewrite. An **unconnected** UDP socket accepts this fine (proved above, and
matches the raw `turnutils_stunclient` probe from the same netns which also succeeded). `prosodyctl check
turn`'s Lua STUN client (`util/prosodyctl/check.lua`) uses a **connected** UDP socket
(`sock:setpeername(host, port)`), which the kernel filters strictly by the connected 5-tuple and silently
drops the mismatched-source reply, producing the observed timeout deterministically. **Impact:** this is a
structural property of the current topology (bridge-network Prosody vs. host-network coturn addressed by
public IP), not a flaky timing issue — reproduced identically on a fresh `restart.sh` and container recreate.
It does not affect real browser clients (they reach coturn directly, never through this container's netns),
but it does mean the authority-mandated "exact Prosody config/turn checks" in `health-check.sh` cannot pass as
currently wired, and an operator would misdiagnose it as a secret/config problem rather than a NAT topology
one — the message text ("failed — see log") does not point at the actual cause.

**F-C (lower severity, secondary).** `apply-nginx.sh --check` fails with the misleading message `FATAL:
missing bcb-jitsi-test certificate` when run as a non-root user (e.g. `deploy`), even though the certificate
exists — `/etc/letsencrypt/live` is `0700 root:root`, so any non-root caller cannot traverse into it to stat
the cert files. `--check` has no root requirement in the script (only `--apply` enforces `id -u == 0`), so a
caller following the script's own usage contract for a "no host file changed" dry run gets a wrong-cause error
in name (it says "missing", the real cause is "unreadable by this user, run as root"). Confirmed: identical
`--check` invocation as root passes cleanly (`sudo bash .../apply-nginx.sh --check` →
"prerequisites and rendered vhost are valid"). Does not block the audited pass since the brief's step 6 already
specifies running `apply-nginx.sh --apply` as root, and `--apply` itself is correct end-to-end (§6 below).

## 5. Live coturn inspection

```
docker exec bcb-jitsi-test-coturn id                               → uid=1000 gid=1000 groups=1000
sudo stat -c '%a %U:%G %n' .../coturn/tls/privkey.pem               → 600 deploy:deploy (no group/world read)
sudo stat -c '%a %U:%G %n' <tmp>/deploy/jitsi/coturn/turnserver.rendered.conf → 600 deploy:deploy
sudo ss -ulnp | grep -E ':(3478|5349|49[12][0-9][0-9])'             → turnserver only, expected ports
sudo ss -tlnp | grep -E ':(3478|5349)'                              → turnserver only, expected ports
grep -iE "error|fail|denied|reject" turnserver.log (excluding known benign warnings) → no matches
```

Non-root numeric UID/GID confirmed live (not just in the compose file); private config/key readable only by
that UID, no group/world bits; listeners match exactly the ports `NETWORK_POLICY.md` documents (3478 udp+tcp,
5349 tcp, narrow relay range `49152-49252` observed as active allocations); no auth/TLS/config failures in the
coturn log across two full container lifecycles.

## 6. nginx vhost apply

```
sudo bash <tmp>/deploy/jitsi/bin/apply-nginx.sh --apply
→ nginx -t: syntax ok, test successful; applied + reloaded                              (exit 0)

curl -s -o /dev/null -w '%{http_code}' --resolve meet.test.bersoncare.ru:443:127.0.0.1 https://meet.test.bersoncare.ru/
→ 200                                                    (no -k: default trust store accepted the cert)
openssl s_client -connect 127.0.0.1:443 -servername meet.test.bersoncare.ru | openssl x509 -noout -subject -issuer
→ subject=CN=meet.test.bersoncare.ru, issuer=Let's Encrypt YE1
curl -s --resolve meet.test.bersoncare.ru:443:127.0.0.1 https://meet.test.bersoncare.ru/ | head
→ actual Jitsi web app HTML (not a stub/default nginx page)
```

PASS: `nginx -t` clean, reload succeeded, HTTPS served the real Jitsi web content through the loopback
upstream with a browser-trusted Let's Encrypt certificate for the expected host. IP allowlist directives
present and unchanged from the template (VPN-trusted subnets + `151.241.228.122` loopback-equivalent + `127.0.0.1`).

## 7. Restart / stop / final state

```
sudo -u deploy bash <tmp>/deploy/jitsi/bin/restart.sh    → all 5 containers recreated+started (exit 0)
sudo -u deploy bash <tmp>/deploy/jitsi/bin/health-check.sh → RESULT: FAIL, identical F-A/F-B (exit 1)
sudo -u deploy bash <tmp>/deploy/jitsi/bin/stop.sh        → all containers + project network removed (exit 0)
docker ps -a --filter name=bcb-jitsi-test                → empty
sudo ss -ulnp | grep -E ':(3478|5349)'                    → no match
sudo ss -tlnp | grep -E ':(3478|5349|8000|8080|4443)'     → no match
docker network ls | grep bcb-jitsi-test                   → no match
```

Per brief: on FAIL, stop the whole candidate stack and restore/remove only the candidate nginx target (no
third apply→health cycle was run — F-A/F-B are deterministic, reproduced twice, and adding a third identical
run would not change the evidence). Nginx target had no pre-existing version, so it was removed:

```
sudo rm -f /etc/nginx/sites-{available,enabled}/meet.test.bersoncare.ru
sudo nginx -t && sudo systemctl reload nginx                → syntax ok, reload succeeded
```

Bounded temp package removed: `sudo rm -rf /tmp/bcb-jitsi-audit-c3WDH2 /tmp/bcb-jitsi-audit-c3WDH2.tar`.

## Final live state

Candidate stack fully stopped: no `bcb-jitsi-test*` containers, no project network, no listeners on
3478/5349/8000/8080/4443/10000. Candidate nginx vhost removed, host nginx otherwise untouched and reloaded
clean. The private coturn TLS copy staged in §2 (`/etc/bersoncarebot/jitsi-test/config/coturn/tls`, `0700`/
`0600`, `deploy:deploy`) and the CONFIG tree under `/etc/bersoncarebot/jitsi-test/config` from `install.sh
--apply` were left in place (not purged) — the brief scopes cleanup to "the candidate nginx target", not a
full `rollback.sh`, and this staged material is inert with the stack stopped. No DB, webapp, firewall, DNS, or
PROD action was taken.

## What remains for integrated browser acceptance

Unchanged from the package's own framing (`README.md` "Status and what remains", `RUNBOOK.md`): the two-browser
call, third-seat refusal, forced-TURN/ICE-fallback and no-foreign-endpoint capture scenarios are the lead's
later acceptance stage and were correctly out of scope for this pass. They cannot proceed until F-A/F-B are
fixed and `health-check.sh` returns a true `RESULT: PASS`, since a health PASS is the stated prerequisite for
`RUNBOOK.md`'s scenarios and this pass could not reach that state.

## Fix guidance (not applied — audit does not edit product code)

- F-A: replace `[[ -n "$turn_secret" ]]` with the POSIX `[ -n "$turn_secret" ]` (or add `#!/bin/bash` and
  `docker exec ... bash -ceu` if bash is available in the image — it is not confirmed present, so the POSIX
  form is the safer fix) inside `run_turn_allocation` in `bin/health-check.sh`.
- F-B: either point `prosodyctl check turn` at an address reachable without hairpin NAT (e.g. run the check
  from the host/coturn's own netns instead of Prosody's bridge-network container), or replace this specific
  sub-check with the same non-root `docker exec` + `turnutils_stunclient`/`turnutils_uclient` approach already
  used for the mandatory coturn probes lower in the same script, which does not depend on a connected socket.
- F-C: have `apply-nginx.sh --check`'s certificate check either require root up front (matching `--apply`) or
  test-and-report the actual cause (`[[ -r ... ]]` failing vs. file truly absent) instead of one generic
  "missing" message for both.

## Lead correction acceptance — PASS on `86f08711a`

The original audit above remains the historical one-pass finding record. The lead accepted the corrections against
the same kill-set without starting a second blind pass, as required by `AGENTS.md` §24.5–§24.6. Exact correction
commits after the audited candidate:

- `5afb3ef87`: replaced the non-POSIX inline test and made root ownership explicit for nginx checking;
- `6663bf704`: gave the Jitsi bridge a fixed configurable subnet/gateway and mapped the Prosody TURN hostname to
  that gateway, eliminating the connected-UDP hairpin source mismatch; added bounded container readiness;
- `727591204`: replaced quota-leaking `turnutils_uclient -y` probes with a real temporary public-address peer and
  normal client completion, so credentialed allocations are repeatable without restarting coturn;
- `33105c169`: corrected docker-jitsi-meet's host:port STUN env shape, stopped custom config from overwriting the
  upstream `p2p.stunServers`, and made install reject scheme-prefixed values;
- `86f08711a`: health now evaluates the actual served `/config.js` and proves its browser-visible STUN URL instead
  of looking for a generated file at a path the web image does not use.

Host identity before every live action remained `151.241.228.122`. The exact candidate was exported with
`git archive 86f08711a` to `/tmp/bcb-jitsi-candidate-86f08711a`, owned by `deploy`, then applied with:

```text
sudo bash /tmp/bcb-jitsi-candidate-86f08711a/deploy/jitsi/bin/sync-coturn-tls.sh
sudo -u deploy bash /tmp/bcb-jitsi-candidate-86f08711a/deploy/jitsi/bin/install.sh --apply
```

The final bounded gate ran first health, `restart.sh`, then second health from that exact candidate and persisted the
three exit codes independently:

```text
cat /tmp/jitsi-gate-86f08711a.status
→ first=0 restart=0 second=0
```

Both health outputs ended `RESULT: PASS`. Each pass proved all five containers running, coturn Docker health,
loopback web response, JVB `/about/health` 200, Prosody `check turn` and `check config`, rendered two-person MUC cap,
credentialed ephemeral TURN allocation over UDP 3478 and TLS 5349, the evaluated served P2P STUN URL exactly
`stun:turn.test.bersoncare.ru:3478`, and no known foreign endpoint in static, merged, or served runtime config.

The nginx gate then passed and was applied from the same candidate:

```text
sudo bash /tmp/bcb-jitsi-candidate-86f08711a/deploy/jitsi/bin/apply-nginx.sh --check
→ prerequisites and rendered vhost are valid; no host file changed
sudo bash /tmp/bcb-jitsi-candidate-86f08711a/deploy/jitsi/bin/apply-nginx.sh --apply
→ nginx -t successful; vhost applied and nginx reloaded
curl --noproxy '*' --resolve meet.test.bersoncare.ru:443:127.0.0.1 https://meet.test.bersoncare.ru/
→ HTTP 200
```

`openssl s_client -connect 127.0.0.1:443 -servername meet.test.bersoncare.ru` returned the Let's Encrypt lineage with
SANs `meet.test.bersoncare.ru` and `turn.test.bersoncare.ru`; evaluating HTTPS `/config.js` returned
`[{"urls":"stun:turn.test.bersoncare.ru:3478"}]`. An earlier `curl --resolve` without `--noproxy '*'` reached the
configured outbound HTTPS proxy and saw its unrelated certificate; direct loopback SNI proved the host vhost itself
is correct.

**Final correction verdict: PASS TO LAND.** The stack and TEST nginx vhost are left running at the exact accepted
candidate pending integration landing/final documented TEST installation. Browser-to-browser call, third-seat
refusal and ICE selected-pair observations remain separate application/runtime acceptance; this gate does not claim
them.
