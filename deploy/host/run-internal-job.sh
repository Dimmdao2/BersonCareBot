#!/bin/bash
# run-internal-job.sh — ЕДИНСТВЕННЫЙ transport фоновых loopback-заданий вебаппа.
#
#   /opt/projects/bersoncarebot/deploy/host/run-internal-job.sh <prod|test> <job-id>
#
# Зачем он один. Продуктовая маршрутизация поверхностей отказывает закрыто на неизвестном `Host`:
# запрос с голым `Host: 127.0.0.1:6200` отсекается в `apps/webapp/src/proxy.ts` ДО API-маршрута и
# получает 404. Четыре рукописных cron-шаблона копировали заголовки по памяти, три из них — без
# публичного Host, и приложение годами не получало тик (находка B1 сводного аудита 27.08.2026).
# Теперь surface identity строит ЭТОТ скрипт из `APP_BASE_URL` того же env-файла через
# `webapp-health-host.mjs`, а cron-строка не знает ни про Host, ни про Origin, ни про branding proxy.
#
# Второе свойство — громкость. Прежние строки заканчивались `>/dev/null`, поэтому тело ответа и
# причина отказа исчезали вместе с ним. Здесь успешный прогон молчит (cron не спамит почтой), а
# любой отказ — transport, timeout, не-2xx — печатается в stderr И уходит в syslog с тегом
# `bersoncarebot-cron`, после чего скрипт завершается ненулевым кодом.
#
# Описание задания (route, method, query, body, timeout, допустимые статусы) читается из
# единственного typed manifest через `background-jobs-cli.mjs --describe`; здесь нет ни одной
# копии маршрута.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
LOG_TAG=bersoncarebot-cron

job_env="${1:-}"
job_id="${2:-}"

loud_fail() {
  local message="run-internal-job[${job_env:-?}/${job_id:-?}]: $*"
  echo "${message}" >&2
  if command -v logger >/dev/null 2>&1; then
    logger -t "${LOG_TAG}" -p daemon.err -- "${message}" || true
  fi
  exit 1
}

[ -n "${job_env}" ] && [ -n "${job_id}" ] ||
  loud_fail "usage: run-internal-job.sh <prod|test> <job-id>"

NODE_BIN="${BCB_NODE_BIN:-}"
if [ -z "${NODE_BIN}" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x /usr/bin/node ]; then
    NODE_BIN=/usr/bin/node
  else
    loud_fail "node not found (cron PATH is minimal; set BCB_NODE_BIN)"
  fi
fi

JOB_CLI="${REPO_ROOT}/deploy/host/background-jobs-cli.mjs"
[ -f "${JOB_CLI}" ] || loud_fail "background job manifest CLI is missing: ${JOB_CLI}"

# Описание задания из manifest. Ошибка здесь означает «задание не объявлено» — это отказ, не пропуск.
job_description="$("${NODE_BIN}" "${JOB_CLI}" --describe --env "${job_env}" --job "${job_id}")" ||
  loud_fail "job is not declared in the background job manifest"
eval "${job_description}"

[ -f "${BCB_JOB_ENV_FILE}" ] || loud_fail "env file is missing: ${BCB_JOB_ENV_FILE}"
set -a
# shellcheck disable=SC1090
. "${BCB_JOB_ENV_FILE}"
set +a

[ -n "${INTERNAL_JOB_SECRET:-}" ] ||
  loud_fail "INTERNAL_JOB_SECRET is empty in ${BCB_JOB_ENV_FILE}"

# Публичная identity поверхности — из APP_BASE_URL того же env-файла, один seam на весь хост.
surface_env="$("${NODE_BIN}" "${REPO_ROOT}/deploy/host/webapp-health-host.mjs" --surface-env)" ||
  loud_fail "cannot derive surface identity from APP_BASE_URL"
eval "${surface_env}"

loopback_host="${HOST:-127.0.0.1}"
[ -n "${PORT:-}" ] || loud_fail "PORT is not set in ${BCB_JOB_ENV_FILE}"

url="http://${loopback_host}:${PORT}${BCB_JOB_PATH}"
if [ -n "${BCB_JOB_QUERY}" ]; then
  url="${url}?${BCB_JOB_QUERY}"
fi

curl_args=(
  --silent --show-error
  --max-time "${BCB_JOB_TIMEOUT}"
  --request "${BCB_JOB_METHOD}"
  --header "Host: ${BCB_SURFACE_HOST}"
  --header "Origin: ${BCB_SURFACE_ORIGIN}"
  --header "X-Forwarded-Proto: ${BCB_SURFACE_SCHEME}"
  --header "Authorization: Bearer ${INTERNAL_JOB_SECRET}"
  --write-out '\n%{http_code}'
)
if [ -n "${BCB_JOB_BODY}" ]; then
  curl_args+=(--header 'Content-Type: application/json' --data "${BCB_JOB_BODY}")
fi

# Тело ответа НЕ уходит в /dev/null: без него отказ маршрута неотличим от успеха.
set +e
response="$(curl "${curl_args[@]}" "${url}" 2>&1)"
curl_status=$?
set -e

[ "${curl_status}" -eq 0 ] ||
  loud_fail "transport failed (curl exit ${curl_status}) for ${BCB_JOB_METHOD} ${url}: ${response}"

http_code="${response##*$'\n'}"
body="${response%$'\n'*}"

for accepted in ${BCB_JOB_ACCEPT_STATUSES}; do
  if [ "${http_code}" = "${accepted}" ]; then
    exit 0
  fi
done

loud_fail "HTTP ${http_code} for ${BCB_JOB_METHOD} ${url} (tick ${BCB_JOB_TICK}, Host ${BCB_SURFACE_HOST}): ${body}"
