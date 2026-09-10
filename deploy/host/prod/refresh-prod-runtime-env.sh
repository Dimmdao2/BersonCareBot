#!/usr/bin/env bash
# Переносит в runtime-env нового прода то, что задаёт ВЫКЛАДЫВАЕМЫЙ коммит, а не хост.
#
# Зачем отдельный шаг: blue/green-конвейер собирает образ и переключает nginx, но env-файлы не трогает
# принципиально — там живут секреты, которых в репозитории нет. При этом описатели порт-контекста
# (`*_PORT_CONTEXT_CAPABILITIES_JSON`) — не секрет, а слепок декларации прав этого же коммита. Если их
# не обновить, рантайм ходит в базу с каталогом возможностей прошлой выкладки: логины есть, а
# капабилити под новые двери нет.
#
# Запускать на хосте прода из /opt/therapysto/src ПОСЛЕ обновления дерева и ДО запуска therapysto-deploy.
set -euo pipefail

SRC=/opt/therapysto/src
ENV_DIR=/opt/therapysto/env

fail() { echo "FATAL: refresh-prod-runtime-env: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "must run as root"
expected=135.106.187.95
case " $(hostname -I) " in *" $expected "*) : ;; *) fail "this host has no local IPv4 $expected" ;; esac
[ -d "$SRC" ] || fail "no source tree at $SRC"
[ -r "$ENV_DIR/webapp.prod" ] && [ -r "$ENV_DIR/api.prod" ] || fail "runtime env files are unreadable"

# Имя базы и окружение — из общего источника: тот же вывод нужен связыванию видео, и второй его
# экземпляр здесь стал бы расхождением при следующем переименовании.
# shellcheck source=deploy/host/prod/runtime-database.sh
. "$(dirname "$0")/runtime-database.sh"
DB=$(THERAPYSTO_ENV_DIR="$ENV_DIR" runtime_database) || fail "не удалось определить базу рантайма"
ENV_NAME=$(runtime_environment "$DB") || exit 1
echo "refresh-prod-runtime-env: база $DB, окружение $ENV_NAME"

cd "$SRC"
ts=$(date +%s)
cp -a "$ENV_DIR/webapp.prod" "$ENV_DIR/webapp.prod.pre-env-refresh.$ts"
cp -a "$ENV_DIR/api.prod" "$ENV_DIR/api.prod.pre-env-refresh.$ts"

# Копии подчищаются здесь же. Шаг выполняется на КАЖДОЙ выкладке, а в этих файлах лежат все секреты
# прода целиком — без прополки каталог за месяц набирает десятки полных копий секретов, и каждая живёт
# ровно столько же, сколько действующая. Три последних покрывают откат на пару выкладок назад; всё,
# что старше, — это уже не страховка, а множимая поверхность утечки.
for prefix in webapp.prod api.prod; do
  ls -1t "$ENV_DIR/$prefix.pre-env-refresh."* 2>/dev/null | tail -n +4 | while IFS= read -r stale; do
    rm -f "$stale"
  done
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --env "$ENV_NAME" --db "$DB" --port-context-env webapp > "$work/webapp.line"
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --env "$ENV_NAME" --db "$DB" --port-context-env integrator > "$work/api.line"

WEBAPP_ENV="$ENV_DIR/webapp.prod" API_ENV="$ENV_DIR/api.prod" WORK="$work" python3 - <<'PY'
import os
import pathlib

def put(path, key, line):
    p = pathlib.Path(path)
    lines = p.read_text(encoding='utf-8').splitlines(True)
    out, replaced = [], False
    for existing in lines:
        if existing.startswith(key + '='):
            out.append(line)
            replaced = True
        else:
            out.append(existing)
    if not replaced:
        if out and not out[-1].endswith('\n'):
            out[-1] += '\n'
        out.append(line)
    p.write_text(''.join(out), encoding='utf-8')

work = pathlib.Path(os.environ['WORK'])
for env_path, key, rendered in (
    (os.environ['WEBAPP_ENV'], 'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON', work / 'webapp.line'),
    (os.environ['API_ENV'], 'INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON', work / 'api.line'),
):
    text = rendered.read_text(encoding='utf-8')
    put(env_path, key, text if text.endswith('\n') else text + '\n')
print('port-context descriptors written')
PY

for key in APP_BASE_URL PATIENT_APP_ORIGIN CUSTOM_DOMAIN_EDGE_IP CUSTOM_DOMAIN_CNAME_TARGET PATIENT_APP_NAME; do
  grep -q "^$key=" "$ENV_DIR/webapp.prod" || fail "webapp.prod has no $key — заполнить по deploy/env/.env.webapp.prod.example"
done
echo "refresh-prod-runtime-env: OK (backups: *.pre-env-refresh.$ts)"
