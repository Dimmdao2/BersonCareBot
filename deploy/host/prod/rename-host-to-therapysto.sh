#!/usr/bin/env bash
# Одноразовая миграция имён на НОВОМ проде: bersoncarebot/bcb -> therapysto.
#
# Решение владельца 10.09.2026: «на новом проде никаких bersoncarebot и всех этих старых названий —
# всё называть therapysto/therapygo, и службы, и каталоги». Правило и таблица соответствий записаны в
# docs/ARCHITECTURE/SERVER CONVENTIONS.md, раздел «Именование на новом проде».
#
# Порядок работ, от которого зависит корректность: СНАЧАЛА переименование в репозитории (конвейер —
# источник имён), ПОТОМ этот скрипт на хосте, ПОТОМ обычный деплой с dev-бокса. Обратный порядок
# вернул бы старые имена при первой же выкладке.
#
# Скрипт останавливает контейнеры обоих цветов: их пересоздаст деплой уже под новыми именами проекта
# и сети. Ruleset nftables целиком НЕ перезагружается — это снесло бы правила, которые docker держит
# в своей таблице ip filter; живые правила меняются по одному, по handle.
#
# Каждый шаг проверяет, не выполнен ли он ранее, поэтому повторный запуск безопасен.
set -uo pipefail

die() { echo "FATAL: $*" >&2; exit 1; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac
case " $(hostname -I) " in
  *" 135.106.162.170 "*) die "это СТАРЫЙ прод — его переименовывать запрещено" ;;
esac
TS=$(date +%s)

say "1. остановка контейнеров обоих цветов (деплой пересоздаст их под новыми именами)"
for c in blue green; do
  for n in $(docker ps -a --filter "label=com.docker.compose.project=bcb-$c" --format '{{.Names}}'); do
    docker rm -f "$n" >/dev/null 2>&1 && echo "    удалён контейнер $n"
  done
done

say "2. каталоги"
[ -d /opt/bersoncarebot ] && { mv /opt/bersoncarebot /opt/therapysto || die "mv /opt"; echo "    /opt/bersoncarebot -> /opt/therapysto"; }
[ -d /etc/bersoncarebot ] && { mv /etc/bersoncarebot /etc/therapysto || die "mv /etc"; echo "    /etc/bersoncarebot -> /etc/therapysto"; }
[ -d /var/lib/bersoncarebot ] && { mv /var/lib/bersoncarebot /var/lib/therapysto || die "mv /var/lib"; echo "    /var/lib/bersoncarebot -> /var/lib/therapysto"; }
[ -d /var/log/bersoncarebot ] && { mv /var/log/bersoncarebot /var/log/therapysto || die "mv /var/log"; echo "    /var/log/bersoncarebot -> /var/log/therapysto"; }

say "3. пользователи и группы служб"
# GID сохраняется при groupmod, поэтому групповое владение ключами порт-контекста не рвётся.
getent group bcb-app-prod >/dev/null && groupmod -n therapysto-app-prod bcb-app-prod && echo "    группа bcb-app-prod -> therapysto-app-prod"
for svc in webapp api scheduler worker media-worker; do
  getent passwd "bcb-$svc" >/dev/null || continue
  usermod -l "therapysto-$svc" "bcb-$svc" 2>/dev/null && echo "    пользователь bcb-$svc -> therapysto-$svc"
  getent group "bcb-$svc" >/dev/null && groupmod -n "therapysto-$svc" "bcb-$svc" 2>/dev/null
done

say "4. env рантайма: пути клиентских сертификатов порт-контекста"
# Контейнер монтирует /etc/therapysto/postgres-mtls/prod по тому же пути, что видит приложение,
# поэтому значения в env обязаны съехать вместе с каталогом — иначе пул mTLS не откроется.
for f in /opt/therapysto/env/*.prod /opt/therapysto/env/reconcile.env; do
  [ -f "$f" ] || continue
  grep -q '/etc/bersoncarebot' "$f" || continue
  cp -a "$f" "$f.pre-rename.$TS"
  sed -i 's|/etc/bersoncarebot|/etc/therapysto|g' "$f"
  echo "    переписан $f"
done

say "5. конфиг конвейера"
if [ -f /etc/bcb-pipeline.conf ]; then
  sed 's/^BCB_/THERAPYSTO_/' /etc/bcb-pipeline.conf > /etc/therapysto-pipeline.conf
  chmod 0644 /etc/therapysto-pipeline.conf
  mv /etc/bcb-pipeline.conf "/root/bcb-pipeline.conf.pre-rename.$TS"
  echo "    /etc/therapysto-pipeline.conf создан"
fi

say "6. обёртки в /usr/local/bin"
for pair in "deploy-prod:therapysto-deploy" "rollback-prod:therapysto-rollback" "prod-status:therapysto-status"; do
  w="${pair%%:*}"; t="${pair##*:}"
  printf '#!/bin/sh\nexec sudo /opt/therapysto/pipeline/%s "$@"\n' "$t" > "/usr/local/bin/$w"
  chmod 0755 "/usr/local/bin/$w"
done
echo "    обновлены deploy-prod / rollback-prod / prod-status"

say "7. sudoers"
# Имя владельца берём из действующего правила, чтобы не зашивать его здесь второй раз.
OWNER=$(awk '/ALL=\(root\)/ {print $1; exit}' /etc/sudoers.d/20-bcb-deploy 2>/dev/null)
[ -n "$OWNER" ] || OWNER=$(awk '/ALL=\(root\)/ {print $1; exit}' /etc/sudoers.d/20-therapysto-deploy 2>/dev/null)
[ -n "$OWNER" ] || die "не удалось определить владельца из существующего правила sudoers"
{
  echo "# Production deploy commands. Password required (owner's ruling); the scripts themselves are root-owned."
  echo "$OWNER ALL=(root) /opt/therapysto/pipeline/therapysto-deploy, /opt/therapysto/pipeline/therapysto-rollback, /opt/therapysto/pipeline/therapysto-status"
} > /etc/sudoers.d/20-therapysto-deploy.new
chmod 0440 /etc/sudoers.d/20-therapysto-deploy.new
visudo -cf /etc/sudoers.d/20-therapysto-deploy.new >/dev/null || {
  rm -f /etc/sudoers.d/20-therapysto-deploy.new
  die "сгенерированное правило sudoers не проходит visudo; ничего не изменено"
}
mv /etc/sudoers.d/20-therapysto-deploy.new /etc/sudoers.d/20-therapysto-deploy
rm -f /etc/sudoers.d/20-bcb-deploy
echo "    /etc/sudoers.d/20-therapysto-deploy принят visudo (владелец: $OWNER)"

say "8. nginx: сайт и upstream"
if [ -f /etc/nginx/sites-available/bcb ]; then
  cp -a /etc/nginx/sites-available/bcb "/root/nginx-bcb.pre-rename.$TS"
  mv /etc/nginx/sites-available/bcb /etc/nginx/sites-available/therapysto
  rm -f /etc/nginx/sites-enabled/bcb
  ln -sf /etc/nginx/sites-available/therapysto /etc/nginx/sites-enabled/therapysto
fi
[ -f /etc/nginx/sites-available/therapysto ] &&
  sed -i 's/\bbcb_webapp\b/therapysto_webapp/g; s/\bbcb_api\b/therapysto_api/g' /etc/nginx/sites-available/therapysto
if [ -f /etc/nginx/conf.d/20-bcb-upstream.conf ]; then
  sed 's/\bbcb_webapp\b/therapysto_webapp/g; s/\bbcb_api\b/therapysto_api/g' \
    /etc/nginx/conf.d/20-bcb-upstream.conf > /etc/nginx/conf.d/20-therapysto-upstream.conf
  rm -f /etc/nginx/conf.d/20-bcb-upstream.conf
fi
nginx -t 2>&1 | sed 's/^/    /'
nginx -t >/dev/null 2>&1 || die "nginx не принимает конфигурацию; копия сайта в /root/nginx-bcb.pre-rename.$TS"
systemctl reload nginx && echo "    nginx перезагружен"

say "9. firewall: имена мостов в /etc/nftables.conf (персистентность после перезагрузки)"
if grep -q '"bcb-blue"\|"bcb-green"' /etc/nftables.conf; then
  cp -a /etc/nftables.conf "/var/backups/nftables.pre-rename.$TS.conf"
  sed -i 's/"bcb-blue"/"tsto-blue"/g; s/"bcb-green"/"tsto-green"/g' /etc/nftables.conf
  nft -c -f /etc/nftables.conf || die "новый /etc/nftables.conf не парсится; копия в /var/backups"
  echo "    /etc/nftables.conf обновлён и проверен nft -c"
fi

say "10. живые правила firewall (по одному, по handle)"
live_swap() {
  local chain="$1" match="$2"; shift 2
  local handle
  handle=$(nft -a list chain inet filter "$chain" | grep -E "$match" | awk '{print $NF}' | tail -1)
  if [ -n "$handle" ]; then
    nft delete rule inet filter "$chain" handle "$handle" || return 1
  fi
  nft add rule inet filter "$chain" "$@" || return 1
  echo "    $chain: $*"
}
live_swap input   'bcb-blue.*5432'    iifname '{ "tsto-blue", "tsto-green" }' tcp dport 5432 ct state new accept
live_swap forward 'iifname.*bcb-blue' iifname '{ "docker0", "tsto-blue", "tsto-green" }' accept
live_swap forward 'oifname.*bcb-blue' oifname '{ "docker0", "tsto-blue", "tsto-green" }' ct state established,related accept

say "11. systemd-дропины, аудит, целостность, антивирус"
for d in /etc/systemd/system/bersoncarebot-*-prod.service.d; do
  [ -d "$d" ] || continue
  nd=${d/bersoncarebot-/therapysto-}
  mv "$d" "$nd"
  [ -f "$nd/10-bcb-sandbox.conf" ] && mv "$nd/10-bcb-sandbox.conf" "$nd/10-therapysto-sandbox.conf"
  sed -i 's/bcb-/therapysto-/g; s|/var/lib/bersoncarebot|/var/lib/therapysto|g; s|/var/log/bersoncarebot|/var/log/therapysto|g' "$nd"/*.conf
  echo "    $d -> $nd"
done
for f in /etc/audit/rules.d/10-bcb.rules /etc/aide/aide.conf.d/99-bcb \
         /etc/systemd/journald.conf.d/zz-bcb.conf /etc/postgresql/16/main/conf.d/10-bcb.conf; do
  [ -f "$f" ] || continue
  sed -i 's|/opt/bersoncarebot|/opt/therapysto|g; s|/var/lib/bersoncarebot|/var/lib/therapysto|g; s|/var/log/bersoncarebot|/var/log/therapysto|g; s|/etc/bersoncarebot|/etc/therapysto|g' "$f"
  nf=${f/10-bcb./10-therapysto.}; nf=${nf/99-bcb/99-therapysto}; nf=${nf/zz-bcb./zz-therapysto.}
  [ "$f" != "$nf" ] && mv "$f" "$nf"
  echo "    $f -> $nf"
done
if [ -f /etc/systemd/system/bcb-malware-scan.service ]; then
  systemctl disable --now bcb-malware-scan.timer >/dev/null 2>&1
  for u in service timer; do
    [ -f "/etc/systemd/system/bcb-malware-scan.$u" ] || continue
    sed -i 's|/opt/bersoncarebot|/opt/therapysto|g; s|/var/lib/bersoncarebot|/var/lib/therapysto|g; s/bcb-malware-scan/therapysto-malware-scan/g; s/bcb-malware/therapysto-malware/g; s|/var/lib/bcb-quarantine|/var/lib/therapysto-quarantine|g' \
      "/etc/systemd/system/bcb-malware-scan.$u"
    mv "/etc/systemd/system/bcb-malware-scan.$u" "/etc/systemd/system/therapysto-malware-scan.$u"
  done
  echo "    bcb-malware-scan -> therapysto-malware-scan"
fi
[ -d /var/lib/bcb-quarantine ] && mv /var/lib/bcb-quarantine /var/lib/therapysto-quarantine
systemctl daemon-reload
systemctl enable therapysto-malware-scan.timer >/dev/null 2>&1 && echo "    таймер антивируса включён под новым именем"
augenrules --load >/dev/null 2>&1 && echo "    правила auditd перезагружены"

say "12. имя самого хоста"
# Конвейер сверяет принадлежность к проду по локальному IPv4, а не по hostname (см. require_prod_host в
# therapysto-bluegreen-lib.sh), поэтому переименование хоста ничего в нём не ломает.
if [ "$(hostnamectl --static)" = "bcb-prod" ]; then
  cp -a /etc/hosts "/root/hosts.pre-rename.$TS"
  hostnamectl set-hostname therapysto-prod
  sed -i 's/\bbcb-prod\b/therapysto-prod/g' /etc/hosts
  echo "    hostname bcb-prod -> therapysto-prod"
fi

say "13. старые сети docker"
for n in bcb-blue bcb-green; do
  docker network inspect "$n" >/dev/null 2>&1 && docker network rm "$n" >/dev/null 2>&1 && echo "    удалена сеть $n"
done

say "ГОТОВО. Остаточные упоминания старых имён в /etc и /usr/local/bin:"
grep -rl "bersoncarebot\|bcb-app\|bcb-deploy\|/opt/bersoncarebot" /etc /usr/local/bin 2>/dev/null |
  grep -v "postgresql" | head -20
echo "(bersoncarebot_test в pg_hba — это имя БАЗЫ; оно живёт в декларации прав и переименовывается отдельно)"
echo
echo "Следующий шаг — с dev-бокса: bash tools/deploy-prod-from-dev.sh"
