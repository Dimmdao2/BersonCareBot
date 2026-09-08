# Jitsi/coturn TEST package — pinned versions

Plan: [`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`](../../docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md) (#1100),
stream C. Verified directly against upstream release metadata on 2026-09-08 — commands below reproduce the
same lookup instead of trusting this table blindly.

| Component | Image / source | Pinned ref | Pinned digest (immutable) | Verified via |
| --- | --- | --- | --- | --- |
| Jitsi web | `ghcr.io/jitsi/web` from the `jitsi/docker-jitsi-meet` release zip | `stable-11146-2` | `sha256:4231d5ff7318ff71d12ffd41afc36adae3c319b40cf79cde39b009b0c68295dc` | `GET https://ghcr.io/v2/jitsi/web/manifests/stable-11146-2` (bearer token from `ghcr.io/token`) |
| Jitsi prosody | `ghcr.io/jitsi/prosody` | `stable-11146-2` | `sha256:9e341b10134d947e49ca338b9efe8d70ac9d6e8d89d621da2246dfa79fe50363` | same as above, repo `jitsi/prosody` |
| Jitsi jicofo | `ghcr.io/jitsi/jicofo` | `stable-11146-2` | `sha256:a8d64e46eaa340751a2b5530a4abd4175adf05bff07e9775fc48daae6364cfe9` | same as above, repo `jitsi/jicofo` |
| Jitsi jvb | `ghcr.io/jitsi/jvb` | `stable-11146-2` | `sha256:d7dc646d21af07530ae6acf1ace23ea4782445d0362004621a32a5a632a964e9` | same as above, repo `jitsi/jvb` |
| coturn | `coturn/coturn` (Docker Hub official image) | `4.17.2-r0-debian` | `sha256:aa68aab64a3b929d57fc2924c98ea447bf996cf8dade2508e7b71eaf23f1f14e` | `GET https://registry-1.docker.io/v2/coturn/coturn/manifests/4.17.2-r0-debian` (bearer token from `auth.docker.io`) |
| `docker-jitsi-meet` source archive | `https://github.com/jitsi/docker-jitsi-meet/archive/refs/tags/stable-11146-2.zip` | — | SHA-256 `0dc7f144a68a6272d68dd987718d16af62818ca3488e442241348eb7d1eb17a7` | downloaded and hashed directly at pin time; re-verified by `bin/install.sh --apply` before every unzip (`ARCHIVE_SHA256` in `env/jitsi-test.env.example`) |

Every image runs by digest (`docker-compose.override.test.yml`, `image: repo:tag@sha256:...`), not by tag
alone — the tag is kept alongside the digest only for human readability and because `JITSI_RELEASE_TAG`
still drives which vendored source archive `bin/install.sh` downloads. No `:latest`, no `edge-*` tag, no
floating major tag (`4-debian`, `4.17-debian`) is used anywhere in this package. `edge-*` coturn tags are
continuous builds from `master` with no release process behind them and are excluded on purpose.

## Re-verifying or bumping the pin

Never hand-edit a tag or digest in compose files without re-running these checks; a stale pin silently
drifts from what was audited.

```bash
# Confirms the pinned tag still exists, reports newer upstream releases, and — the digest-drift check —
# re-fetches the *live* digest for the currently pinned tag from GHCR/Docker Hub and fails if it no longer
# matches what docker-compose.override.test.yml pins (a tag getting re-published/moved after this table was
# written).
bash deploy/jitsi/bin/check-latest-jitsi-tag.sh
```

Bumping the pin is a deliberate change, and every one of these six things must move together or
`bin/install.sh`/`bin/check-latest-jitsi-tag.sh` will reject the drift:

1. This file's table (tag + all five digests + archive SHA-256).
2. `deploy/jitsi/docker-compose.override.test.yml` (`image:` digests for web/prosody/jicofo/jvb/coturn).
3. `deploy/jitsi/env/jitsi-test.env.example` (`JITSI_RELEASE_TAG`, `ARCHIVE_SHA256`).
4. `deploy/jitsi/env/coturn-test.env.example` (`COTURN_IMAGE_TAG`).
5. Re-run `deploy/jitsi/bin/check-latest-jitsi-tag.sh` — must report no drift for every component.
6. Re-run `deploy/jitsi/bin/install.sh --check` on TEST and the full runbook before treating the new pin as
   accepted. A version bump is not covered by the one-pass evidence this branch carries at landing time.

## Why these two projects and not alternatives

Decision already made by the owner plan and `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`: self-hosted
Jitsi Meet (not JaaS/meet.jit.si/8x8), own coturn (not a third-party TURN SaaS). `docker-jitsi-meet` is
upstream's own officially maintained Docker packaging (`jitsi/docker-jitsi-meet`, GHCR images built and
published by the Jitsi project itself) — it is the smallest officially supported topology that still gives us
web + Prosody + Jicofo + JVB as separate, independently restartable containers, which the health/rollback and
network-isolation requirements below need. `coturn` is the reference TURN/STUN server for the pinned upstream
Prosody global `external_services` / XEP-0215 TURN REST mechanism.
