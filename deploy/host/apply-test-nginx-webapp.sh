#!/usr/bin/env bash
# Compatibility entry point. The TEST webapp now has separate Therapysto and
# TherapyGo surfaces; keep the historical command delegating to the canonical
# split-domain renderer so it cannot restore the retired single-host vhost.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$HERE/apply-test-surface-domains.sh" "$@"
