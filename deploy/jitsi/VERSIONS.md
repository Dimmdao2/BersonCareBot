# Jitsi/coturn TEST package — pinned versions

Plan: [`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`](../../docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md) (#1100),
stream C. Verified directly against upstream release metadata on 2026-09-08 — commands below reproduce the
same lookup instead of trusting this table blindly.

| Component | Image / source | Pinned ref | Verified via |
| --- | --- | --- | --- |
| Jitsi Meet stack (web, prosody, jicofo, jvb) | `ghcr.io/jitsi/{web,prosody,jicofo,jvb}` from the `jitsi/docker-jitsi-meet` release zip | `stable-11146-2` | `GET https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest` → `tag_name` |
| coturn | `coturn/coturn` (Docker Hub official image) | `4.17.2-r0-debian` | `GET https://hub.docker.com/v2/repositories/coturn/coturn/tags?name=debian&ordering=last_updated` |

No `:latest`, no `edge-*` tag, no floating major tag (`4-debian`, `4.17-debian`) is used anywhere in this
package — every compose file and script below pins the exact tag from this table. `edge-*` coturn tags are
continuous builds from `master` with no release process behind them and are excluded on purpose.

## Re-verifying or bumping the pin

Never hand-edit the tag in compose files without re-running these checks; a stale pin silently drifts from
what was audited.

```bash
# Jitsi: confirm the pinned tag still exists and see what is newer
bash deploy/jitsi/bin/check-latest-jitsi-tag.sh

# coturn: list current numbered (non-edge) Debian-based tags
curl -fsS 'https://hub.docker.com/v2/repositories/coturn/coturn/tags?page_size=25&name=debian&ordering=last_updated' \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0));for(const t of r.results){if(!t.name.includes("edge"))console.log(t.name,t.tag_last_pushed)}'
```

Bumping the pin is a deliberate change: update this file, `deploy/jitsi/env/jitsi-test.env.example`
(`JITSI_RELEASE_TAG`), `deploy/jitsi/env/coturn-test.env.example` (`COTURN_IMAGE_TAG`), re-run
`deploy/jitsi/bin/install.sh --check` on TEST, and re-run the full runbook before treating the new pin as
accepted. A version bump is not covered by the one-pass evidence this branch carries at landing time.

## Why these two projects and not alternatives

Decision already made by the owner plan and `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`: self-hosted
Jitsi Meet (not JaaS/meet.jit.si/8x8), own coturn (not a third-party TURN SaaS). `docker-jitsi-meet` is
upstream's own officially maintained Docker packaging (`jitsi/docker-jitsi-meet`, GHCR images built and
published by the Jitsi project itself) — it is the smallest officially supported topology that still gives us
web + Prosody + Jicofo + JVB as separate, independently restartable containers, which the health/rollback and
network-isolation requirements below need. `coturn` is the reference TURN/STUN server the Jitsi project's own
`turn.md` documentation and Prosody's core `mod_turn_external` docs are written against.
