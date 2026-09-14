#!/usr/bin/env bash
# Единственный путь, которым действующий сертификат попадает к coturn. Coturn работает под не-root
# учёткой и до хранилища сертификатов не дотягивается, поэтому получает атомарную копию 0600 под CONFIG.
# Запускать от root.
#
# Откуда берётся источник, какие SAN обязательны и как скрипт вызывается — свойства профиля
# (bin/lib/profile.sh):
#   TEST: источник certbot, скрипт стоит deploy-hook`ом и срабатывает на продлении линии;
#   PROD: источник — хранилище Caddy, скрипт ходит по таймеру therapysto-turn-cert-sync.timer, потому
#         что у стокового Caddy нет хука «выполни команду после выпуска».
# Повторный запуск при неизменившемся сертификате ничего не делает и coturn не трогает.
set -euo pipefail

# shellcheck source=lib/profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/profile.sh"

ENV_FILE="$JITSI_ENV_FILE"
TURN_ENV_FILE="$JITSI_TURN_ENV_FILE"

fail() { echo "[jitsi-${JITSI_DEPLOYMENT}-tls] FATAL: $*" >&2; exit 1; }
say()  { echo "[jitsi-${JITSI_DEPLOYMENT}-tls] $*"; }
[[ "$(id -u)" == 0 ]] || fail "run as root: the private key is readable by root only"

jitsi_require_host

# Откуда берётся сертификат — свойство профиля, а не этого скрипта.
#   certbot (TEST): линия ACME в /etc/letsencrypt, скрипт работает как deploy-hook.
#   caddy   (PROD): хранилище Caddy, скрипт работает по таймеру. Никакого certbot на этом хосте нет.
case "${JITSI_TLS_SOURCE:-certbot}" in
  certbot)
    EXPECTED_LINEAGE="/etc/letsencrypt/live/$JITSI_TLS_LINEAGE"
    LINEAGE="${RENEWED_LINEAGE:-$EXPECTED_LINEAGE}"
    if [[ "$LINEAGE" != "$EXPECTED_LINEAGE" ]]; then
      if [[ -n "${RENEWED_LINEAGE:-}" ]]; then
        say "skipping unrelated renewed lineage"
        exit 0
      fi
      fail "unexpected certificate lineage: $LINEAGE"
    fi
    source_cert="$LINEAGE/fullchain.pem"
    source_key="$LINEAGE/privkey.pem"
    ;;
  caddy)
    # Caddy выпускает по сертификату на имя и хранит их файлами под своим каталогом данных. Каталог
    # берём из env-файла эджа, а не угадываем: он там и объявлен, и меняется вместе с эджем.
    caddy_data_dir=""
    if [[ -r "$JITSI_CADDY_ENV_FILE" ]]; then
      caddy_data_dir="$(sed -n 's/^CADDY_DATA_DIR=//p' "$JITSI_CADDY_ENV_FILE" | tail -1)"
      caddy_data_dir="${caddy_data_dir%\"}"; caddy_data_dir="${caddy_data_dir#\"}"
    fi
    caddy_data_dir="${caddy_data_dir:-/opt/therapysto/state/caddy}"
    [[ -d "$caddy_data_dir/certificates" ]] \
      || fail "в хранилище Caddy нет каталога сертификатов: $caddy_data_dir/certificates"
    # Промежуточный каталог — это имя каталога ACME-сервера (боевой/staging). Перебираем, а не
    # зашиваем: смена CA не должна тихо оставить coturn со старым файлом.
    source_cert=""
    while IFS= read -r candidate; do
      [[ -s "$candidate" ]] || continue
      source_cert="$candidate"
      source_key="${candidate%.crt}.key"
      break
    done < <(find "$caddy_data_dir/certificates" -type f \
               -path "*/$JITSI_TURN_HOST/$JITSI_TURN_HOST.crt" 2>/dev/null | sort)
    [[ -n "$source_cert" ]] \
      || fail "Caddy ещё не выпустил сертификат на $JITSI_TURN_HOST — проверь, что имя описано в Caddyfile и эдж поднят"
    ;;
  *)
    fail "неизвестный JITSI_TLS_SOURCE='${JITSI_TLS_SOURCE:-}' — допустимы только certbot и caddy"
    ;;
esac

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

[[ -s "$source_cert" && -s "$source_key" ]] || fail "источник сертификата неполон: $source_cert"
# Требуемый набор SAN — свойство профиля. На TEST это вся линия сразу (один сертификат на meet и turn),
# на PROD только turn: meet там отдаёт Caddy своим отдельным сертификатом. Разбиение по пробелам —
# намеренное чтение этого списка.
# shellcheck disable=SC2086
for expected_host in ${JITSI_COTURN_CERT_HOSTS:-$JITSI_CERT_HOSTS}; do
  openssl x509 -in "$source_cert" -noout -checkhost "$expected_host" >/dev/null \
    || fail "certificate does not cover $expected_host"
done
openssl x509 -in "$source_cert" -noout -checkend 86400 >/dev/null \
  || fail "certificate expires in less than 24 hours"

target_dir="$CONFIG/coturn/tls"
# Скрипт вызывается по таймеру, то есть чаще, чем сертификат меняется. Перезапуск coturn рвёт идущие
# звонки, поэтому сверяем содержимое и на совпадении не трогаем ничего.
if [[ -s "$target_dir/fullchain.pem" && -s "$target_dir/privkey.pem" ]] \
   && cmp -s "$source_cert" "$target_dir/fullchain.pem" \
   && cmp -s "$source_key" "$target_dir/privkey.pem"; then
  say "сертификат coturn уже совпадает с источником — ничего не меняю"
  exit 0
fi

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
