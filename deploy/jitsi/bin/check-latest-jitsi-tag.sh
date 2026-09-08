#!/usr/bin/env bash
# Read-only: compares the pinned tag in env/jitsi-test.env.example against upstream's actual latest release.
# Does not change anything and does not touch any host — safe to run from anywhere with internet access.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PINNED="$(grep -E '^JITSI_RELEASE_TAG=' "$HERE/env/jitsi-test.env.example" | cut -d= -f2)"

echo "pinned tag (this package):  $PINNED"

latest_json="$(curl -fsS https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest)"
latest_tag="$(printf '%s' "$latest_json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
echo "upstream latest release:    $latest_tag"

if [[ "$PINNED" == "$latest_tag" ]]; then
  echo "RESULT: up to date"
else
  echo "RESULT: newer release available ($latest_tag) — see VERSIONS.md 'Bumping the pin' before adopting it"
fi
