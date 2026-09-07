#!/usr/bin/env bash
# Build the only supported edge binary: Caddy v2.11.2 + REG.RU DNS module v0.1.10.
# The Go toolchain and all caches live in a temporary directory; only --output persists.
set -euo pipefail

readonly CADDY_VERSION=v2.11.2
readonly REGRU_MODULE=github.com/heinwol/caddy-dns-regru
readonly REGRU_VERSION=v0.1.10
readonly XCADDY_VERSION=v0.4.5
readonly GO_VERSION=1.27.1
readonly GO_SHA256=63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445

output=''
if [ "${1:-}" = '--output' ]; then
  output="${2:?--output needs a path}"
  shift 2
fi
[ "$#" = 0 ] || { echo "usage: $0 --output PATH" >&2; exit 2; }
[ -n "$output" ] || { echo "usage: $0 --output PATH" >&2; exit 2; }
[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || {
  echo 'FATAL: the pinned builder supports Linux x86_64 only' >&2; exit 1;
}

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/bcb-caddy-build.XXXXXX")
# Go deliberately makes module-cache sources read-only. Restore owner write
# permission before removing this private temporary cache so cleanup itself
# cannot turn an otherwise successful build into a failed validation.
cleanup() {
  chmod -R u+w "$work_dir" 2>/dev/null || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

archive="$work_dir/go.tar.gz"
curl --fail --location --silent --show-error \
  "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o "$archive"
printf '%s  %s\n' "$GO_SHA256" "$archive" | sha256sum -c - >/dev/null
tar -C "$work_dir" -xzf "$archive"

export PATH="$work_dir/go/bin:$PATH"
export GOPATH="$work_dir/gopath"
export GOMODCACHE="$work_dir/gomodcache"
export GOCACHE="$work_dir/gocache"
mkdir -p "$(dirname "$output")"

go run "github.com/caddyserver/xcaddy/cmd/xcaddy@${XCADDY_VERSION}" build "$CADDY_VERSION" \
  --output "$output" --with "${REGRU_MODULE}@${REGRU_VERSION}"
