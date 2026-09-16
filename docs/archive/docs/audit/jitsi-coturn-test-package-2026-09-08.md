# #1100 Jitsi/coturn TEST package — independent audit

**Verdict: FAIL.** Candidate `ed653358fe0bd08fc6f85a1f30596183652c46ee` on
`wt/jitsi-test-infra-20260908`, audited against base `3249e88b5`.

Scope: VM-01..06 and Wave 1 stream C in
[`VIDEO_MEETINGS_JITSI_2026-09.md`](../_TODO/VIDEO_MEETINGS_JITSI_2026-09.md). No TEST, DEV, PROD, DNS, TLS,
firewall, nginx, service or secret-store state was changed.

## Blind kill-set and result

| Protected failure | Result | Evidence |
| --- | --- | --- |
| Foreign Jitsi/8x8/STUN/TURN/telemetry endpoints | FAIL | F1 and F5: the intended client override is not mounted, and health checks only four literal hostnames. |
| Third occupant / duplicate subject | BLOCKED | `MAX_PARTICIPANTS=2` is present, but the candidate cannot reach the required running proof until F1 is fixed. |
| Direct P2P and own TURN/JVB fallback | FAIL | F2: no TURNS endpoint is advertised and TCP relay is disabled. |
| Ephemeral XEP-0215 credentials, compatible UDP/TLS relay | FAIL | F2 and F3. The shared-secret mechanism is configured, but TLS fallback is not viable and its secret reaches process argv. |
| Secure-domain JWT room admission | PASS (static only) | `ENABLE_AUTH=1`, `AUTH_TYPE=jwt`, `JWT_ALLOW_EMPTY=0`, issuer and audience are rendered; room/role/subject/expiry claims remain stream-A/live evidence. |
| No Jibri/Jigasi/recording/transcription/conference UI | FAIL | F1 prevents `custom-config.js` and `custom-interface_config.js` from reaching the web container, so VM-06 cannot be enforced. |
| TEST-only safe apply, idempotency and exact rollback | FAIL | F3/F4; host guard and missing DNS/TLS gate themselves pass. |
| Health/proof cannot report green without required routes/policy | FAIL | F5. |
| Fixed topology, complete port evidence, immutable supply inputs, reproducible runbook | FAIL | F4/F6. DNS/TLS are correctly reported as external prerequisites; the immutable-input and safe-preflight obligations are not met. |

Executed fault mappings: four off-host guard injections were caught (`install`, `health-check`, `restart`,
`rollback` all exited 1 before their body); a missing-DNS/TLS preflight exited 1 before mutation. Rendered
secret-file modes were `0600`, output was redacted, and a second render was byte-identical. Caught: 3
independent classes (host guard, prerequisite gate, render idempotency/mode). Uncaught/failed: 7 classes above;
one live occupancy class is blocked by the executable deployment defect.

## Findings

### F1 — Compose render mounts neither the package config nor a valid upstream CONFIG tree

**Reachable scenario:** after DNS/TLS are supplied, `install.sh --apply` invokes Compose with the downloaded
upstream compose file first. The supplied environment has no `CONFIG`. Compose therefore renders upstream
config volumes as `/web`, `/prosody/config`, `/jicofo`, and `/jvb`; overlay-relative sources resolve against
the upstream release directory, e.g. `.../docker-jitsi-meet/config/web/custom-config.js` and
`.../config/prosody/conf.d/00-turn-external.rendered.cfg.lua`, not `deploy/jitsi/...`.

**Impact:** the generated custom files either fail the bind mount (the source files do not exist in the
download) or are absent from containers. The stack cannot reliably start, and its VM-04/05/06 controls and
XEP-0215 configuration are not applied. This violates VM-01, VM-03--06 and the Wave-1-C deployable-package
requirement.

**Evidence:** local `docker compose config` against upstream `stable-11146-2` rendered the above paths. The
official Jitsi guide requires a configured `CONFIG` tree and places custom web files in `CONFIG/web/`.
The candidate command is `install.sh:109-113`; the missing variable is in `env/jitsi-test.env.example`.

### F2 — The claimed TURN-over-TLS fallback is not advertised and coturn disables TCP relay

**Reachable scenario:** direct UDP ICE fails. The only XEP-0215 advertisement emitted by
`00-turn-external.cfg.lua.template:18-24` is `turn_external_port = 3478`; the comment asserts a client will
discover TLS on 5349 without receiving a TURNS URI. The coturn template simultaneously sets `no-tcp-relay`
at line 43.

**Impact:** a UDP-restricted browser has no advertised `turns:...:5349` candidate and TCP relay endpoints are
forbidden, so the required TLS fallback cannot complete. This violates VM-03/VM-04 and the runtime contract's
UDP plus TLS fallback.

**Evidence:** Prosody's official configuration documents the advertised host, port and shared secret only;
coturn documents `no-tcp-relay` as disallowing TCP relay endpoints. The candidate's required runbook scenario
4 therefore has no working configured path.

### F3 — Rendering copies real secrets into process argv

**Reachable scenario:** every apply/restart runs `render-secrets.sh`. Lines 44-47 and 53-57 interpolate each
generated password/shared secret into a `sed -e` argument.

**Impact:** a same-host process able to inspect command lines while `sed` runs can read an internal XMPP password
or TURN shared secret. This violates the brief's no-secret-in-argv/log/generated-mode requirement and the
plan's no credential leak contract.

**Evidence:** the local isolated render did keep files at `0600` and logs redacted, but that does not remove the
separate argv exposure in the executed `sed` process.

### F4 — Apply has no port-collision preflight and rollback is not an exact restore

**Reachable scenario:** any documented host port is already occupied. Before `docker compose up`,
`install.sh` fetches the vendor tree and renders secrets/config; it has no `ss`/socket or Compose merge
preflight. A bind failure can leave a partially-created project after those mutations. `rollback.sh` only
does `docker compose down`; ordinary rollback deliberately retains vendor files, volumes and rendered
configuration, and neither mode restores a prior nginx/vhost/config state.

**Impact:** apply can mutate before detecting a required port condition and cannot restore the exact reviewed
pre-apply state. This violates the safe TEST apply/rollback requirement in Wave 1 C and the rollout contract
in plan §6.5.

### F5 — `health-check.sh` can be green without validating the protected runtime behavior

**Reachable scenario:** JVB is running but unhealthy, a required TURN allocation is unavailable on a host
without `turnutils_stunclient`, or an undeclared foreign endpoint is configured. The script accepts merely
`State.Running`, skips TURN probing if the host utility is absent, and searches only four known literal hostnames
in source templates rather than rendered config or observed browser traffic.

**Impact:** it emits `RESULT: PASS` while JVB/TURN/no-third-party policy is absent. This violates the health/proof
requirement and VM-03/VM-04.

**Evidence:** `health-check.sh:19-89`; its own live capture is only a manual runbook command and cannot make the
health command's PASS claim true.

### F6 — Images and upstream source are mutable despite the claimed pinning

**Reachable scenario:** `stable-11146-2` or `4.17.2-r0-debian` is republished or a release archive changes.
`VERSIONS.md` records tags only; the compose output uses tags, and `install.sh:92-99` downloads/unzips the
archive without a digest or checksum verification despite README's contrary claim.

**Impact:** a later apply can run unreviewed code/config while reporting the same version label. This violates
the brief's immutable versions/images requirement and makes the runbook non-reproducible.

## Checks run

```text
bash -n deploy/jitsi/bin/*.sh
node --check deploy/jitsi/config/web/custom-config.js
node --check deploy/jitsi/config/web/custom-interface_config.js
git diff --check 3249e88b5..ed653358f
bash deploy/jitsi/bin/check-latest-jitsi-tag.sh
```

All passed. A temporary off-host `hostname -I` fault made `install.sh`, `health-check.sh`, `restart.sh`, and
`rollback.sh` fail closed. A temporary non-secret env made `install.sh --check` reject missing
`meet.test.bersoncare.ru`, `turn.test.bersoncare.ru`, and coturn TLS material before mutation. The local
upstream merge-render was intentionally isolated under `/tmp` and started no containers.

Official protocol references: [Jitsi Docker guide](https://jitsi.github.io/handbook/docs/devops-guide/docker/),
[Prosody TURN/XEP-0215 guide](https://prosody.im/doc/turn), and
[coturn TURN REST and relay reference](https://github.com/coturn/coturn/wiki/turnserver).
