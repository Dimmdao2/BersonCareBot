#!/usr/bin/env bash
# Captures traffic on the dedicated Jitsi compose bridge during a live call and asserts every address is
# either our own stack (151.241.228.122) or a loopback/internal address. Capturing the host egress device
# is deliberately forbidden: that device also carries unrelated app/Telegram/DNS traffic and would
# attribute other services' destinations to Jitsi. Browser requests are checked separately by the live
# acceptance scenario, while coturn/JVB public listeners are covered by health-check allocations.
#
#   bin/probe-no-foreign-endpoints.sh start   begin capture (tcpdump on the dedicated compose bridge)
#   bin/probe-no-foreign-endpoints.sh stop    stop capture, print every distinct remote IP/host seen,
#                                              fail if any is outside the allowed set
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPTURE_FILE="/tmp/jitsi-test-no-foreign-endpoints.pcap"
PID_FILE="/tmp/jitsi-test-no-foreign-endpoints.pid"
ALLOWED_IPS=("151.241.228.122" "127.0.0.1")

case "${1:-}" in
  start)
    command -v tcpdump >/dev/null || { echo "FATAL: tcpdump not installed" >&2; exit 1; }
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "FATAL: capture already running with pid $(cat "$PID_FILE")" >&2
      exit 1
    fi
    network_id="$(docker network inspect bcb-jitsi-test_meet.jitsi --format '{{.Id}}' 2>/dev/null || true)"
    [[ -n "$network_id" ]] || { echo "FATAL: bcb-jitsi-test compose network is absent" >&2; exit 1; }
    iface="br-${network_id:0:12}"
    ip link show "$iface" >/dev/null 2>&1 || { echo "FATAL: compose bridge $iface is absent" >&2; exit 1; }
    rm -f "$CAPTURE_FILE"
    nohup tcpdump -i "$iface" -w "$CAPTURE_FILE" \
      >/tmp/jitsi-test-no-foreign-endpoints.log 2>&1 &
    echo $! > "$PID_FILE"
    sleep 1
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "FATAL: tcpdump failed to start: $(tail -n 1 /tmp/jitsi-test-no-foreign-endpoints.log)" >&2
      rm -f "$PID_FILE"
      exit 1
    fi
    echo "[probe] capture started on $iface, pid $(cat "$PID_FILE"), writing $CAPTURE_FILE"
    ;;
  stop)
    [[ -f "$PID_FILE" ]] || { echo "FATAL: no capture running (no $PID_FILE)" >&2; exit 1; }
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    sleep 1
    rm -f "$PID_FILE"
    echo "[probe] capture stopped, analyzing $CAPTURE_FILE"

    remotes="$(tcpdump -nr "$CAPTURE_FILE" 2>/dev/null \
      | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' \
      | sort -u || true)"

    foreign=0
    while IFS= read -r ip; do
      [[ -z "$ip" ]] && continue
      allowed=0
      for a in "${ALLOWED_IPS[@]}"; do [[ "$ip" == "$a" ]] && allowed=1; done
      # RFC1918/loopback ranges used by the browser test clients themselves are not "foreign".
      [[ "$ip" =~ ^10\. || "$ip" =~ ^172\.1[6-9]\.|^172\.2[0-9]\.|^172\.3[01]\. || "$ip" =~ ^192\.168\. || "$ip" =~ ^127\. ]] && allowed=1
      if [[ "$allowed" == 0 ]]; then
        echo "  FOREIGN  $ip"
        foreign=1
      else
        echo "  ok       $ip"
      fi
    done <<< "$remotes"

    if [[ "$foreign" == 1 ]]; then
      echo "RESULT: FAIL — foreign endpoint(s) seen during the call, see FOREIGN lines above"
      exit 1
    fi
    echo "RESULT: PASS — no foreign endpoint observed on the monitored ports during the capture window"
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 2
    ;;
esac
