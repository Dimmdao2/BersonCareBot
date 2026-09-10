#!/usr/bin/env bash
# Убирает с нового прода последнее живое старое имя в nginx: conf.d/10-bcb-tls.conf, /etc/ssl/bcb,
# зону сессий BcbSSL и маркер `# bcb-test-allowlist` в рабочем vhost.
#
# Почему это отдельный шаг, а не «поправить руками». Файл 10-*-tls.conf лежит в http-контексте, то есть
# задаёт TLS ВСЕМ сайтам хоста — и приложению, и meet. Переименование такого файла — это на секунду
# состояние, когда ssl_dhparam указывает в никуда или ssl_prefer_server_ciphers объявлен дважды; и то и
# другое роняет `nginx -t`, а если это заметить только при следующем reboot — сайт не поднимется вообще.
# Поэтому: новый файл пишется РЯДОМ со старым материалом (каталог копируется, не переносится), проверка
# `nginx -t` идёт ДО reload, при её отказе старый файл возвращается на место, и только после успешного
# ответа сервера старое имя уходит в архив.
#
# Запускать на хосте прода: bash rename-nginx-to-therapysto.sh --check | --apply
set -euo pipefail

MODE="${1:---check}"
STATE=/opt/therapysto/state
TS=$(date +%Y%m%d-%H%M%S)
OLD_CONF=/etc/nginx/conf.d/10-bcb-tls.conf
NEW_CONF=/etc/nginx/conf.d/10-therapysto-tls.conf
OLD_SSL=/etc/ssl/bcb
NEW_SSL=/etc/ssl/therapysto
VHOST=/etc/nginx/sites-available/therapysto

log()  { echo "[nginx-rename] $*"; }
die()  { echo "[nginx-rename] FATAL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "must run as root"
expected=135.106.187.95
case " $(hostname -I) " in *" $expected "*) : ;; *) die "это не новый прод: нет локального IPv4 $expected" ;; esac

# Отвечает ли сервер сейчас — снимаем ДО правок, чтобы потом сравнивать с тем же числом, а не с ожиданием.
probe() { curl -kso /dev/null -w '%{http_code}' --resolve "$1:443:127.0.0.1" "https://$1/" 2>/dev/null || echo 000; }
BEFORE_APP=$(probe app.bersoncare.ru)
BEFORE_MEET=$(probe meet.therapysto.ru)

echo "--- сейчас ---"
echo "  $OLD_CONF            : $([ -e "$OLD_CONF" ] && echo есть || echo нет)"
echo "  $NEW_CONF     : $([ -e "$NEW_CONF" ] && echo есть || echo нет)"
echo "  $OLD_SSL                       : $([ -d "$OLD_SSL" ] && echo есть || echo нет)"
echo "  маркер bcb-test-allowlist в vhost   : $(grep -c 'bcb-test-allowlist' "$VHOST" || true)"
echo "  ссылка на 10-bcb-tls в nginx.conf   : $(grep -c '10-bcb-tls' /etc/nginx/nginx.conf || true)"
echo "  мёртвые vhost bcb.pre-*             : $(find /etc/nginx/sites-available -maxdepth 1 -name 'bcb.pre-*' | wc -l)"
echo "  app.bersoncare.ru=$BEFORE_APP  meet.therapysto.ru=$BEFORE_MEET"

[ "$MODE" = --apply ] || { echo; log "--check: ничего не менял"; exit 0; }

nginx -t 2>/dev/null || die "nginx -t падает ЕЩЁ ДО правок — сначала разобраться с этим"
if [ "$BEFORE_APP" = 000 ]; then die "приложение сейчас не отвечает — не время переименовывать TLS"; fi

# 1. Материал: копия, не перенос. Пока reload не прошёл, старый ssl_dhparam обязан оставаться читаемым.
if [ -d "$OLD_SSL" ] && [ ! -d "$NEW_SSL" ]; then
  cp -a "$OLD_SSL" "$NEW_SSL"
  log "скопировал $OLD_SSL -> $NEW_SSL"
fi
[ -s "$NEW_SSL/dhparam.pem" ] || die "нет $NEW_SSL/dhparam.pem — новый конфиг сослался бы в пустоту"

# 2. Новый конфиг. Содержимое — то же, что пишет deploy/host/setup-nginx-tls.sh, с новыми именами.
cat > "$NEW_CONF" <<EOF
# Managed by deploy/host/setup-nginx-tls.sh
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_dhparam $NEW_SSL/dhparam.pem;
ssl_session_timeout 1d;
ssl_session_cache shared:TherapystoSSL:10m;
ssl_session_tickets off;

# The version banner tells an attacker which known bugs to try first and helps nobody else.
server_tokens off;
EOF

# 3. Старый — В СТОРОНУ, не «пусть лежит»: две ssl_prefer_server_ciphers в http-контексте это отказ nginx -t.
BACKUP=$(mktemp -d)
if [ -e "$OLD_CONF" ]; then mv "$OLD_CONF" "$BACKUP/10-bcb-tls.conf"; fi

restore() {
  log "ОТКАТ: возвращаю $OLD_CONF"
  if [ -e "$BACKUP/10-bcb-tls.conf" ]; then mv "$BACKUP/10-bcb-tls.conf" "$OLD_CONF"; fi
  rm -f "$NEW_CONF"
  # Откат обязан ДОЙТИ до сообщения о причине, поэтому его собственный отказ здесь не фатален,
  # а громко печатается: молча выйти на этом месте — оставить читателя без диагноза.
  if nginx -t && systemctl reload nginx; then log "откат применён, конфиг прежний"; 
  else log "ВНИМАНИЕ: откат не перезагрузил nginx — проверить руками: nginx -t"; fi
}

# 4. Текстовые следы: комментарий в nginx.conf и маркер в рабочем vhost. Ни то ни другое не директива —
#    поведение сервера от них не зависит, но именно они всплывают в поиске «старых имён на хосте».
sed -i -E 's@# superseded by conf\.d/10-bcb-tls\.conf:@# superseded by conf.d/10-therapysto-tls.conf:@' /etc/nginx/nginx.conf
sed -i 's@# bcb-test-allowlist@# therapysto-test-allowlist@' "$VHOST"

if ! nginx -t 2>&1; then
  restore
  die "новый конфиг не прошёл nginx -t — вернул как было"
fi
systemctl reload nginx || { restore; die "reload не прошёл — вернул как было"; }

AFTER_APP=$(probe app.bersoncare.ru)
AFTER_MEET=$(probe meet.therapysto.ru)
log "после reload: app.bersoncare.ru=$AFTER_APP (было $BEFORE_APP), meet=$AFTER_MEET (было $BEFORE_MEET)"
[ "$AFTER_APP" = "$BEFORE_APP" ] || { restore; die "приложение стало отвечать иначе — вернул как было"; }
[ "$AFTER_MEET" = "$BEFORE_MEET" ] || { restore; die "meet стал отвечать иначе — вернул как было"; }

# 5. Только теперь — архив старого. Сервер уже доказал, что живёт без него.
#    Архив собирается из staging-каталога, а не списком путей с несколькими -C: удаление идёт следом,
#    и «tar частично не нашёл файл» не должно тихо превратиться в «удалил без копии».
install -d -m 0750 "$STATE"
stage=$(mktemp -d)
if [ -d "$OLD_SSL" ]; then cp -a "$OLD_SSL" "$stage/etc-ssl-bcb"; fi
if [ -e "$BACKUP/10-bcb-tls.conf" ]; then cp -a "$BACKUP/10-bcb-tls.conf" "$stage/"; fi
while IFS= read -r dead; do cp -a "$dead" "$stage/"; done \
  < <(find /etc/nginx/sites-available -maxdepth 1 -name 'bcb.pre-*')
ARCHIVE="$STATE/removed-nginx-old-names-$TS.tar.gz"
tar -czf "$ARCHIVE" -C "$stage" . || die "архив не собрался — НИЧЕГО не удаляю"
chmod 0600 "$ARCHIVE"
rm -rf "$stage"

rm -rf "$OLD_SSL" "$BACKUP"
find /etc/nginx/sites-available -maxdepth 1 -name 'bcb.pre-*' -delete

echo
log "готово. Архив: $ARCHIVE"
echo "--- проверка ---"
grep -rl 'bcb\|bersoncarebot' /etc/nginx /etc/ssl 2>/dev/null || echo "  старых имён в /etc/nginx и /etc/ssl не осталось"
