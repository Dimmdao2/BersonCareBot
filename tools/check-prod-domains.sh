#!/usr/bin/env bash
# Проверка доменов, разведения кабинетов и брендинга на новом проде.
#
# Запускается С DEV-БОКСА: на время проб хост пускает только его адрес, снаружи всё отдаёт 403.
# Ничего не меняет — только читает. Проверки без входа в аккаунт; те, что требуют сессии, помечены
# в отчёте как ручные.
set -uo pipefail

STAFF=therapysto.ru
ADMIN=admin.therapysto.ru
PATIENT=therapygo.ru
BRANDED=berson.therapygo.ru
CUSTOM=app.bersoncare.ru
UNKNOWN=zzz-nonexistent.therapygo.ru
OLD=bersoncare.ru

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

code() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$@"; }
body() { curl -s -m 15 "$@"; }

head "TLS и доступность"
for h in "$STAFF" www."$STAFF" "$ADMIN" "$PATIENT" www."$PATIENT" "$BRANDED" "$CUSTOM"; do
  v=$(curl -s -o /dev/null -w '%{ssl_verify_result}' -m 15 "https://$h/" 2>/dev/null)
  [ "$v" = 0 ] && ok "$h — сертификат валиден" || bad "$h" "ssl_verify_result=$v"
done

head "HTTP → HTTPS"
for h in "$STAFF" "$PATIENT" "$CUSTOM"; do
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' -m 15 "http://$h/")
  case "$loc" in https://$h/*) ok "$h — редирект на https";; *) bad "$h" "редирект ведёт в «$loc»";; esac
done

head "Незнакомый Host закрыт"
c=$(code "https://$UNKNOWN/")
[ "$c" = 404 ] && ok "$UNKNOWN → 404, платформа не подставляется" || bad "$UNKNOWN" "ответ $c, ожидался 404"

head "Разведение поверхностей"
s=$(body "https://$STAFF/"); p=$(body "https://$PATIENT/")
grep -qi "therapysto" <<<"$s" && ok "$STAFF — имя Therapysto в разметке" || bad "$STAFF" "имени Therapysto нет"
grep -qi "therapygo" <<<"$p" && ok "$PATIENT — имя Therapygo в разметке" || bad "$PATIENT" "имени Therapygo нет"
grep -qi "therapygo" <<<"$s" && bad "$STAFF" "на staff-поверхности встречается Therapygo" || ok "$STAFF — без пациентского имени"
c=$(code "https://$ADMIN/"); [ "$c" = 200 ] && ok "$ADMIN отвечает" || bad "$ADMIN" "ответ $c"

head "Манифест PWA свой на каждом хосте"
for h in "$STAFF" "$PATIENT" "$BRANDED"; do
  m=$(body "https://$h/manifest.webmanifest")
  n=$(sed -n 's/.*"name" *: *"\([^"]*\)".*/\1/p' <<<"$m" | head -1)
  [ -n "$n" ] && ok "$h — манифест «$n»" || bad "$h" "манифест пуст или без имени"
done

head "Брендированные хосты"
for h in "$BRANDED" "$CUSTOM"; do
  c=$(code "https://$h/")
  case "$c" in 200) ok "$h отвечает 200";; 404) bad "$h" "404 — в базе нет клиники с этим хостом/слагом";; *) bad "$h" "ответ $c";; esac
done

head "Старый прод не задет"
ip=$(dig +short A "$OLD" @8.8.8.8 | head -1)
[ "$ip" = "135.106.162.170" ] && ok "$OLD по-прежнему на аделаиде" || bad "$OLD" "смотрит на $ip"
c=$(code "https://$OLD/"); [ "$c" = 200 ] && ok "$OLD отвечает 200" || bad "$OLD" "ответ $c"

head "Замок на время проб"
printf '  · снаружи проверяется отдельно: с самого прода на свой внешний адрес должно быть 403\n'

printf '\n\033[1mИтог: %d пройдено, %d провалено\033[0m\n' "$pass" "$fail"
cat <<'M'

Требуют входа и проверяются руками:
  · сессия со staff-хоста не действует на пациентском (cookie привязана к хосту)
  · доктор не проходит в админку, пациент не проходит в /app/doctor
  · письмо с кодом входа: имя отправителя несёт клинику и платформу, адрес — платформенный
  · пациент видит только своё, персонал — только свою клинику
M
[ "$fail" = 0 ]
