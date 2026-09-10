#!/usr/bin/env bash
# Убирает вход root по SSH с нового прода, не ломая деплой.
#
# Сейчас автоматизация с dev-бокса ходит на прод как root: пушит в голый репозиторий, раскладывает
# конвейер и запускает выкладку. Просто выключить root — значит остановить деплой. Поэтому работа
# состоит из двух шагов, и они разнесены по времени намеренно.
#
#   bash harden-ssh-close-root.sh --setup        # готовит учётку deploy и права; root ещё открыт
#   bash harden-ssh-close-root.sh --close-root   # закрывает root, но только если новый путь ДОКАЗАН
#
# Между шагами обязателен живой деплой по новому пути. `--close-root` откажется работать, пока не
# увидит доказательств: вход по ключу учёткой deploy и успешную выкладку — оба ПОСЛЕ установки правил.
# Причина такой строгости простая: запереть себя снаружи собственной машины — самая дорогая из ошибок,
# которые здесь можно совершить, и она не откатывается ничем, кроме консоли провайдера.
set -uo pipefail

DEPLOY_USER=deploy
ROOT_DIR=/opt/therapysto
PIPELINE="$ROOT_DIR/pipeline"
BARE="$ROOT_DIR/git/therapysto.git"
SUDOERS=/etc/sudoers.d/30-therapysto-automation
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-therapysto-no-root.conf
AUTOMATION_KEY_COMMENT=claude-bcb-prod-build-2026-08-17

die() { echo "FATAL: $*" >&2; exit 1; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac

setup() {
  say "1. домашний каталог и ключ учётки $DEPLOY_USER"
  getent passwd "$DEPLOY_USER" >/dev/null || die "нет учётки $DEPLOY_USER"
  install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER"
  install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  # Ключ автоматизации не вводится руками и не передаётся аргументом: он уже лежит у root, и мы
  # переносим ровно ту строку, чтобы не появилось второго, никем не учтённого ключа.
  key=$(grep -F "$AUTOMATION_KEY_COMMENT" /root/.ssh/authorized_keys 2>/dev/null | head -1)
  [ -n "$key" ] || die "в /root/.ssh/authorized_keys нет ключа с комментарием $AUTOMATION_KEY_COMMENT"
  touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
  grep -qF "$key" "/home/$DEPLOY_USER/.ssh/authorized_keys" ||
    printf '%s\n' "$key" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 0600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
  echo "    ключ автоматизации перенесён учётке $DEPLOY_USER"

  say "2. голый репозиторий должен принимать push от $DEPLOY_USER"
  # Репозиторий здесь — транспорт, а не защищаемый ресурс: его содержимое всё равно приходит от той же
  # учётки. Root-владение ему нужно было только потому, что пушил root.
  [ -d "$BARE" ] || die "нет голого репозитория $BARE (переименование хоста не выполнялось?)"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BARE"
  echo "    $BARE передан $DEPLOY_USER"

  say "3. права: ровно четыре команды через sudo, без пароля"
  # Без пароля — потому что это неинтерактивная автоматизация; узко — потому что вместо доступа root
  # по ssh остаётся право запустить четыре конкретных файла, принадлежащих root и не изменяемых
  # учёткой deploy. Аргументы install-pipeline.sh проверяет сам: он вызывается непривилегированным.
  {
    echo "# Автоматизация деплоя с dev-бокса. Заменяет собой вход root по SSH."
    echo "# Файлы принадлежат root и учётке deploy не пишутся — иначе право свелось бы к полному root."
    echo "$DEPLOY_USER ALL=(root) NOPASSWD: $PIPELINE/install-pipeline.sh, $PIPELINE/therapysto-deploy, $PIPELINE/therapysto-rollback, $PIPELINE/therapysto-status"
  } > "$SUDOERS.new"
  chmod 0440 "$SUDOERS.new"
  visudo -cf "$SUDOERS.new" >/dev/null || { rm -f "$SUDOERS.new"; die "правило sudoers не проходит visudo; ничего не изменено"; }
  mv "$SUDOERS.new" "$SUDOERS"
  echo "    $SUDOERS принят visudo"

  say "4. проверка, что конвейер на месте"
  for f in install-pipeline.sh therapysto-deploy therapysto-rollback therapysto-status; do
    [ -x "$PIPELINE/$f" ] || echo "    ВНИМАНИЕ: нет $PIPELINE/$f — появится после первого деплоя новым путём"
    if [ -e "$PIPELINE/$f" ]; then
      owner=$(stat -c '%U' "$PIPELINE/$f")
      [ "$owner" = root ] || die "$PIPELINE/$f принадлежит $owner, а не root — право sudo свелось бы к полному root"
    fi
  done

  cat <<INSTR

Готово. Root по SSH ПОКА ОТКРЫТ — это намеренно.

Дальше, с dev-бокса, выполнить обычный деплой:
    bash tools/deploy-prod-from-dev.sh
Он теперь ходит сюда учёткой $DEPLOY_USER и поднимает права через sudo на четыре команды.

Когда деплой пройдёт — вернуться сюда и закрыть root:
    bash $0 --close-root
INSTR
}

close_root() {
  say "проверяю, что новый путь деплоя реально работает"
  [ -f "$SUDOERS" ] || die "не выполнялся --setup: нет $SUDOERS"
  since=$(stat -c '%Y' "$SUDOERS")

  # Доказательство 1: учётка deploy действительно входила по ключу ПОСЛЕ установки правил.
  login_at=$(journalctl -u ssh --since "@$since" 2>/dev/null |
    grep -c "Accepted publickey for $DEPLOY_USER")
  [ "${login_at:-0}" -gt 0 ] ||
    die "с момента установки правил учётка $DEPLOY_USER ни разу не входила по ключу — деплой новым путём не проверен"
  echo "    вход по ключу учёткой $DEPLOY_USER: подтверждён журналом"

  # Доказательство 2: выкладка после этого момента завершилась успехом. Одного входа мало: ключ может
  # приниматься, а sudo — отказывать, и тогда закрытие root оставило бы прод без способа выкладки.
  ok=$(awk -v since="$(date -u -d "@$since" +%Y-%m-%dT%H:%M:%SZ)" \
        '$2 == "deploy" && $1 > since {n++} END {print n+0}' "$ROOT_DIR/state/releases.log" 2>/dev/null)
  [ "${ok:-0}" -gt 0 ] ||
    die "в $ROOT_DIR/state/releases.log нет успешной выкладки после установки правил — сначала выложите релиз новым путём"
  echo "    успешная выкладка после установки правил: подтверждена журналом релизов"

  # Доказательство 3: у живого человека остаётся вход. Автоматизация не спасёт, если владелец не сможет
  # зайти сам: пароль для sudo должен быть задан, и ключ в учётке должен быть.
  case "$(passwd -S dim 2>/dev/null | awk '{print $2}')" in
    P) : ;;
    *) die "у пользователя dim не задан пароль — после закрытия root он не сможет получить sudo. Сначала: passwd dim" ;;
  esac
  [ -s /home/dim/.ssh/authorized_keys ] || die "у пользователя dim нет authorized_keys — закрывать root нельзя"
  id -nG dim | tr ' ' '\n' | grep -qx sudo || die "пользователь dim не в группе sudo"
  echo "    у dim есть ключ, пароль и членство в sudo"

  say "закрываю вход root по SSH"
  install -d -m 0755 /etc/ssh/sshd_config.d
  {
    echo "# Владелец, 10.09.2026: root по SSH на проде закрыт. Автоматизация деплоя работает учёткой"
    echo "# deploy с узким правом sudo на четыре команды конвейера (см. $SUDOERS)."
    echo "PermitRootLogin no"
  } > "$SSHD_DROPIN"
  chmod 0644 "$SSHD_DROPIN"
  sshd -t || { rm -f "$SSHD_DROPIN"; die "sshd не принимает конфигурацию; изменение отменено"; }
  systemctl reload ssh
  echo "    PermitRootLogin no применён"
  sshd -T | grep -E '^permitrootlogin' | sed 's/^/    /'

  cat <<INSTR

Root по SSH закрыт. Открытые сессии не рвутся — выходить и проверять вход лучше ИЗ ДРУГОГО окна,
не закрывая это, пока не убедитесь, что заходите как dim.

Откатить (если что-то пошло не так, из живой сессии):
    rm $SSHD_DROPIN && sshd -t && systemctl reload ssh
INSTR
}

case "${1:-}" in
  --setup) setup ;;
  --close-root) close_root ;;
  *) die "нужен режим: --setup или --close-root" ;;
esac
