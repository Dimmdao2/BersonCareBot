#!/bin/bash
# One-time installation of the blue-green deploy pipeline on the production host. Run as root.
# Re-running is safe: every step checks for its own result first.
#
#   BCB_PROD_IP=135.106.187.95 BCB_OWNER=dim bash setup-docker-bluegreen.sh
#
# What it leaves behind: docker, a source checkout that can fetch from GitHub, the pipeline scripts in
# a root-owned directory, three commands the owner can run, and nginx pointing at whichever colour is
# live. It does not deploy anything — that is `deploy-prod`.
set -uo pipefail

PROD_IP="${BCB_PROD_IP:?BCB_PROD_IP is required}"
OWNER="${BCB_OWNER:-dim}"
BRANCH="${BCB_BRANCH:-main}"
REPO="${BCB_REPO:-git@github.com:dimmdao/BersonCareBot.git}"
ROOT=/opt/bersoncarebot
PIPELINE="$ROOT/pipeline"
KEY=/root/.ssh/bcb_github_deploy

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
id "$OWNER" >/dev/null 2>&1 || die "owner account '$OWNER' does not exist"
hostname -I | tr ' ' '\n' | grep -qx "$PROD_IP" || die "this host has no local IPv4 $PROD_IP"
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- docker
if ! command -v docker >/dev/null; then
  say "installing docker from the upstream repository"
  # Upstream rather than Ubuntu's docker.io: this is the combination that ships the compose v2 and
  # buildx plugins the pipeline uses, versioned together and supported together.
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc ||
    die "cannot reach download.docker.com"
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin ||
    die "docker install failed"
fi

say "configuring the docker daemon"
install -d -m 0755 /etc/docker
# Containers get the host's real upstream resolvers, discovered rather than hardcoded. Docker's own
# default is 8.8.8.8, chosen because the host's /etc/resolv.conf points at systemd-resolved on
# loopback which means nothing inside a container's network namespace. On this network 8.8.8.8 does
# not answer, and the symptom is every build and every container failing to resolve any name at all —
# which reads as "the internet is broken", not as "the DNS server is wrong".
DNS_JSON=$(resolvectl status 2>/dev/null | awk '/DNS Servers:/{for(i=3;i<=NF;i++) print $i}' |
           grep -E '^[0-9]+\.' | sort -u | sed 's/.*/"&"/' | paste -sd, -)
[ -n "$DNS_JSON" ] || DNS_JSON='"77.88.8.8","77.88.8.1"'
# live-restore keeps containers serving across a daemon restart or upgrade, which is the difference
# between "docker was updated" and "the site was down". Logs go to journald so they land in the same
# place as everything else on this host and inherit its retention limits instead of growing forever
# in /var/lib/docker.
cat > /etc/docker/daemon.json <<JSON
{
  "live-restore": true,
  "log-driver": "journald",
  "userland-proxy": false,
  "no-new-privileges": true,
  "dns": [$DNS_JSON]
}
JSON
systemctl enable --now docker >/dev/null 2>&1
systemctl restart docker
docker info >/dev/null 2>&1 || die "docker daemon is not responding after install"

# The host firewall drops forwarded packets by default, which is correct for a machine that is not a
# router — but container traffic IS forwarded traffic, so without this every container is cut off from
# the network and the failure looks like "S3 is down". The canonical ruleset in
# deploy/host/harden-network-and-ssh.sh carries the same two lines; they are applied here as well so an
# already-hardened host need not be re-hardened — that script arms a dead-man timer and waits for a
# human to confirm connectivity, which is the wrong ceremony for adding two accept rules.
if ! grep -q 'bcb-blue' /etc/nftables.conf 2>/dev/null; then
  say "allowing container traffic through the host firewall"
  cp /etc/nftables.conf "/var/backups/nftables.pre-docker.$(date +%s).conf"
  awk '
    { print }
    /type filter hook forward priority filter; policy drop;/ && !done {
      print ""
      print "    # Container traffic: docker'"'"'s own rules live in the legacy ip filter table, but a packet"
      print "    # must clear both tables. Interface names are fixed in the compose file so this rule can"
      print "    # name them exactly instead of wildcarding every bridge on the host."
      print "    iifname { \"bcb-blue\", \"bcb-green\", \"docker0\" } accept"
      print "    oifname { \"bcb-blue\", \"bcb-green\", \"docker0\" } ct state established,related accept"
      done = 1
    }
  ' /etc/nftables.conf > /tmp/nftables.new
  nft -c -f /tmp/nftables.new || die "firewall edit does not parse; nothing applied, backup is in /var/backups"
  mv /tmp/nftables.new /etc/nftables.conf
  chmod 644 /etc/nftables.conf
  nft -f /etc/nftables.conf || die "failed to apply the firewall edit"
fi

# Docker writes its own firewall rules and is famously willing to expose a published port to the whole
# internet regardless of the host firewall. Every port in the compose file is published to 127.0.0.1
# explicitly for that reason; this check exists so a future edit that drops the prefix is caught here
# rather than by a stranger.
say "checking that docker has not opened anything to the outside"
if ss -tlnH | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|0\.0\.0\.0:(22|80|443)$|\[::\]:(22|80|443)$)' | grep -q .; then
  ss -tlnH | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|0\.0\.0\.0:(22|80|443)$|\[::\]:(22|80|443)$)' >&2
  die "something is listening publicly that should not be"
fi

# ---------------------------------------------------------------- layout
say "creating the pipeline layout"
install -d -m 0755 -o root -g root "$PIPELINE"
install -d -m 0750 -o root -g root "$ROOT/state"
install -d -m 0755 -o root -g root "$ROOT/src"
[ -d "$ROOT/env" ] || install -d -m 0750 -o root -g root "$ROOT/env"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for f in bcb-bluegreen-lib.sh bcb-deploy bcb-rollback bcb-status; do
  [ -f "$SRC_DIR/$f" ] || die "missing pipeline file next to this script: $f"
  install -m 0755 -o root -g root "$SRC_DIR/$f" "$PIPELINE/$f"
done
# The image definition is installed onto the host rather than read from the deployed checkout on
# purpose: the branch being deployed does not have to contain the pipeline that deploys it. Otherwise
# the first deploy of a branch written before this pipeline existed would fail on a missing file.
install -m 0644 -o root -g root "$SRC_DIR/../../docker/Dockerfile"         "$PIPELINE/Dockerfile"
install -m 0644 -o root -g root "$SRC_DIR/../../docker/docker-compose.yml" "$PIPELINE/docker-compose.yml"

cat > /etc/bcb-pipeline.conf <<EOF
# Read by every pipeline command. Root-owned; the deploy scripts refuse to run anywhere this does not match.
BCB_PROD_IP=$PROD_IP
BCB_BRANCH=$BRANCH
BCB_DEPLOY_KEY=$KEY
EOF
chmod 0644 /etc/bcb-pipeline.conf

# ---------------------------------------------------------------- github
if [ ! -f "$KEY" ]; then
  say "generating a deploy key for GitHub"
  install -d -m 0700 /root/.ssh
  ssh-keygen -t ed25519 -N '' -C "bcb-prod-deploy-$(hostname -s)" -f "$KEY" >/dev/null
  echo
  echo "  Add this as a READ-ONLY deploy key on the repository:"
  echo
  sed 's/^/    /' "$KEY.pub"
  echo
fi
ssh-keyscan -t ed25519 github.com 2>/dev/null | grep -q github.com &&
  { ssh-keyscan -t ed25519 github.com 2>/dev/null >> /root/.ssh/known_hosts; sort -u -o /root/.ssh/known_hosts /root/.ssh/known_hosts; }

CLONE_PENDING=0
if [ ! -d "$ROOT/src/.git" ]; then
  say "cloning the repository"
  # A missing clone is not fatal to the installation. The key has to be authorised by a human on
  # GitHub, and stopping here would leave the host without the commands, the sudo rule or the nginx
  # wiring — all of which are independent of the source and all of which would then need a second
  # run to appear. The deploy itself refuses to proceed without the checkout, which is the right
  # place for that refusal.
  if ! GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes" \
       git clone --branch "$BRANCH" "$REPO" "$ROOT/src" 2>/dev/null; then
    CLONE_PENDING=1
    printf '\033[33m !  clone failed: authorise the deploy key above on GitHub, then re-run this script\033[0m\n' >&2
  fi
fi

# ---------------------------------------------------------------- owner commands
say "installing the owner commands"
# Thin wrappers rather than shell aliases: they work in any shell, over ssh, and in a cron entry, and
# there is exactly one place where the sudo boundary is written down.
for pair in "deploy-prod:bcb-deploy" "rollback-prod:bcb-rollback" "prod-status:bcb-status"; do
  cmd="${pair%%:*}"; target="${pair##*:}"
  cat > "/usr/local/bin/$cmd" <<EOF
#!/bin/sh
exec sudo $PIPELINE/$target "\$@"
EOF
  chmod 0755 "/usr/local/bin/$cmd"
done

# The owner does NOT go into the docker group. Membership in it is equivalent to root without a
# password — any member can start a container that mounts the host filesystem — so it would quietly
# undo the account separation this host was built with. Instead the three specific scripts are
# allowed through sudo, and they are root-owned and not writable by the owner, so their content
# cannot be changed by the account they grant privilege to.
cat > /etc/sudoers.d/20-bcb-deploy <<EOF
# Production deploy commands. Password required (owner's ruling); the scripts themselves are root-owned.
$OWNER ALL=(root) $PIPELINE/bcb-deploy, $PIPELINE/bcb-rollback, $PIPELINE/bcb-status
EOF
chmod 0440 /etc/sudoers.d/20-bcb-deploy
visudo -cf /etc/sudoers.d/20-bcb-deploy >/dev/null || { rm -f /etc/sudoers.d/20-bcb-deploy; die "generated sudoers rule is invalid"; }

# ---------------------------------------------------------------- nginx
say "pointing nginx at the pipeline"
# A placeholder upstream so nginx starts before the first deploy. It points at the blue ports, which
# nothing is listening on yet; the site config below serves 503 until a colour is actually live.
[ -f /etc/nginx/conf.d/20-bcb-upstream.conf ] || cat > /etc/nginx/conf.d/20-bcb-upstream.conf <<'EOF'
# Written by the blue-green pipeline. Active colour: none yet
upstream bcb_webapp { server 127.0.0.1:6201; keepalive 32; }
upstream bcb_api    { server 127.0.0.1:3201; keepalive 32; }
EOF

if ! grep -q 'bcb_webapp' /etc/nginx/sites-available/bcb 2>/dev/null; then
  cp /etc/nginx/sites-available/bcb "/etc/nginx/sites-available/bcb.pre-bluegreen.$(date +%s)"
  python3 - <<'PY'
import re, pathlib
p = pathlib.Path('/etc/nginx/sites-available/bcb')
s = p.read_text()
# Replace only the placeholder 503 location, leaving the TLS and header configuration untouched.
new_loc = '''    location / {
        proxy_pass http://bcb_webapp;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        # A colour that is being switched away from finishes its in-flight requests; a colour that is
        # not up yet should not hang the browser for a minute before saying so.
        proxy_connect_timeout 5s;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }'''
s = re.sub(r'    location / \{\n(?:.*\n)*?    \}', new_loc, s, count=1)
p.write_text(s)
PY
fi
nginx -t >/dev/null 2>&1 || die "nginx config is invalid after the edit; the previous file is saved next to it"
systemctl reload nginx

say "done"
echo
echo "  The owner can now run, as $OWNER:"
echo "    deploy-prod            build and release the tip of $BRANCH"
echo "    rollback-prod          put the previous release back"
echo "    prod-status            what is live right now"
echo
echo "  Still needed before the first deploy:"
[ "$CLONE_PENDING" = 1 ] && echo "    - authorise the deploy key on GitHub and re-run this script"
echo "    - $ROOT/env/{api,webapp,media-worker}.prod"
