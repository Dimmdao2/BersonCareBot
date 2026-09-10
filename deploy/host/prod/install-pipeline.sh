#!/usr/bin/env bash
# Раскладка конвейера на хосте прода из указанного коммита.
#
# Раньше это были десять команд в ssh-строке внутри tools/deploy-prod-from-dev.sh, выполняемых от root.
# Пока они жили строкой, права деплоя нельзя было сузить: в sudoers можно разрешить команду, но нельзя
# разрешить «произвольный bash с вот таким текстом». Свернув их в один root-owned скрипт с проверяемым
# аргументом, мы получаем ровно одну строку в sudoers вместо доступа root по ssh.
#
# Аргумент — полный sha коммита, и он проверяется по форме ДО любого использования: этот скрипт
# вызывается через sudo непривилегированной учёткой, поэтому его аргумент — граница доверия.
#
#   sudo /opt/therapysto/pipeline/install-pipeline.sh <40-значный sha>
set -euo pipefail

ROOT=/opt/therapysto
SRC="$ROOT/src"
PIPELINE="$ROOT/pipeline"

die() { echo "FATAL: install-pipeline: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "должен выполняться от root (через sudo)"
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac

COMMIT="${1:-}"
[ -n "$COMMIT" ] || die "нужен sha коммита"
# Только полный sha: ветка или тег указывали бы на движущуюся цель, а «--upload-pack=…» и прочие
# аргументо-подобные строки не должны доходить до git вовсе.
case "$COMMIT" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) : ;;
  *) die "аргумент должен быть полным sha из 40 шестнадцатеричных цифр, получено «$COMMIT»" ;;
esac

[ -d "$SRC/.git" ] || die "нет рабочего дерева $SRC"
[ -d "$PIPELINE" ] || die "нет каталога конвейера $PIPELINE"

echo "==> обновляю рабочее дерево до $COMMIT"
git -C "$SRC" fetch --prune origin
git -C "$SRC" cat-file -e "$COMMIT^{commit}" 2>/dev/null || die "коммит $COMMIT отсутствует в репозитории прода"
# Жёсткий сброс, а не merge: дерево здесь — вход сборки, а не рабочее место. Всё локальное в нём по
# определению не то, что выкладывают, и деплой, молча унёсший это в образ, — прод, работающий на коде,
# которого нет больше нигде.
git -C "$SRC" reset --hard "$COMMIT"
git -C "$SRC" clean -fdx -e node_modules >/dev/null

echo "==> раскладываю конвейер из этого же коммита"
# Конвейер живёт отдельной копией и читается оттуда, а не из выложенного дерева. Копию надо обновлять
# тем же коммитом, иначе прод собирает новый код старой машинерией: правка compose уезжает в git, на
# хосте её нет, и деплой падает по причине, которую в репозитории уже починили.
S="$SRC/deploy/host/prod"
D="$SRC/deploy/docker"

for f in therapysto-bluegreen-lib.sh therapysto-deploy therapysto-rollback therapysto-status \
         cutover-edge-to-caddy.sh rollback-edge-to-nginx.sh check-caddy-edge-health.sh \
         runtime-database.sh install-pipeline.sh; do
  install -m 0755 -o root -g root "$S/$f" "$PIPELINE/$f"
done
install -m 0644 -o root -g root "$SRC/deploy/caddy/Caddyfile.template" "$PIPELINE/Caddyfile.template"
install -m 0755 -o root -g root "$SRC/deploy/caddy/build-caddy-edge.sh" "$PIPELINE/build-caddy-edge.sh"
install -m 0644 -o root -g root "$SRC/deploy/nginx/prod/therapysto-internal.conf.template" \
  "$PIPELINE/therapysto-internal.conf.template"
for f in therapysto-caddy-edge.service therapysto-caddy-edge-health.service therapysto-caddy-edge-health.timer; do
  install -m 0644 -o root -g root "$SRC/deploy/systemd/$f" "$PIPELINE/$f"
done
install -m 0644 -o root -g root "$D/Dockerfile" "$PIPELINE/Dockerfile"
install -m 0644 -o root -g root "$D/docker-compose.yml" "$PIPELINE/docker-compose.yml"

# Пакет видео живёт отдельной копией по той же причине, что и конвейер, плюс одна своя: он пишет
# рядом с собой, а дерево исходников выкладка чистит. Обновляется тем же коммитом.
if [ -x "$SRC/deploy/host/prod/install-video-package.sh" ] && getent passwd therapysto-video >/dev/null; then
  bash "$SRC/deploy/host/prod/install-video-package.sh"
fi

echo "конвейер разложен из $COMMIT"
