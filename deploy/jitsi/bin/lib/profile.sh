# shellcheck shell=bash
# Deployment-profile resolution for the two-host Jitsi/coturn package.
#
# This file is SOURCED (never executed) by every script in deploy/jitsi/bin/. It is the single place that
# knows which host, which hostnames, which package root, which env files, which nftables table and which
# log tag a given run belongs to. No script below bin/ may re-hardcode any of those values.
#
#   JITSI_DEPLOYMENT=test   DEV/RELAY/TEST host 151.241.228.122, meet./turn.test.therapysto.ru
#   JITSI_DEPLOYMENT=prod   NEW production host 135.106.187.95,  meet./turn.therapysto.ru
#
# The two profiles do NOT share a naming stem. Everything the prod profile puts on 135.106.187.95 is named
# `therapysto*` — no `bersoncarebot`, no `bcb` — per the owner's 10.09.2026 ruling recorded in
# docs/ARCHITECTURE/SERVER CONVENTIONS.md ("Именование на новом проде"); the TEST host keeps the historical
# names it already runs under. Both name sets are written out per profile below.
#
# There is deliberately NO default profile. An absent or unknown JITSI_DEPLOYMENT is a fatal error, not a
# silent fallback to TEST: a package that guesses its own profile would eventually render TEST hostnames on
# a production host (or the reverse) and report success. The value comes either from the process
# environment (operator `export`, systemd `Environment=`/`EnvironmentFile=`) or from the deployment env
# file itself, which declares `JITSI_DEPLOYMENT=` as its first key.
#
# The LEGACY production host 135.106.162.170 is refused under BOTH profiles, unconditionally and with its
# own message. That host runs the old production stack; nothing in this package may ever touch it, not even
# with a hand-set JITSI_DEPLOYMENT. This is a strengthening of the original TEST-only gate, not a relaxation
# of it: the old gate only ever asserted "am I on 151.x", so it happened to exclude the legacy host by
# accident. Now it is excluded on purpose, and stays excluded when a second profile exists.

jitsi_profile_fail() { echo "[jitsi-profile] FATAL: $*" >&2; exit 1; }

# Legacy production host — never a valid target for this package under any profile.
JITSI_LEGACY_PROD_HOST_IP="135.106.162.170"

# The two env files that may declare the profile. Kept here (and not derived from JITSI_ENV_FILE) because
# resolving the profile is what tells us which of the two paths is ours in the first place.
JITSI_TEST_ENV_FILE_DEFAULT="/opt/env/bersoncarebot/jitsi.test"
JITSI_PROD_ENV_FILE_DEFAULT="/opt/therapysto/env/jitsi.prod"

if [[ -z "${JITSI_DEPLOYMENT:-}" ]]; then
  jitsi__found=""
  for jitsi__candidate in "$JITSI_TEST_ENV_FILE_DEFAULT" "$JITSI_PROD_ENV_FILE_DEFAULT"; do
    [[ -r "$jitsi__candidate" ]] || continue
    jitsi__value=""
    while IFS= read -r jitsi__line || [[ -n "$jitsi__line" ]]; do
      [[ "$jitsi__line" == JITSI_DEPLOYMENT=* ]] || continue
      jitsi__value="${jitsi__line#JITSI_DEPLOYMENT=}"
      break
    done < "$jitsi__candidate"
    jitsi__value="${jitsi__value%$'\r'}"
    jitsi__value="${jitsi__value%\"}"; jitsi__value="${jitsi__value#\"}"
    jitsi__value="${jitsi__value%\'}"; jitsi__value="${jitsi__value#\'}"
    [[ -n "$jitsi__value" ]] || continue
    if [[ -n "$jitsi__found" && "$jitsi__found" != "$jitsi__value" ]]; then
      jitsi_profile_fail "both $JITSI_TEST_ENV_FILE_DEFAULT and $JITSI_PROD_ENV_FILE_DEFAULT declare a JITSI_DEPLOYMENT and they disagree — export JITSI_DEPLOYMENT=test|prod explicitly for this run"
    fi
    jitsi__found="$jitsi__value"
  done
  [[ -n "$jitsi__found" ]] || jitsi_profile_fail "JITSI_DEPLOYMENT is not set and no deployment env file declares it — export JITSI_DEPLOYMENT=test|prod, or add that line to the env file (see deploy/jitsi/env/jitsi-test.env.example / jitsi-prod.env.example). This package has no default profile on purpose."
  JITSI_DEPLOYMENT="$jitsi__found"
  unset jitsi__found jitsi__candidate jitsi__value jitsi__line
fi

case "$JITSI_DEPLOYMENT" in
  test)
    JITSI_EXPECTED_HOST_IP="151.241.228.122"
    JITSI_MEET_HOST="meet.test.therapysto.ru"
    JITSI_TURN_HOST="turn.test.therapysto.ru"
    JITSI_PACKAGE_ROOT="/etc/bersoncarebot/jitsi-test"
    # Historical override names kept as aliases so the commands already recorded in
    # docs/audit/video-meetings-test-acceptance-2026-09-08.md keep working verbatim on TEST.
    JITSI_ENV_FILE="${JITSI_ENV_FILE:-${JITSI_TEST_ENV_FILE:-$JITSI_TEST_ENV_FILE_DEFAULT}}"
    JITSI_TURN_ENV_FILE="${JITSI_TURN_ENV_FILE:-${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}}"
    # nginx still answers the temporary TherapyGo alias on TEST; the certificate carries the legacy
    # BersonCare names too while the transition lasts.
    JITSI_NGINX_SERVER_NAMES="meet.test.therapysto.ru meet.test.therapygo.ru"
    JITSI_CERT_HOSTS="meet.test.therapysto.ru turn.test.therapysto.ru meet.test.therapygo.ru turn.test.therapygo.ru meet.test.bersoncare.ru turn.test.bersoncare.ru"
    # Addresses a running call may legitimately talk to (bin/probe-no-foreign-endpoints.sh).
    JITSI_TRUSTED_PEER_IPS="151.241.228.122 127.0.0.1"
    # TEST keeps every name it carries today. That host is live: this package root, this nftables table,
    # this unit, this ACME lineage and this compose project all exist there under exactly these strings,
    # so changing them would be a host migration rather than a rename. The owner's 10.09.2026 naming
    # ruling ("Именование на новом проде", docs/ARCHITECTURE/SERVER CONVENTIONS.md) is about the NEW
    # production host only and explicitly leaves the TEST host on the historical names.
    JITSI_NFT_TABLE="bcb_jitsi_test"
    # The TEST policy owns a private table, so it has no chains inside the host's own inet filter table.
    JITSI_NFT_CHAIN_IN=""
    JITSI_NFT_CHAIN_FWD=""
    JITSI_NFT_SOURCE_CONF_NAME="nftables-bcb-jitsi-test.conf"
    JITSI_NFT_TARGET_CONF="/etc/nftables-bcb-jitsi-test.conf"
    JITSI_NFT_UNIT_NAME="bersoncarebot-jitsi-test-network-policy.service"
    JITSI_NFT_BACKUP_ROOT="/var/backups/bersoncare-jitsi-test-network-policy"
    JITSI_TLS_LINEAGE="bcb-jitsi-test"
    JITSI_COMPOSE_PROJECT="bcb-jitsi-test"
    ;;
  prod)
    JITSI_EXPECTED_HOST_IP="135.106.187.95"
    JITSI_MEET_HOST="meet.therapysto.ru"
    JITSI_TURN_HOST="turn.therapysto.ru"
    JITSI_PACKAGE_ROOT="/etc/therapysto/jitsi-prod"
    JITSI_ENV_FILE="${JITSI_ENV_FILE:-$JITSI_PROD_ENV_FILE_DEFAULT}"
    JITSI_TURN_ENV_FILE="${JITSI_TURN_ENV_FILE:-/opt/therapysto/env/jitsi-coturn.prod}"
    # One canonical name only on the new production host: no compatibility alias was ever published there.
    JITSI_NGINX_SERVER_NAMES="meet.therapysto.ru"
    JITSI_CERT_HOSTS="meet.therapysto.ru turn.therapysto.ru"
    # 151.241.228.122 is the dev box, which is also the owner's VPN exit for the production trial — during
    # the trial it is the only client address the prod stack is expected to see (NETWORK_POLICY.md).
    JITSI_TRUSTED_PEER_IPS="135.106.187.95 151.241.228.122 127.0.0.1"
    # NAMES ON THE NEW PRODUCTION HOST CARRY NO `bersoncarebot`/`bcb` (owner ruling 10.09.2026, table
    # "Именование на новом проде" in docs/ARCHITECTURE/SERVER CONVENTIONS.md: roots, units, docker
    # networks and compose projects, images, nginx files, tables). That is why these are literals per
    # profile instead of one `bcb-jitsi-${JITSI_DEPLOYMENT}` expression — the two profiles no longer share
    # a stem, and a shared stem is exactly what would silently reintroduce the old brand here.
    #
    # This profile owns NO nftables table of its own: on this host the policy consists of two regular
    # chains added to the host's existing `table inet filter` plus one jump from each of its base chains
    # (see nftables-therapysto-jitsi-prod.conf and NETWORK_POLICY.md). JITSI_NFT_TABLE is therefore empty
    # here on purpose — a non-empty value would name the host's own table and invite a `delete table`.
    JITSI_NFT_TABLE=""
    JITSI_NFT_CHAIN_IN="therapysto_jitsi_prod_in"
    JITSI_NFT_CHAIN_FWD="therapysto_jitsi_prod_fwd"
    JITSI_NFT_SOURCE_CONF_NAME="nftables-therapysto-jitsi-prod.conf"
    JITSI_NFT_TARGET_CONF="/etc/nftables-therapysto-jitsi-prod.conf"
    JITSI_NFT_UNIT_NAME="therapysto-jitsi-prod-network-policy.service"
    JITSI_NFT_BACKUP_ROOT="/var/backups/therapysto-jitsi-prod-network-policy"
    JITSI_TLS_LINEAGE="therapysto-jitsi-prod"
    JITSI_COMPOSE_PROJECT="therapysto-jitsi-prod"
    ;;
  *)
    jitsi_profile_fail "unknown JITSI_DEPLOYMENT='$JITSI_DEPLOYMENT' — the only valid values are 'test' and 'prod'"
    ;;
esac

# Everything below is still mechanically derived, but only from strings the two profiles genuinely share.
# The host-visible names (table/chains, conf, unit, backup root, ACME lineage, compose project) moved into
# the two branches above when the new production host stopped carrying `bersoncarebot`/`bcb` names: a
# single `bcb-jitsi-${JITSI_DEPLOYMENT}` stem cannot express two different brands, and pretending it can is
# how one of the two ends up applied under one name and torn down under another.
JITSI_NGINX_TEMPLATE_NAME="meet-${JITSI_DEPLOYMENT}.vhost.template.conf"
# Container name follows the compose project, which is itself per-profile above.
JITSI_COTURN_CONTAINER="${JITSI_COMPOSE_PROJECT}-coturn"
JITSI_ENV_EXAMPLE="env/jitsi-${JITSI_DEPLOYMENT}.env.example"
JITSI_TURN_ENV_EXAMPLE="env/coturn-${JITSI_DEPLOYMENT}.env.example"
JITSI_LOG_TAG="[jitsi-${JITSI_DEPLOYMENT}]"
# A copy of the resolved profile under a name the deployment env file does not own. Scripts that `source`
# that env file re-read JITSI_DEPLOYMENT from it and compare against this value, so an env file belonging
# to the other profile cannot be applied under this one.
JITSI_PROFILE_RESOLVED="$JITSI_DEPLOYMENT"

# The secret store keeps its historical variable name (the env contract on TEST already uses it), but its
# default now follows the profile's package root instead of a hardcoded TEST path.
JITSI_TEST_SECRET_STORE="${JITSI_TEST_SECRET_STORE:-$JITSI_PACKAGE_ROOT/secrets}"

export JITSI_DEPLOYMENT JITSI_EXPECTED_HOST_IP JITSI_MEET_HOST JITSI_TURN_HOST JITSI_PACKAGE_ROOT \
  JITSI_ENV_FILE JITSI_TURN_ENV_FILE JITSI_NFT_TABLE JITSI_LOG_TAG \
  JITSI_NFT_CHAIN_IN JITSI_NFT_CHAIN_FWD JITSI_NFT_BACKUP_ROOT \
  JITSI_LEGACY_PROD_HOST_IP JITSI_NFT_SOURCE_CONF_NAME JITSI_NFT_TARGET_CONF JITSI_NFT_UNIT_NAME \
  JITSI_NGINX_TEMPLATE_NAME JITSI_NGINX_SERVER_NAMES JITSI_TLS_LINEAGE JITSI_CERT_HOSTS \
  JITSI_TRUSTED_PEER_IPS JITSI_COMPOSE_PROJECT JITSI_COTURN_CONTAINER \
  JITSI_ENV_EXAMPLE JITSI_TURN_ENV_EXAMPLE JITSI_TEST_SECRET_STORE JITSI_PROFILE_RESOLVED

# Fail-closed host gate. Replaces the literal `[[ "$address" == 151.241.228.122 ]]` idiom every script in
# this package used to carry. Two independent refusals, each with its own message:
#   1. the host owns the legacy production address       -> refuse, whatever the profile says;
#   2. the host does not own this profile's address      -> refuse.
jitsi_require_host() {
  local address on_expected=0 on_legacy=0
  for address in $(hostname -I 2>/dev/null || true); do
    [[ "$address" == "$JITSI_LEGACY_PROD_HOST_IP" ]] && on_legacy=1
    [[ "$address" == "$JITSI_EXPECTED_HOST_IP" ]] && on_expected=1
  done
  if [[ "$on_legacy" == 1 ]]; then
    echo "[jitsi-profile] FATAL: this host owns the LEGACY production address $JITSI_LEGACY_PROD_HOST_IP — the Jitsi/coturn package is forbidden there under every profile (see deploy/jitsi/NETWORK_POLICY.md); refusing to run" >&2
    exit 1
  fi
  if [[ "$on_expected" != 1 ]]; then
    echo "[jitsi-profile] FATAL: profile '$JITSI_DEPLOYMENT' targets only host $JITSI_EXPECTED_HOST_IP; this host does not own that address, refusing to run" >&2
    exit 1
  fi
}
