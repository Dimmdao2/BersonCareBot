#!/usr/bin/env bash
# Health + configuration/network proof for the running stack. Fails closed: a passing exit code means every
# check below actually passed against the live containers, not that the script merely ran.
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

echo "[containers up]"
for svc in web prosody jicofo jvb coturn; do
  cid="$(docker compose -p bcb-jitsi-test ps -q "$svc" 2>/dev/null || true)"
  if [[ -n "$cid" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" == "true" ]]; then
    ok "$svc container running"
  else
    bad "$svc container not running"
  fi
done

echo
echo "[web reachable on loopback]"
if curl -fsSk -o /dev/null "https://127.0.0.1:${HTTPS_PORT:-8443}/"; then
  ok "web answers on 127.0.0.1:${HTTPS_PORT:-8443}"
else
  bad "web did not answer on 127.0.0.1:${HTTPS_PORT:-8443}"
fi

echo
echo "[Prosody config actually landed — not assumed]"
prosody_cid="$(docker compose -p bcb-jitsi-test ps -q prosody 2>/dev/null || true)"
if [[ -n "$prosody_cid" ]]; then
  if docker exec "$prosody_cid" grep -rq "turn_external_secret" /config/conf.d/ 2>/dev/null; then
    ok "turn_external override file is present inside the running container's conf.d"
  else
    bad "turn_external override file NOT found inside the running container — bind-mount path assumption in docker-compose.override.test.yml did not hold; see README.md item 1 under 'Status and what remains'"
  fi
  if docker exec "$prosody_cid" prosodyctl check turn >/tmp/jitsi-test-prosodyctl-turn.log 2>&1; then
    ok "prosodyctl check turn passed (log: /tmp/jitsi-test-prosodyctl-turn.log)"
  else
    bad "prosodyctl check turn failed — see /tmp/jitsi-test-prosodyctl-turn.log"
  fi
  if docker exec "$prosody_cid" prosodyctl check config >/tmp/jitsi-test-prosodyctl-config.log 2>&1; then
    ok "prosodyctl check config passed"
  else
    bad "prosodyctl check config failed — see /tmp/jitsi-test-prosodyctl-config.log"
  fi
  if docker exec "$prosody_cid" grep -q 'muc_max_occupants = "2"' /config/conf.d/jitsi-meet.cfg.lua 2>/dev/null; then
    ok "rendered MUC config carries muc_max_occupants = \"2\""
  else
    bad "rendered MUC config does not show muc_max_occupants = \"2\" — MAX_PARTICIPANTS may not have been read; this is a config-presence check only, the authoritative proof is RUNBOOK.md's live third-participant refusal"
  fi
else
  bad "prosody container not found, cannot check rendered config"
fi

echo
echo "[coturn]"
if command -v turnutils_stunclient >/dev/null 2>&1; then
  if turnutils_stunclient -p "${TURN_LISTEN_PORT:-3478}" 127.0.0.1 >/dev/null 2>&1; then
    ok "coturn answers STUN binding requests on 127.0.0.1:${TURN_LISTEN_PORT:-3478}"
  else
    bad "coturn did not answer a STUN binding request"
  fi
else
  echo "  skip  turnutils_stunclient not installed on this host — install coturn-utils or run this check from inside the coturn container"
fi

echo
echo "[no foreign DNS/egress — see bin/probe-no-foreign-endpoints.sh for the live-call version]"
foreign_literal_found=0
for host in stun.l.google.com meet-jit-si-turnrelay.jitsi.net meet.jit.si 8x8.vc; do
  if getent ahostsv4 "$host" >/dev/null 2>&1; then
    echo "  note  $host resolves on this network (expected — it's public DNS); the assertion is that our own config never references it"
  fi
  if grep -rq "$host" "$HERE"/env/*.env.example "$HERE"/config 2>/dev/null; then
    bad "found a known foreign endpoint literal ($host) in this package's own config"
    foreign_literal_found=1
  fi
done
[[ "$foreign_literal_found" == 0 ]] && ok "no known foreign STUN/TURN/telemetry literal present in this package's config"

echo
if [[ "$fail" == 0 ]]; then
  echo "RESULT: PASS"
else
  echo "RESULT: FAIL — see FAIL lines above"
fi
exit "$fail"
