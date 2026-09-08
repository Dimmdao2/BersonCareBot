#!/usr/bin/env bash
# TEST-only ACME deploy hook/manual apply path. Coturn runs as deploy's non-root UID and cannot read
# /etc/letsencrypt, so it receives an atomic 0600 copy under CONFIG. Run as root after issuance/renewal.
set -euo pipefail

ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
TURN_ENV_FILE="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/bcb-jitsi-test}"
EXPECTED_LINEAGE="/etc/letsencrypt/live/bcb-jitsi-test"

fail() { echo "[jitsi-test-tls] FATAL: $*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "run as root: the ACME private key is root-readable only"

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || fail "this hook targets only DEV/RELAY/TEST host 151.241.228.122"
[[ "$LINEAGE" == "$EXPECTED_LINEAGE" ]] || fail "unexpected certificate lineage: $LINEAGE"
[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE"
[[ -f "$TURN_ENV_FILE" ]] || fail "missing $TURN_ENV_FILE"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a

[[ "${CONFIG:-}" == /etc/bersoncarebot/jitsi-test/* ]] || fail "CONFIG must remain below /etc/bersoncarebot/jitsi-test"
[[ "${COTURN_CONTAINER_UID:-}" =~ ^[0-9]+$ ]] || fail "COTURN_CONTAINER_UID must be numeric"
[[ "${COTURN_CONTAINER_GID:-}" =~ ^[0-9]+$ ]] || fail "COTURN_CONTAINER_GID must be numeric"

source_cert="$LINEAGE/fullchain.pem"
source_key="$LINEAGE/privkey.pem"
[[ -s "$source_cert" && -s "$source_key" ]] || fail "certificate lineage is incomplete"
openssl x509 -in "$source_cert" -noout -checkhost meet.test.bersoncare.ru >/dev/null \
  || fail "certificate does not cover meet.test.bersoncare.ru"
openssl x509 -in "$source_cert" -noout -checkhost turn.test.bersoncare.ru >/dev/null \
  || fail "certificate does not cover turn.test.bersoncare.ru"
openssl x509 -in "$source_cert" -noout -checkend 86400 >/dev/null \
  || fail "certificate expires in less than 24 hours"

target_dir="$CONFIG/coturn/tls"
install -d -m 0700 -o "$COTURN_CONTAINER_UID" -g "$COTURN_CONTAINER_GID" "$target_dir"
tmp_cert="$(mktemp "$target_dir/fullchain.pem.tmp.XXXXXX")"
tmp_key="$(mktemp "$target_dir/privkey.pem.tmp.XXXXXX")"
cleanup() { rm -f "$tmp_cert" "$tmp_key"; }
trap cleanup EXIT
install -m 0600 -o "$COTURN_CONTAINER_UID" -g "$COTURN_CONTAINER_GID" "$source_cert" "$tmp_cert"
install -m 0600 -o "$COTURN_CONTAINER_UID" -g "$COTURN_CONTAINER_GID" "$source_key" "$tmp_key"
mv -f -- "$tmp_cert" "$target_dir/fullchain.pem"
mv -f -- "$tmp_key" "$target_dir/privkey.pem"
trap - EXIT

if docker container inspect bcb-jitsi-test-coturn >/dev/null 2>&1; then
  docker restart bcb-jitsi-test-coturn >/dev/null
  echo "[jitsi-test-tls] staged renewed certificate and restarted coturn"
else
  echo "[jitsi-test-tls] staged certificate; coturn is not running"
fi
