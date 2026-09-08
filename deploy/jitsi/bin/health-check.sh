#!/usr/bin/env bash
# Health + configuration/network proof for the running stack. Fails closed: a passing exit code means every
# check below actually passed against the live containers, not that the script merely ran. Every probe here
# is mandatory — a missing host tool is a FAIL, not a silently skipped check (see
# docs/audit/jitsi-coturn-test-package-2026-09-08.md finding F5).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

fail=0
ok() { echo "  ok    $*"; }
bad() { echo "  FAIL  $*"; fail=1; }

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || { echo "FATAL: not on 151.241.228.122" >&2; exit 1; }

# Load the same env the running stack was rendered/started from — without this, every ${VAR:-default}
# below silently checks the *default* port/value instead of whatever was actually configured, which would
# let a misconfigured deployment report PASS against ports nothing is listening on.
ENV_FILE="${JITSI_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi.test}"
[[ -f "$ENV_FILE" ]] || { echo "FATAL: missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
TURN_ENV_FILE="${TURN_TEST_ENV_FILE:-/opt/env/bersoncarebot/jitsi-coturn.test}"
[[ -f "$TURN_ENV_FILE" ]] || { echo "FATAL: missing $TURN_ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$TURN_ENV_FILE"; set +a

VENDOR_DIR="$HERE/vendor/docker-jitsi-meet-${JITSI_RELEASE_TAG:-unknown}"
# --project-directory: see install.sh's identical flag — without it the override's relative bind-mount
# sources resolve against $VENDOR_DIR (the first -f file's directory), not deploy/jitsi/.
COMPOSE_ARGS=(-f "$VENDOR_DIR/docker-compose.yml" -f "$HERE/docker-compose.override.test.yml" --env-file "$ENV_FILE" --project-directory "$HERE" -p bcb-jitsi-test)

echo "[containers up, and container-level health where the image defines one]"
for svc in web prosody jicofo jvb coturn; do
  cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q "$svc" 2>/dev/null || true)"
  if [[ -z "$cid" ]] || [[ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" != "true" ]]; then
    bad "$svc container not running"
    continue
  fi
  ok "$svc container running"
  health_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)"
  case "$health_status" in
    none)
      # Upstream's web/prosody/jicofo/jvb images ship no Docker HEALTHCHECK (verified against their
      # Dockerfiles at the pinned tag) — Running is all Docker itself can report for them, which is why
      # the functional probes below (JVB REST health, prosodyctl, TURN allocation) exist instead of trusting
      # container state alone.
      ;;
    healthy) ok "$svc container health: healthy" ;;
    *) bad "$svc container health: $health_status" ;;
  esac
done

echo
echo "[web reachable on loopback, plain HTTP — DISABLE_HTTPS=1 means the container never opens 8443]"
if curl -fsS -o /dev/null "http://127.0.0.1:${HTTP_PORT:-8000}/"; then
  ok "web answers on 127.0.0.1:${HTTP_PORT:-8000}"
else
  bad "web did not answer on 127.0.0.1:${HTTP_PORT:-8000}"
fi

echo
echo "[JVB actual health — GET /about/health on the loopback Colibri REST API, not just State.Running]"
colibri_rest_enabled="${COLIBRI_REST_ENABLED:-}"
if [[ "$colibri_rest_enabled" != "1" && "$colibri_rest_enabled" != "true" && "$colibri_rest_enabled" != "TRUE" ]]; then
  bad "COLIBRI_REST_ENABLED is not set in $ENV_FILE — JVB's own health endpoint cannot be reached; this is a required probe, not optional"
else
  jvb_health_code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${JVB_COLIBRI_PORT:-8080}/about/health" || true)"
  if [[ "$jvb_health_code" == "200" ]]; then
    ok "JVB /about/health returned 200"
  else
    bad "JVB /about/health returned '$jvb_health_code' (expected 200) — see jitsi/jitsi-videobridge doc/health-checks.md"
  fi
fi

echo
echo "[Prosody config actually landed — not assumed]"
prosody_cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q prosody 2>/dev/null || true)"
if [[ -n "$prosody_cid" ]]; then
  if docker exec "$prosody_cid" grep -rq "turn_external_secret" /run/prosody/config/conf.d/ 2>/dev/null; then
    ok "turn_external override file is present inside the running container's conf.d"
  else
    bad "turn_external override file NOT found inside the running container — CONFIG tree/bind-mount did not land; see README.md 'Design decisions'"
  fi
  if docker exec "$prosody_cid" grep -q "turn_external_tls_port" /run/prosody/config/conf.d/00-turn-external.cfg.lua 2>/dev/null; then
    ok "rendered config advertises turn_external_tls_port (TLS/TURNS fallback candidate)"
  else
    bad "rendered config does not advertise turn_external_tls_port — a UDP-restricted client would have no TLS fallback candidate (finding F2)"
  fi
  if docker exec "$prosody_cid" prosodyctl --config /run/prosody/config/prosody.cfg.lua check turn >/tmp/jitsi-test-prosodyctl-turn.log 2>&1; then
    ok "prosodyctl check turn passed (log: /tmp/jitsi-test-prosodyctl-turn.log)"
  else
    bad "prosodyctl check turn failed — see /tmp/jitsi-test-prosodyctl-turn.log"
  fi
  if docker exec "$prosody_cid" prosodyctl --config /run/prosody/config/prosody.cfg.lua check config >/tmp/jitsi-test-prosodyctl-config.log 2>&1; then
    ok "prosodyctl check config passed"
  else
    bad "prosodyctl check config failed — see /tmp/jitsi-test-prosodyctl-config.log"
  fi
  if docker exec "$prosody_cid" grep -q 'muc_max_occupants = "2"' /run/prosody/config/conf.d/jitsi-meet.cfg.lua 2>/dev/null; then
    ok "rendered MUC config carries muc_max_occupants = \"2\""
  else
    bad "rendered MUC config does not show muc_max_occupants = \"2\" — MAX_PARTICIPANTS may not have been read; this is a config-presence check only, the authoritative proof is RUNBOOK.md's live third-participant refusal"
  fi
else
  bad "prosody container not found, cannot check rendered config"
fi

echo
echo "[coturn — mandatory STUN + real credentialed TURN allocation over UDP and TLS]"
coturn_cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q coturn 2>/dev/null || true)"
if [[ -z "$coturn_cid" ]]; then
  bad "coturn container not found, cannot run mandatory STUN/TURN probes"
elif ! docker exec --user "${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}" "$coturn_cid" sh -c 'command -v turnutils_stunclient >/dev/null && command -v turnutils_uclient >/dev/null' >/dev/null 2>&1; then
  bad "pinned coturn container lacks turnutils_stunclient/turnutils_uclient — TURN probes are mandatory, not skippable"
else
  if docker exec --user "${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}" "$coturn_cid" turnutils_stunclient -p "${TURN_LISTEN_PORT:-3478}" 127.0.0.1 >/dev/null 2>&1; then
    ok "coturn answers STUN binding requests on 127.0.0.1:${TURN_LISTEN_PORT:-3478}"
  else
    bad "coturn did not answer a STUN binding request"
  fi

  # The host never reads or passes the TURN secret. This non-root exec reads the already-mounted 0600
  # rendered config inside coturn, derives the same ephemeral credential as a client, and prints nothing.
  run_turn_allocation() {
    local port="$1" transport="$2"
    docker exec --user "${COTURN_CONTAINER_UID}:${COTURN_CONTAINER_GID}" "$coturn_cid" sh -ceu '
      turn_secret=""
      while IFS= read -r line; do
        case "$line" in
          static-auth-secret=*) turn_secret="${line#*=}"; break ;;
        esac
      done < /etc/coturn/turnserver.conf
      [[ -n "$turn_secret" ]]
      case "$2" in
        udp) turnutils_uclient -y -n 1 -u healthcheck -W "$turn_secret" -p "$1" 127.0.0.1 ;;
        tls) turnutils_uclient -y -n 1 -S -u healthcheck -W "$turn_secret" -p "$1" 127.0.0.1 ;;
        *) exit 64 ;;
      esac
    ' sh "$port" "$transport" >/dev/null 2>&1
  }
  if run_turn_allocation "${TURN_LISTEN_PORT:-3478}" udp; then
    ok "coturn accepted a real ephemeral-credential TURN allocation over UDP (${TURN_LISTEN_PORT:-3478})"
  else
    bad "coturn rejected a real ephemeral-credential TURN allocation over UDP — shared secret mismatch or ALLOCATE failure"
  fi
  if run_turn_allocation "${TURN_TLS_LISTEN_PORT:-5349}" tls; then
    ok "coturn accepted a real ephemeral-credential TURN allocation over TLS (${TURN_TLS_LISTEN_PORT:-5349}) — required UDP-restricted-network fallback"
  else
    bad "coturn rejected a real ephemeral-credential TURN allocation over TLS — TLS fallback (VM-03/VM-04, finding F2) is not actually usable"
  fi
fi

echo
echo "[no foreign endpoint — scans the rendered/merged runtime config, not just this package's own source]"
foreign_literal_found=0
foreign_hosts=(stun.l.google.com meet-jit-si-turnrelay.jitsi.net meet.jit.si 8x8.vc)

merged_config=""
if [[ -f "$VENDOR_DIR/docker-compose.yml" ]]; then
  merged_config="$(docker compose "${COMPOSE_ARGS[@]}" config 2>/dev/null || true)"
fi
web_cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q web 2>/dev/null || true)"
web_generated_config=""
[[ -n "$web_cid" ]] && web_generated_config="$(docker exec "$web_cid" cat /config/config.js 2>/dev/null || true)"

for host in "${foreign_hosts[@]}"; do
  if getent ahostsv4 "$host" >/dev/null 2>&1; then
    echo "  note  $host resolves on this network (expected — it's public DNS); the assertion is that our own rendered/running config never references it"
  fi
  if grep -rq "$host" "$HERE"/env/*.env.example "$HERE"/config 2>/dev/null \
    || { [[ -n "$merged_config" ]] && grep -q "$host" <<<"$merged_config"; } \
    || { [[ -n "$web_generated_config" ]] && grep -q "$host" <<<"$web_generated_config"; }; then
    bad "found a known foreign endpoint literal ($host) in this package's static config, merged compose config, or the running web container's generated config.js"
    foreign_literal_found=1
  fi
done
[[ -z "$merged_config" ]] && echo "  note  merged compose config unavailable (vendor tree not fetched yet) — this widened scan only runs meaningfully once the stack has been applied"
[[ -z "$web_generated_config" ]] && echo "  note  web container's generated config.js unavailable (container not running) — same caveat"
[[ "$foreign_literal_found" == 0 ]] && ok "no known foreign STUN/TURN/telemetry literal present in static config, merged runtime config, or the running web container's generated config.js"

echo
if [[ "$fail" == 0 ]]; then
  echo "RESULT: PASS"
else
  echo "RESULT: FAIL — see FAIL lines above"
fi
exit "$fail"
