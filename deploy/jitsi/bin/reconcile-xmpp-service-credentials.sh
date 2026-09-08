#!/usr/bin/env bash
# Reconciles Prosody's persisted service accounts with the credentials currently supplied to the
# containers. Upstream's register-setup only creates missing users; after a recovered/rotated secret it
# prints "User exists" and leaves Jicofo unable to authenticate. Passwords travel over stdin inside the
# Prosody container and never appear in host/container argv or output.
set -euo pipefail

on_dev_test_host=0
for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "$on_dev_test_host" == 1 ]] || { echo "FATAL: not on 151.241.228.122" >&2; exit 1; }

container_id() {
  docker ps \
    --filter label=com.docker.compose.project=bcb-jitsi-test \
    --filter "label=com.docker.compose.service=$1" \
    --format '{{.ID}}' | head -n 1
}

prosody_cid="$(container_id prosody)"
[[ -n "$prosody_cid" ]] || { echo "FATAL: bcb-jitsi-test Prosody container is not running" >&2; exit 1; }

prosody_ready=0
for _ in $(seq 1 60); do
  if docker exec "$prosody_cid" prosodyctl \
    --config /run/prosody/config/prosody.cfg.lua status >/dev/null 2>&1; then
    prosody_ready=1
    break
  fi
  sleep 1
done
[[ "$prosody_ready" == 1 ]] || { echo "FATAL: Prosody did not become ready in 60 seconds" >&2; exit 1; }

# A domain cutover starts Prosody before upstream's asynchronous register-setup
# has created the service users for the new auth domain. Wait for both accounts
# instead of failing the systemd start and relying on Restart=on-failure.
service_accounts_ready=0
for _ in $(seq 1 60); do
  if docker exec "$prosody_cid" sh -ceu '
    printf "%s\n%s\n" "$JICOFO_AUTH_PASSWORD" "$JICOFO_AUTH_PASSWORD" |
      prosodyctl --config /run/prosody/config/prosody.cfg.lua passwd "focus@$XMPP_AUTH_DOMAIN" >/dev/null
    printf "%s\n%s\n" "$JVB_AUTH_PASSWORD" "$JVB_AUTH_PASSWORD" |
      prosodyctl --config /run/prosody/config/prosody.cfg.lua passwd "${JVB_AUTH_USER:-jvb}@$XMPP_AUTH_DOMAIN" >/dev/null
  ' >/dev/null 2>&1; then
    service_accounts_ready=1
    break
  fi
  sleep 1
done
[[ "$service_accounts_ready" == 1 ]] || {
  echo "FATAL: Prosody service accounts were not registered within 60 seconds" >&2
  exit 1
}

jicofo_cid="$(container_id jicofo)"
jvb_cid="$(container_id jvb)"
[[ -n "$jicofo_cid" && -n "$jvb_cid" ]] || {
  echo "FATAL: bcb-jitsi-test Jicofo/JVB containers are not running" >&2
  exit 1
}
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker restart "$jicofo_cid" "$jvb_cid" >/dev/null

jicofo_connected=0
for _ in $(seq 1 60); do
  if docker logs --since "$started_at" "$jicofo_cid" 2>&1 |
    grep -q '\[xmpp_connection=client\].*scheduleConnectTask.*Connected\.'; then
    jicofo_connected=1
    break
  fi
  sleep 1
done
[[ "$jicofo_connected" == 1 ]] || {
  echo "FATAL: Jicofo did not authenticate after credential reconciliation" >&2
  docker logs --since "$started_at" "$jicofo_cid" 2>&1 |
    grep -E 'not-authorized|Failed to connect|scheduleConnectTask.*Connected\.' | tail -n 20 >&2 || true
  exit 1
}

echo "[jitsi-test] persisted XMPP service credentials reconciled; Jicofo authenticated"
