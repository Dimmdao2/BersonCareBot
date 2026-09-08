# Worker brief — #1100 Jitsi/coturn live-health corrections

You own one coherent repo correction stage based on exact TEST runtime failures. Work only in the supplied clean
clone/branch. Do not touch DEV/TEST/PROD runtime, DNS, TLS files, system packages, databases or running services;
the lead owns the live re-apply after independent audit.

## Authority and rules

Read the heading map and applicable sections of `AGENTS.md` before each action: universal rules, §1 server/deploy,
§7/§9/§10 validation and commit, and §24 worker discipline. Read
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-02..06, `deploy/jitsi/README.md`, `NETWORK_POLICY.md`, `RUNBOOK.md`,
the current compose override and every touched script. Extend the existing package; no second installer or health
path.

## Источник оракула

Owner checklist `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Для двух участников Jitsi сначала устанавливает
прямое P2P-соединение; при невозможности direct ICE использует только собственный coturn, а JVB остаётся
собственным fallback-путём.»

## Exact live evidence from TEST

`install.sh --apply` brought up all five pinned containers. `health-check.sh` proved web loopback and JVB `/about/health`
green, then failed for these reachable reasons:

1. `bcb-jitsi-test-coturn` runs as image user `nobody:nogroup` (UID/GID 65534), while its bind-mounted rendered
   `/etc/coturn/turnserver.conf` is mode 0600 UID/GID 1000 and TLS key is mode 0600 root. Coturn logged
   `Cannot find config file: /etc/coturn/turnserver.conf`, started with defaults, and did not enable TLS/auth. The
   lead immediately stopped the whole stack; never make secret-bearing config world-readable.
2. Running Prosody process is exactly
   `/usr/bin/prosody --config /run/prosody/config/prosody.cfg.lua -F`. Health-check called bare `prosodyctl`, so both
   checks falsely searched `/etc/prosody/prosody.cfg.lua`. With
   `prosodyctl --config /run/prosody/config/prosody.cfg.lua`, `check turn` and `check config` both pass.
3. Generated MUC config is `/run/prosody/config/conf.d/jitsi-meet.cfg.lua` and contains exactly
   `muc_max_occupants = "2"`; health-check incorrectly greps `/config/conf.d/jitsi-meet.cfg.lua`.
4. Host Ubuntu package index has only `coturn`, not the claimed `coturn-utils`; installing it risks starting a second
   host daemon on the same ports. The pinned coturn image already contains the required turnutils binaries. Make
   mandatory STUN/credentialed UDP/TLS allocation checks execute safely through the running pinned container (or
   another equally bounded reuse of that image), without printing secrets or weakening the proof.
5. `stop.sh` loads only `jitsi.test`, while compose interpolation also references `COTURN_IMAGE_TAG` from
   `/opt/env/bersoncarebot/jitsi-coturn.test`; the successful stop emitted an unset-variable warning. Load the same
   coturn env as install/restart/health so stop is clean and deterministic.
6. Initial apply additionally proved `unzip` is a real host prerequisite and the package only discovers it after
   downloading. Add it to fail-closed `--check` prerequisite reporting/documentation; do not install packages from
   the script.

## Required result

- Coturn starts under a least-privilege non-root identity that can read exactly its 0600 rendered config and copied
  TLS key without making secrets world-readable. Prefer aligning the container numeric user with the existing
  deploy-owned rendered files/TLS copy and document the required host ownership; account for writable log/state
  volumes. Do not simply run privileged/root or chmod 0644 unless you prove no safer working option.
- The health script addresses the actual rendered Prosody paths and retains mandatory config/TURN/TLS checks.
- `stop.sh` has the full env context; `install.sh --check` reports a missing `unzip` before mutation.
- Update the existing README/NETWORK_POLICY only where live facts or operator prerequisites changed. Do not rewrite
  unrelated prose or mark runbook scenarios passed.

## Scope and validation

Allowed: `deploy/jitsi/**`, and only if strictly required the existing Jitsi TEST systemd unit. No app code, DB,
tariff/UI/notes/provider changes. Workers do not write/edit/delete tests. Do not add source-string tests. Use static
`bash -n`, shellcheck if already available, `docker compose config` against the existing pinned package without
starting containers, and `git diff --check`; no live server writes or service starts.

Commit all task changes with explicit path staging (never `git add -A`), message containing `#1100`, why, evidence,
stage and what remains. Do not push. Do not finish with a foreground process running. Report exact SHA, changed
paths and checks.
