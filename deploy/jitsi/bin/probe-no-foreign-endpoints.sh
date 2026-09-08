#!/usr/bin/env bash
# Captures DNS resolutions and outbound connections made by the running Jitsi/coturn containers during a
# live call and asserts every destination is either our own stack (151.241.228.122) or a loopback/internal
# address. Meant to be started before RUNBOOK.md's two-browser scenario and stopped after hangup.
#
#   bin/probe-no-foreign-endpoints.sh start   begin capture (tcpdump on the docker bridge + host interface)
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
    iface="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="dev") print $(i+1)}')"
    [[ -n "$iface" ]] || { echo "FATAL: could not determine egress interface" >&2; exit 1; }
    nohup tcpdump -i "$iface" -w "$CAPTURE_FILE" \
      "udp port 3478 or udp port 5349 or tcp port 5349 or udp portrange ${TURN_RELAY_MIN:-49152}-${TURN_RELAY_MAX:-49252} or udp port ${JVB_PORT:-10000} or tcp port ${JVB_TCP_PORT:-4443} or port 443 or port 53" \
      >/tmp/jitsi-test-no-foreign-endpoints.log 2>&1 &
    echo $! > "$PID_FILE"
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
      | sort -u)"

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
