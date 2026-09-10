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

THERAPYSTO_ROOT=/opt/therapysto
THERAPYSTO_SRC="$THERAPYSTO_ROOT/src"
THERAPYSTO_ENV_DIR="$THERAPYSTO_ROOT/env"
THERAPYSTO_PIPELINE="$THERAPYSTO_ROOT/pipeline"
THERAPYSTO_STATE="$THERAPYSTO_ROOT/state"
THERAPYSTO_ACTIVE_FILE="$THERAPYSTO_STATE/active-colour"
THERAPYSTO_RELEASES_LOG="$THERAPYSTO_STATE/releases.log"
THERAPYSTO_UPSTREAM_CONF=/etc/nginx/conf.d/20-therapysto-upstream.conf
THERAPYSTO_IMAGE_REPO=therapysto-app
THERAPYSTO_KEEP_IMAGES="${THERAPYSTO_KEEP_IMAGES:-5}"

# Имя базы и окружение — из общего источника, того же, которым пользуется связывание видео.
# shellcheck source=deploy/host/prod/runtime-database.sh
. "$THERAPYSTO_PIPELINE/runtime-database.sh" 2>/dev/null ||
  . "$THERAPYSTO_SRC/deploy/host/prod/runtime-database.sh"

# Ports are per colour and bound to loopback only; nginx is the sole public door.
THERAPYSTO_BLUE_WEBAPP_PORT=6201
THERAPYSTO_BLUE_API_PORT=3201
THERAPYSTO_GREEN_WEBAPP_PORT=6202
THERAPYSTO_GREEN_API_PORT=3202

# Каждый цвет получает СВОЮ фиксированную подсеть вместо той, что docker выдаёт сам. Причина не в
# аккуратности: приложение ходит в PostgreSQL по TCP с клиентским сертификатом (порт-контекст), то
# есть база обязана слушать адрес шлюза этого моста, а firewall — пускать только с него. Плавающая
# подсеть означала бы, что после пересоздания сети слушающий адрес и правило перестают совпадать, и
# деплой падал бы на «база недоступна» без единой подсказки почему.
THERAPYSTO_BLUE_SUBNET=172.30.0.0/24
THERAPYSTO_BLUE_GATEWAY=172.30.0.1
THERAPYSTO_GREEN_SUBNET=172.31.0.0/24
THERAPYSTO_GREEN_GATEWAY=172.31.0.1

# Имя моста в ядре ограничено 15 символами (IFNAMSIZ), поэтому оно короче имени сети/проекта.
# Эти же строки стоят в правилах nftables — менять их можно только вместе с firewall.
THERAPYSTO_BLUE_IFACE=tsto-blue
THERAPYSTO_GREEN_IFACE=tsto-green

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
  local expected="${THERAPYSTO_PROD_IP:?THERAPYSTO_PROD_IP must be set in /etc/therapysto-pipeline.conf}" addr found=0
  for addr in $(hostname -I 2>/dev/null); do
    [ "$addr" = "$expected" ] && { found=1; break; }
  done
  [ "$found" = 1 ] || die "refusing to run: this host has no local IPv4 $expected"
}

require_pipeline() {
  require_root
  require_prod_host
  [ -d "$THERAPYSTO_PIPELINE" ] || die "pipeline is not installed: $THERAPYSTO_PIPELINE missing (run setup-docker-bluegreen.sh)"
  command -v docker >/dev/null || die "docker is not installed"
  docker info >/dev/null 2>&1 || die "docker daemon is not responding"
  mkdir -p "$THERAPYSTO_STATE"
  local f
  for f in api.prod webapp.prod media-worker.prod; do
    [ -f "$THERAPYSTO_ENV_DIR/$f" ] || die "environment file missing: $THERAPYSTO_ENV_DIR/$f"
  done
  # A build needs room. Running out of disk halfway through leaves a half-written image and a host
  # with no space to clean it up with, which is a much worse morning than refusing here.
  local avail_gb
  avail_gb=$(df -BG --output=avail "$THERAPYSTO_ROOT" | tail -1 | tr -dc '0-9')
  [ "${avail_gb:-0}" -ge 10 ] || die "only ${avail_gb}G free under $THERAPYSTO_ROOT; need at least 10G"

  # Обязательные настройки — ТОЛЬКО читаются. Раньше эта проверка жила в шаге, который заодно
  # переписывал env; шаг убран, а проверка нужна: пустой APP_BASE_URL превращается в отказ маршрутизации
  # поверхностей уже после переключения, то есть в сломанный прод вместо несостоявшейся выкладки.
  local key
  for key in APP_BASE_URL PATIENT_APP_ORIGIN CUSTOM_DOMAIN_EDGE_IP CUSTOM_DOMAIN_CNAME_TARGET PATIENT_APP_NAME; do
    grep -q "^$key=" "$THERAPYSTO_ENV_DIR/webapp.prod" ||
      die "в webapp.prod не заполнен $key — заполнить по deploy/env/.env.webapp.prod.example"
  done
}

# ------------------------------------------------------------------ colours

active_colour() { [ -f "$THERAPYSTO_ACTIVE_FILE" ] && cat "$THERAPYSTO_ACTIVE_FILE" || echo none; }
idle_colour()   { case "$(active_colour)" in blue) echo green;; green) echo blue;; *) echo blue;; esac; }

colour_webapp_port() { case "$1" in blue) echo $THERAPYSTO_BLUE_WEBAPP_PORT;; green) echo $THERAPYSTO_GREEN_WEBAPP_PORT;; *) return 1;; esac; }
colour_api_port()    { case "$1" in blue) echo $THERAPYSTO_BLUE_API_PORT;;    green) echo $THERAPYSTO_GREEN_API_PORT;;    *) return 1;; esac; }
colour_subnet()      { case "$1" in blue) echo $THERAPYSTO_BLUE_SUBNET;;     green) echo $THERAPYSTO_GREEN_SUBNET;;     *) return 1;; esac; }
colour_gateway()     { case "$1" in blue) echo $THERAPYSTO_BLUE_GATEWAY;;    green) echo $THERAPYSTO_GREEN_GATEWAY;;    *) return 1;; esac; }
colour_iface()       { case "$1" in blue) echo $THERAPYSTO_BLUE_IFACE;;      green) echo $THERAPYSTO_GREEN_IFACE;;      *) return 1;; esac; }

# Имя, под которым вебапп отвечает СЕБЕ и своим фоновым процессам. Берётся не из головы и не копией
# строки в конфиг: маршрутизация поверхностей отказывает закрыто на незнакомом `Host`, поэтому имя
# выводится из APP_BASE_URL тем же единственным seam'ом, что и health-проверка деплоя.
surface_host() {
  ( set -a; . "$THERAPYSTO_ENV_DIR/webapp.prod"; set +a
    node "$THERAPYSTO_SRC/deploy/host/webapp-health-host.mjs" ) ||
    die "cannot derive the surface host from APP_BASE_URL in webapp.prod"
}

# Группа, которой на хосте открыты клиентские ключи порт-контекста. Спрашивается у хоста, а не
# записывается числом: GID выдаёт groupadd, и зашитая копия разошлась бы с реальностью молча —
# контейнер тогда не прочитал бы ключ, а сообщение было бы про «нечитаемый PEM».
app_key_gid() {
  local gid
  gid=$(getent group therapysto-app-prod | cut -d: -f3)
  [ -n "$gid" ] || die "host group therapysto-app-prod is missing; the port-context keys have no readable group"
  printf '%s\n' "$gid"
}

# Каталог возможностей порт-контекста — список «какая операция ходит в базу под какой ролью». Он
# ВЫВОДИТСЯ из выкладываемого коммита, то есть это часть кода, а не настройка, и потому он не хранится
# в env и никем в env не дописывается: файл настроек человек заполняет один раз, автоматике там делать
# нечего. Считается здесь и уезжает в контейнер обычной переменной окружения.
#
# Имя базы читается из env — это как раз настоящая настройка, и читать её оттуда правильно; запись —
# нет. Значение считается один раз за прогон: compose зовётся и на up, и на down, и на ps, а генератор
# на каждом вызове — это несколько секунд впустую.
THERAPYSTO_PC_WEBAPP=""
THERAPYSTO_PC_INTEGRATOR=""

port_context_value() {
  local port="$1" db env_name
  db=$(THERAPYSTO_ENV_DIR="$THERAPYSTO_ENV_DIR" runtime_database) ||
    die "не удалось определить базу рантайма для каталога порт-контекста"
  env_name=$(runtime_environment "$db") || die "неизвестное окружение для базы $db"
  node --experimental-strip-types "$THERAPYSTO_SRC/deploy/postgres/privileges/generate-cli.mjs" \
    --env "$env_name" --db "$db" --port-context-value "$port" ||
    die "не удалось построить каталог порт-контекста для $port"
}

port_context_webapp() {
  [ -n "$THERAPYSTO_PC_WEBAPP" ] || THERAPYSTO_PC_WEBAPP=$(port_context_value webapp)
  printf '%s' "$THERAPYSTO_PC_WEBAPP"
}

port_context_integrator() {
  [ -n "$THERAPYSTO_PC_INTEGRATOR" ] || THERAPYSTO_PC_INTEGRATOR=$(port_context_value integrator)
  printf '%s' "$THERAPYSTO_PC_INTEGRATOR"
}

# Every compose invocation goes through here so the project name, file and variables can never drift
# between the deploy path and the rollback path.
compose() {
  local colour="$1" image="$2"; shift 2
  THERAPYSTO_IMAGE="$image" \
  THERAPYSTO_COLOUR="$colour" \
  THERAPYSTO_ENV_DIR="$THERAPYSTO_ENV_DIR" \
  WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON="$(port_context_webapp)" \
  INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON="$(port_context_integrator)" \
  THERAPYSTO_WEBAPP_PORT="$(colour_webapp_port "$colour")" \
  THERAPYSTO_API_PORT="$(colour_api_port "$colour")" \
  THERAPYSTO_NETWORK_SUBNET="$(colour_subnet "$colour")" \
  THERAPYSTO_NETWORK_GATEWAY="$(colour_gateway "$colour")" \
  THERAPYSTO_BRIDGE_IFACE="$(colour_iface "$colour")" \
  THERAPYSTO_SURFACE_HOST="$(surface_host)" \
  THERAPYSTO_APP_KEY_GID="$(app_key_gid)" \
  docker compose -p "therapysto-$colour" -f "$THERAPYSTO_PIPELINE/docker-compose.yml" "$@"
}

# The image a colour is actually running, asked of the container rather than of our own notes.
colour_running_image() {
  docker inspect --format '{{.Config.Image}}' "therapysto-$1-webapp-1" 2>/dev/null || true
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
  local colour="$1" deadline=$((SECONDS + ${THERAPYSTO_HEALTH_TIMEOUT:-180})) svc state
  say "waiting for $colour to report healthy"
  while [ $SECONDS -lt $deadline ]; do
    local all_ok=1
    for svc in webapp api; do
      state=$(docker inspect --format '{{.State.Health.Status}}' "therapysto-$colour-$svc-1" 2>/dev/null || echo missing)
      case "$state" in
        healthy)   ;;
        unhealthy) warn "$svc is unhealthy"; return 1 ;;
        *)         all_ok=0 ;;
      esac
    done
    [ "$all_ok" = 1 ] && { info "webapp and api are healthy"; return 0; }
    sleep 3
  done
  warn "$colour did not become healthy within ${THERAPYSTO_HEALTH_TIMEOUT:-180}s"
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
  [ -f "$THERAPYSTO_UPSTREAM_CONF" ] && cp "$THERAPYSTO_UPSTREAM_CONF" "$backup"
  cat > "$THERAPYSTO_UPSTREAM_CONF" <<EOF
# Written by the blue-green pipeline. Active colour: $colour
upstream therapysto_webapp { server 127.0.0.1:$(colour_webapp_port "$colour"); keepalive 32; }
upstream therapysto_api    { server 127.0.0.1:$(colour_api_port "$colour");    keepalive 32; }
EOF
  if ! nginx -t >/dev/null 2>&1; then
    [ -s "$backup" ] && cp "$backup" "$THERAPYSTO_UPSTREAM_CONF" || rm -f "$THERAPYSTO_UPSTREAM_CONF"
    rm -f "$backup"
    die "nginx rejected the new upstream config; nothing was switched"
  fi
  rm -f "$backup"
  systemctl reload nginx || die "nginx reload failed"
  echo "$colour" > "$THERAPYSTO_ACTIVE_FILE"
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
  compose "$colour" "${THERAPYSTO_IMAGE:-$THERAPYSTO_IMAGE_REPO:latest}" --profile singletons down --remove-orphans 2>/dev/null
}

record_release() {
  local colour="$1" image="$2" commit="$3" kind="$4"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$kind" "$colour" "$image" "$commit" >> "$THERAPYSTO_RELEASES_LOG"
}

# Old images are what rollback runs on, so they are kept deliberately rather than pruned by a
# scheduled `docker system prune` that has no idea which ones matter.
prune_old_images() {
  local keep="$THERAPYSTO_KEEP_IMAGES" img
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}' |
    awk -v repo="$THERAPYSTO_IMAGE_REPO" -F'\t' '$1 ~ "^"repo":" {print}' |
    sort -k2 -r | tail -n +$((keep + 1)) | cut -f1 |
  while read -r img; do
    [ -n "$img" ] || continue
    docker rmi "$img" >/dev/null 2>&1 && info "removed old image $img"
  done
  return 0
}
