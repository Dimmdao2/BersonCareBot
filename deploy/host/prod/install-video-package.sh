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

install -d -m 0755 -o "$ACCOUNT" -g "$ACCOUNT" "$DST"
# Всё, кроме vendor: он принадлежит копии, а не коммиту.
tar -C "$SRC" -cf - --exclude=vendor . | tar -C "$DST" -xf -
chown -R "$ACCOUNT:$ACCOUNT" "$DST"
# Права на секреты внутри копии не расширяются: если что-то там уже было 0600, tar это сохранил.
find "$DST/bin" -name '*.sh' -exec chmod 0755 {} +

echo "пакет видео разложен в $DST из $(git -C /opt/therapysto/src rev-parse --short HEAD)"
