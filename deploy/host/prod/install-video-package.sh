#!/usr/bin/env bash
# Раскладывает пакет видео из выложенного коммита в собственный каталог учётки therapysto-video.
#
# Почему копия, а не запуск прямо из /opt/therapysto/src. Дерево исходников — вход сборки: каждая
# выкладка делает по нему `git reset --hard` и `git clean -fdx`. Пакет видео при работе пишет рядом
# с собой (скачанный и проверенный по хешу апстрим-релиз в `vendor/`), и этот каталог выкладка
# стирала бы при каждом деплое. Вдобавок дерево принадлежит root, а install.sh обязан выполняться
# под учёткой стека — писать в чужой каталог он и не должен.
#
# Копия обновляется из ТОГО ЖЕ коммита, что и конвейер, и по той же причине: иначе прод собирает
# новый код старой машинерией. `vendor/` при обновлении сохраняется — это проверенный по хешу
# апстрим, качать его заново на каждый деплой незачем.
#
#   sudo bash deploy/host/prod/install-video-package.sh
set -euo pipefail

SRC=/opt/therapysto/src/deploy/jitsi
DST=/opt/therapysto/jitsi
ACCOUNT=therapysto-video

die() { echo "FATAL: install-video-package: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.162.170 "*) die "это СТАРЫЙ прод — здесь ничего не трогаем" ;;
esac
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac
[ -d "$SRC" ] || die "нет пакета в дереве исходников: $SRC"
getent passwd "$ACCOUNT" >/dev/null || die "нет учётки $ACCOUNT"

# Право ПРОХОДА к своему env — здесь, а не в bootstrap: там учётки видео ещё не существует, и bootstrap
# честно оставляет каталог секретов 0750 root:root. Видео-стек читает /etc/therapysto/env/video (0700,
# своя учётка), но без бита x на родителе он до него не дотянется. Расширяем ровно на группу и ровно на
# проход: читать сам каталог группа по-прежнему не может, посторонние — ничего.
# Так это чинить нельзя: chmod 755 (было именно так) отдаёт перечисление каталога со ВСЕМИ секретами прода
# любому пользователю системы.
if [ -d /etc/therapysto/env ]; then
  chown root:"$ACCOUNT" /etc/therapysto/env
  chmod 0710 /etc/therapysto/env
fi

install -d -m 0755 -o "$ACCOUNT" -g "$ACCOUNT" "$DST"
# Всё, кроме vendor: он принадлежит копии, а не коммиту.
tar -C "$SRC" -cf - --exclude=vendor . | tar -C "$DST" -xf -
chown -R "$ACCOUNT:$ACCOUNT" "$DST"
# Права на секреты внутри копии не расширяются: если что-то там уже было 0600, tar это сохранил.
find "$DST/bin" -name '*.sh' -exec chmod 0755 {} +

# Пакет ищет свой unit-файл сетевой политики по «$HERE/../systemd», то есть рядом с собой — в
# репозитории это deploy/systemd, соседний каталог. Копия обязана воспроизвести это соседство,
# иначе apply-network-policy.sh не находит артефакт и отказывается работать.
install -d -m 0755 -o "$ACCOUNT" -g "$ACCOUNT" "$(dirname "$DST")/systemd"
install -m 0644 -o "$ACCOUNT" -g "$ACCOUNT" \
  /opt/therapysto/src/deploy/systemd/therapysto-jitsi-prod-network-policy.service \
  "$(dirname "$DST")/systemd/therapysto-jitsi-prod-network-policy.service"

echo "пакет видео разложен в $DST из $(git -C /opt/therapysto/src rev-parse --short HEAD)"
