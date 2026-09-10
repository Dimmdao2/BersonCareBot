#!/usr/bin/env bash
# Per-profile ACME deploy hook/manual apply path. Coturn runs as deploy's non-root UID and cannot read
# /etc/letsencrypt, so it receives an atomic 0600 copy under CONFIG. Run as root after issuance/renewal.
# The lineage name and the set of SANs the certificate must cover are profile-derived (bin/lib/profile.sh).
set -euo pipefail

# shellcheck source=lib/profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/profile.sh"

ENV_FILE="$JITSI_ENV_FILE"
TURN_ENV_FILE="$JITSI_TURN_ENV_FILE"
EXPECTED_LINEAGE="/etc/letsencrypt/live/$JITSI_TLS_LINEAGE"
LINEAGE="${RENEWED_LINEAGE:-$EXPECTED_LINEAGE}"

fail() { echo "[jitsi-${JITSI_DEPLOYMENT}-tls] FATAL: $*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "run as root: the ACME private key is root-readable only"

jitsi_require_host
if [[ "$LINEAGE" != "$EXPECTED_LINEAGE" ]]; then
  if [[ -n "${RENEWED_LINEAGE:-}" ]]; then
    echo "[jitsi-${JITSI_DEPLOYMENT}-tls] skipping unrelated renewed lineage"
    exit 0
  fi
  fail "unexpected certificate lineage: $LINEAGE"
fi
[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE"
[[ -f "$TURN_ENV_FILE" ]] || fail "missing $TURN_ENV_FILE"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a
COTURN_CONTAINER_UID="${COTURN_CONTAINER_UID:-1000}"
COTURN_CONTAINER_GID="${COTURN_CONTAINER_GID:-1000}"

[[ "${CONFIG:-}" == "$JITSI_PACKAGE_ROOT"/* ]] || fail "CONFIG must remain below $JITSI_PACKAGE_ROOT"
[[ "${COTURN_CONTAINER_UID:-}" =~ ^[0-9]+$ ]] || fail "COTURN_CONTAINER_UID must be numeric"
[[ "${COTURN_CONTAINER_GID:-}" =~ ^[0-9]+$ ]] || fail "COTURN_CONTAINER_GID must be numeric"

source_cert="$LINEAGE/fullchain.pem"
source_key="$LINEAGE/privkey.pem"
[[ -s "$source_cert" && -s "$source_key" ]] || fail "certificate lineage is incomplete"
# JITSI_CERT_HOSTS is the profile's required SAN set: on TEST the canonical Therapysto names plus the
# TherapyGo/BersonCare transition aliases, on PROD only meet./turn.therapysto.ru. Word-splitting is the
# intended read of this space-separated list.
# shellcheck disable=SC2086
for expected_host in $JITSI_CERT_HOSTS; do
  openssl x509 -in "$source_cert" -noout -checkhost "$expected_host" >/dev/null \
    || fail "certificate does not cover $expected_host"
done
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

if docker container inspect "$JITSI_COTURN_CONTAINER" >/dev/null 2>&1; then
  docker restart "$JITSI_COTURN_CONTAINER" >/dev/null
  echo "[jitsi-${JITSI_DEPLOYMENT}-tls] staged renewed certificate and restarted coturn"
else
  echo "[jitsi-${JITSI_DEPLOYMENT}-tls] staged certificate; coturn is not running"
fi
