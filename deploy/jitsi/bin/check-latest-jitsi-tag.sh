#!/usr/bin/env bash
# Read-only: compares the pinned tag in env/jitsi-test.env.example against upstream's actual latest release,
# AND re-verifies that the image digests pinned in docker-compose.override.test.yml still match what the
# registries report for the currently-pinned tag right now. A mismatch there means the tag was
# re-published/moved since VERSIONS.md recorded it — exactly the drift VERSIONS.md's "Bumping the pin"
# section says to re-run this check for. Does not change anything and does not touch any host — safe to
# run from anywhere with internet access. Deliberately does NOT source bin/lib/profile.sh: it never touches
# a host, and both deployment profiles must carry the exact same pin.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

pin_of() { grep -E "^$2=" "$HERE/env/$1" | cut -d= -f2; }

PINNED="$(pin_of jitsi-test.env.example JITSI_RELEASE_TAG)"
ARCHIVE_SHA="$(pin_of jitsi-test.env.example ARCHIVE_SHA256)"
COTURN_TAG="$(pin_of coturn-test.env.example COTURN_IMAGE_TAG)"

# The package now ships one env template per profile. Both templates must pin the same upstream release,
# archive hash and coturn image — the image digests in docker-compose.override.test.yml are shared by both
# profiles, so a divergent pin in one template would run unverified images on that host.
echo "[pin agreement between the test and prod env templates]"
for pair in "jitsi:JITSI_RELEASE_TAG:$PINNED" "jitsi:ARCHIVE_SHA256:$ARCHIVE_SHA" "coturn:COTURN_IMAGE_TAG:$COTURN_TAG"; do
  family="${pair%%:*}"; rest="${pair#*:}"; key="${rest%%:*}"; expected="${rest#*:}"
  actual="$(pin_of "${family}-prod.env.example" "$key" || true)"
  if [[ "$actual" != "$expected" ]]; then
    echo "  DRIFT env/${family}-prod.env.example pins $key='$actual', env/${family}-test.env.example pins '$expected' — the two profiles must share one pin"
    fail=1
  else
    echo "  ok    $key agrees across both env templates"
  fi
done

echo
echo "pinned tag (this package):  $PINNED"

latest_json="$(curl -fsS https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest)"
latest_tag="$(printf '%s' "$latest_json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
echo "upstream latest release:    $latest_tag"

if [[ "$PINNED" == "$latest_tag" ]]; then
  echo "RESULT: up to date"
else
  echo "RESULT: newer release available ($latest_tag) — see VERSIONS.md 'Bumping the pin' before adopting it"
fi

echo
echo "[digest drift check — does the pinned tag still resolve to the digest recorded in this package?]"

recorded_digest_of() {
  # Pulls the sha256 this package currently pins for a given image reference (matched by its repo path, not
  # by proximity to a YAML key — comments between the service name and its `image:` line make positional
  # matching unreliable) out of the override file, so this script and the actual running config can never
  # silently disagree about what "recorded" means.
  local image_repo="$1"
  grep -E "image: .*${image_repo}:" "$HERE/docker-compose.override.test.yml" \
    | grep -oE 'sha256:[0-9a-f]{64}' | head -1
}

ghcr_digest_of() {
  local component="$1" tag="$2"
  local token
  token="$(curl -fsS "https://ghcr.io/token?service=ghcr.io&scope=repository:jitsi/${component}:pull" \
    | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
  curl -fsS \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
    -D - -o /dev/null \
    "https://ghcr.io/v2/jitsi/${component}/manifests/${tag}" 2>/dev/null \
    | grep -i '^docker-content-digest' | tr -d '\r' | cut -d' ' -f2
}

dockerhub_digest_of() {
  local repo="$1" tag="$2"
  local token
  token="$(curl -fsS "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" \
    | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
  curl -fsS \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
    -D - -o /dev/null \
    "https://registry-1.docker.io/v2/${repo}/manifests/${tag}" 2>/dev/null \
    | grep -i '^docker-content-digest' | tr -d '\r' | cut -d' ' -f2
}

for component in web prosody jicofo jvb; do
  recorded="$(recorded_digest_of "jitsi/${component}")"
  live="$(ghcr_digest_of "$component" "$PINNED")"
  if [[ -z "$live" ]]; then
    echo "  WARN  could not fetch live digest for ghcr.io/jitsi/${component}:${PINNED} (network/registry issue) — not treated as drift"
  elif [[ "$live" != "$recorded" ]]; then
    echo "  DRIFT ghcr.io/jitsi/${component}:${PINNED} now resolves to $live, this package still pins $recorded — re-verify before treating the tag as the same build (VERSIONS.md 'Bumping the pin')"
    fail=1
  else
    echo "  ok    ghcr.io/jitsi/${component}:${PINNED} matches recorded digest"
  fi
done

recorded_coturn="$(recorded_digest_of "coturn/coturn")"
live_coturn="$(dockerhub_digest_of coturn/coturn "$COTURN_TAG")"
if [[ -z "$live_coturn" ]]; then
  echo "  WARN  could not fetch live digest for coturn/coturn:${COTURN_TAG} (network/registry issue) — not treated as drift"
elif [[ "$live_coturn" != "$recorded_coturn" ]]; then
  echo "  DRIFT coturn/coturn:${COTURN_TAG} now resolves to $live_coturn, this package still pins $recorded_coturn — re-verify before treating the tag as the same build"
  fail=1
else
  echo "  ok    coturn/coturn:${COTURN_TAG} matches recorded digest"
fi

echo
if [[ "$fail" == 0 ]]; then
  echo "RESULT: no digest drift detected"
else
  echo "RESULT: DRIFT DETECTED — see DRIFT lines above; do not treat the current pin as verified until this is resolved"
fi
exit "$fail"
