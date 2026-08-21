#!/bin/bash
# Shared mechanics for the blue-green pipeline: where state lives, which colour is live, how a colour
# is brought up, health-gated, switched onto, and torn down.
#
# Deploy and rollback are the same manoeuvre — put an image on the idle colour, prove it serves, move
# nginx, retire the old colour — differing only in where the image comes from: deploy builds one,
# rollback reuses one. Keeping that manoeuvre in a single place is deliberate: a rollback path that is
# written separately from the deploy path is a path that is never exercised until the night it is
# needed, and by then it has quietly rotted.

set -uo pipefail

BCB_ROOT=/opt/bersoncarebot
BCB_SRC="$BCB_ROOT/src"
BCB_ENV_DIR="$BCB_ROOT/env"
BCB_PIPELINE="$BCB_ROOT/pipeline"
BCB_STATE="$BCB_ROOT/state"
BCB_ACTIVE_FILE="$BCB_STATE/active-colour"
BCB_RELEASES_LOG="$BCB_STATE/releases.log"
BCB_UPSTREAM_CONF=/etc/nginx/conf.d/20-bcb-upstream.conf
BCB_IMAGE_REPO=bcb-app
BCB_KEEP_IMAGES="${BCB_KEEP_IMAGES:-5}"

# Ports are per colour and bound to loopback only; nginx is the sole public door.
BCB_BLUE_WEBAPP_PORT=6201
BCB_BLUE_API_PORT=3201
BCB_GREEN_WEBAPP_PORT=6202
BCB_GREEN_API_PORT=3202

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m !  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ preflight

require_root() { [ "$(id -u)" = 0 ] || die "must run as root (use the deploy-prod / rollback-prod alias)"; }

# The whole point of a production gate is that it refuses to run somewhere else. A pipeline that is
# happy to deploy onto whatever machine it finds itself on is how a test box becomes production by
# accident. Identity is asserted against the interface list, not the hostname alone, because a
# hostname is one `hostnamectl` away from being a lie.
require_prod_host() {
  local expected="${BCB_PROD_IP:?BCB_PROD_IP must be set in /etc/bcb-pipeline.conf}" addr found=0
  for addr in $(hostname -I 2>/dev/null); do
    [ "$addr" = "$expected" ] && { found=1; break; }
  done
  [ "$found" = 1 ] || die "refusing to run: this host has no local IPv4 $expected"
}

require_pipeline() {
  require_root
  require_prod_host
  [ -d "$BCB_PIPELINE" ] || die "pipeline is not installed: $BCB_PIPELINE missing (run setup-docker-bluegreen.sh)"
  command -v docker >/dev/null || die "docker is not installed"
  docker info >/dev/null 2>&1 || die "docker daemon is not responding"
  mkdir -p "$BCB_STATE"
  local f
  for f in api.prod webapp.prod media-worker.prod; do
    [ -f "$BCB_ENV_DIR/$f" ] || die "environment file missing: $BCB_ENV_DIR/$f"
  done
  # A build needs room. Running out of disk halfway through leaves a half-written image and a host
  # with no space to clean it up with, which is a much worse morning than refusing here.
  local avail_gb
  avail_gb=$(df -BG --output=avail "$BCB_ROOT" | tail -1 | tr -dc '0-9')
  [ "${avail_gb:-0}" -ge 10 ] || die "only ${avail_gb}G free under $BCB_ROOT; need at least 10G"
}

# ------------------------------------------------------------------ colours

active_colour() { [ -f "$BCB_ACTIVE_FILE" ] && cat "$BCB_ACTIVE_FILE" || echo none; }
idle_colour()   { case "$(active_colour)" in blue) echo green;; green) echo blue;; *) echo blue;; esac; }

colour_webapp_port() { case "$1" in blue) echo $BCB_BLUE_WEBAPP_PORT;; green) echo $BCB_GREEN_WEBAPP_PORT;; *) return 1;; esac; }
colour_api_port()    { case "$1" in blue) echo $BCB_BLUE_API_PORT;;    green) echo $BCB_GREEN_API_PORT;;    *) return 1;; esac; }

# Every compose invocation goes through here so the project name, file and variables can never drift
# between the deploy path and the rollback path.
compose() {
  local colour="$1" image="$2"; shift 2
  BCB_IMAGE="$image" \
  BCB_COLOUR="$colour" \
  BCB_ENV_DIR="$BCB_ENV_DIR" \
  BCB_WEBAPP_PORT="$(colour_webapp_port "$colour")" \
  BCB_API_PORT="$(colour_api_port "$colour")" \
  docker compose -p "bcb-$colour" -f "$BCB_PIPELINE/docker-compose.yml" "$@"
}

# The image a colour is actually running, asked of the container rather than of our own notes.
colour_running_image() {
  docker inspect --format '{{.Config.Image}}' "bcb-$1-webapp-1" 2>/dev/null || true
}

# ------------------------------------------------------------------ bring up and gate

start_colour_frontends() {
  local colour="$1" image="$2"
  say "starting $colour on $image (webapp + api)"
  compose "$colour" "$image" up -d --remove-orphans webapp api || die "failed to start $colour"
}

# Health is read from docker's own healthcheck, which runs inside the container against its own port.
# Probing the published port from outside would also pass while the container is being torn down by a
# restart loop; the container's verdict is the honest one. `unhealthy` fails immediately instead of
# waiting out the timeout — the retries already happened inside the healthcheck.
wait_for_colour_health() {
  local colour="$1" deadline=$((SECONDS + ${BCB_HEALTH_TIMEOUT:-180})) svc state
  say "waiting for $colour to report healthy"
  while [ $SECONDS -lt $deadline ]; do
    local all_ok=1
    for svc in webapp api; do
      state=$(docker inspect --format '{{.State.Health.Status}}' "bcb-$colour-$svc-1" 2>/dev/null || echo missing)
      case "$state" in
        healthy)   ;;
        unhealthy) warn "$svc is unhealthy"; return 1 ;;
        *)         all_ok=0 ;;
      esac
    done
    [ "$all_ok" = 1 ] && { info "webapp and api are healthy"; return 0; }
    sleep 3
  done
  warn "$colour did not become healthy within ${BCB_HEALTH_TIMEOUT:-180}s"
  return 1
}

# ------------------------------------------------------------------ the switch

# Writing the file and reloading is the entire cutover: nginx finishes in-flight requests against the
# old workers and sends new ones to the new colour, so no request is dropped. The config is validated
# before the reload and the previous file is restored if validation fails — an invalid include would
# otherwise take the whole site down at the next reload, long after this script has exited happily.
switch_nginx_to() {
  local colour="$1" backup
  backup=$(mktemp)
  [ -f "$BCB_UPSTREAM_CONF" ] && cp "$BCB_UPSTREAM_CONF" "$backup"
  cat > "$BCB_UPSTREAM_CONF" <<EOF
# Written by the blue-green pipeline. Active colour: $colour
upstream bcb_webapp { server 127.0.0.1:$(colour_webapp_port "$colour"); keepalive 32; }
upstream bcb_api    { server 127.0.0.1:$(colour_api_port "$colour");    keepalive 32; }
EOF
  if ! nginx -t >/dev/null 2>&1; then
    [ -s "$backup" ] && cp "$backup" "$BCB_UPSTREAM_CONF" || rm -f "$BCB_UPSTREAM_CONF"
    rm -f "$backup"
    die "nginx rejected the new upstream config; nothing was switched"
  fi
  rm -f "$backup"
  systemctl reload nginx || die "nginx reload failed"
  echo "$colour" > "$BCB_ACTIVE_FILE"
  say "nginx now serves $colour"
}

# Background processes move after the switch, not before: they are singletons, so there is a moment
# with none running, and that moment belongs where the new code is already proven to serve.
move_singletons_to() {
  local new="$1" old="$2" image="$3"
  if [ "$old" != none ] && [ "$old" != "$new" ]; then
    say "stopping background processes on $old"
    compose "$old" "$(colour_running_image "$old")" --profile singletons stop scheduler media-worker 2>/dev/null
  fi
  say "starting background processes on $new"
  compose "$new" "$image" --profile singletons up -d scheduler media-worker ||
    die "background processes failed to start on $new — nginx is already on $new, investigate before rolling back"
}

retire_colour() {
  local colour="$1"
  [ "$colour" = none ] && return 0
  say "retiring $colour"
  compose "$colour" "$(colour_running_image "$colour")" --profile singletons down --remove-orphans 2>/dev/null
}

# Used when the new colour fails its gate: undo everything this run started, touch nothing else.
abandon_colour() {
  local colour="$1"
  warn "tearing down $colour; the live colour was not touched"
  compose "$colour" "${BCB_IMAGE:-$BCB_IMAGE_REPO:latest}" --profile singletons down --remove-orphans 2>/dev/null
}

record_release() {
  local colour="$1" image="$2" commit="$3" kind="$4"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$kind" "$colour" "$image" "$commit" >> "$BCB_RELEASES_LOG"
}

# Old images are what rollback runs on, so they are kept deliberately rather than pruned by a
# scheduled `docker system prune` that has no idea which ones matter.
prune_old_images() {
  local keep="$BCB_KEEP_IMAGES" img
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}' |
    awk -v repo="$BCB_IMAGE_REPO" -F'\t' '$1 ~ "^"repo":" {print}' |
    sort -k2 -r | tail -n +$((keep + 1)) | cut -f1 |
  while read -r img; do
    [ -n "$img" ] || continue
    docker rmi "$img" >/dev/null 2>&1 && info "removed old image $img"
  done
  return 0
}
