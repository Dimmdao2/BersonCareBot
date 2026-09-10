#!/usr/bin/env bash
# Build the pinned custom edge binary in a temporary directory and parse the Caddyfile with only
# non-secret placeholders. It neither installs a binary nor contacts a live edge.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/therapysto-caddy-validate.XXXXXX")
cleanup() {
  chmod -R u+w "$work_dir" 2>/dev/null || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

export CADDY_ACME_EMAIL=ops@example.invalid
export CADDY_DATA_DIR="$work_dir/data"
export CADDY_PLATFORM_DOMAINS='therapysto.ru www.therapysto.ru admin.therapysto.ru www.therapygo.ru'
export CADDY_REGRU_USERNAME=placeholder-reg-ru-user
export CADDY_REGRU_PASSWORD=placeholder-reg-ru-password
export CADDY_ASK_URL=https://therapygo.ru/api/public/domains/ask
export CADDY_UPSTREAM=127.0.0.1:8080

"$script_dir/build-caddy-edge.sh" --output "$work_dir/caddy"
"$work_dir/caddy" list-modules | grep -Fx 'dns.providers.regru'
"$work_dir/caddy" validate --config "$script_dir/Caddyfile.template" --adapter caddyfile
