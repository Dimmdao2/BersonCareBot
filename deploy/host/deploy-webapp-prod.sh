#!/bin/bash
set -euo pipefail

PROJECT_ROOT=/opt/projects/bersoncarebot
ENV_FILE=/opt/env/bersoncarebot/webapp.prod
BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
WEBAPP_SERVICE=bersoncarebot-webapp-prod.service
WEBAPP_PORT=6200

fail() {
  echo "deploy-webapp-prod: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    fail "refusing PROD webapp deploy on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    fail "refusing PROD webapp deploy without local IPv4 135.106.162.170"
}

require_file() {
  local path="$1"
  local description="$2"
  if [ ! -f "$path" ]; then
    fail "${description} not found: ${path}"
  fi
}

require_unit_file() {
  local unit="$1"
  local installed="/etc/systemd/system/${unit}"
  local source="${PROJECT_ROOT}/deploy/systemd/${unit}"
  local fragment_path drop_in_paths need_reload
  [ -f "${source}" ] && [ ! -L "${source}" ] ||
    fail "Reviewed systemd template is missing or is a symlink: ${source}"
  [ -f "${installed}" ] && [ ! -L "${installed}" ] ||
    fail "Missing or non-regular systemd unit ${unit}. Root must run bootstrap-systemd-webapp-prod.sh first."
  [ "$(stat -c '%U:%G:%a' "${installed}")" = "root:root:644" ] ||
    fail "Unsafe ownership/mode for ${installed}; expected root:root:644. Root must re-run bootstrap."
  cmp -s "${source}" "${installed}" ||
    fail "Installed ${unit} differs from the reviewed repo template. Root must re-run bootstrap."
  fragment_path="$(/bin/systemctl show --property=FragmentPath --value "${unit}")" ||
    fail "Cannot inspect loaded fragment for ${unit}."
  [ "${fragment_path}" = "${installed}" ] ||
    fail "Systemd loaded ${unit} from unexpected fragment ${fragment_path:-<none>}."
  drop_in_paths="$(/bin/systemctl show --property=DropInPaths --value "${unit}")" ||
    fail "Cannot inspect drop-ins for ${unit}."
  [ -z "${drop_in_paths}" ] ||
    fail "Unexpected drop-ins can override the reviewed host gate for ${unit}: ${drop_in_paths}"
  need_reload="$(/bin/systemctl show --property=NeedDaemonReload --value "${unit}")" ||
    fail "Cannot inspect daemon-reload state for ${unit}."
  [ "${need_reload}" = "no" ] ||
    fail "Systemd has not loaded the reviewed ${unit}; root must run bootstrap."
}

require_sudo_rule() {
  local description="$1"
  shift

  if ! sudo -n -l "$@" >/dev/null 2>&1; then
    fail "Missing passwordless sudo permission for ${description}: $*"
  fi
}

assert_canonical_prod_host

cd "${PROJECT_ROOT}"
git checkout -- apps/webapp/next-env.d.ts 2>/dev/null || true
git pull origin main

if [ -z "${DEPLOY_WEBAPP_PROD_RERUN:-}" ]; then
  export DEPLOY_WEBAPP_PROD_RERUN=1
  exec bash deploy/host/deploy-webapp-prod.sh
fi

require_file "${ENV_FILE}" "Production webapp environment file"
require_unit_file "${WEBAPP_SERVICE}"
require_file "${BACKUP_SCRIPT}" "Backup script (for pre-migration backup)"
require_file "${PROJECT_ROOT}/deploy/postgres/patient-media-playback-telemetry-accessors.sql" "Patient media playback telemetry accessor overlay"
require_file "${PROJECT_ROOT}/deploy/postgres/patient-visible-catalog-rls.sql" "Patient-visible catalog RLS overlay"
require_file "${PROJECT_ROOT}/deploy/postgres/patient-invites-rls.sql" "Patient invite strict runtime overlay"
# B0.2 (#1057): refuse before any build/restart work if the artifact retains a mock-payment surface.
bash "${PROJECT_ROOT}/deploy/host/assert-no-mock-payment-deploy.sh" "${PROJECT_ROOT}"

require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
require_sudo_rule "webapp restart" /bin/systemctl restart "${WEBAPP_SERVICE}"
require_sudo_rule "webapp status check" /bin/systemctl is-active --quiet "${WEBAPP_SERVICE}"

export CI=true
export BUILD_ID="${BUILD_ID:-$(git rev-parse --short HEAD)-$(date +%s)}"
export NEXT_PUBLIC_BUILD_ID="${NEXT_PUBLIC_BUILD_ID:-${BUILD_ID}}"
pnpm install --frozen-lockfile

if [ -d apps/webapp/.next ]; then
  rm -rf apps/webapp/.next || fail "Cannot remove apps/webapp/.next (likely root-owned). As root on the host: systemctl stop ${WEBAPP_SERVICE} && rm -rf ${PROJECT_ROOT}/apps/webapp/.next — then redeploy as deploy. See SERVER CONVENTIONS.md."
fi
pnpm --dir apps/webapp build
bash deploy/host/sync-webapp-standalone-assets.sh
RUNTIME_BUILD_ID_FILE=apps/webapp/.next/standalone/apps/webapp/.runtime-build-id
cat > "${RUNTIME_BUILD_ID_FILE}" <<EOF
BUILD_ID=${BUILD_ID}
NEXT_PUBLIC_BUILD_ID=${NEXT_PUBLIC_BUILD_ID}
EOF
STANDALONE_CHUNKS=apps/webapp/.next/standalone/apps/webapp/.next/static/chunks
sample_chunk="$(find "${STANDALONE_CHUNKS}" -maxdepth 1 -type f -name "*.js" | sort | sed -n '1p' | xargs -r basename)"
[ -n "${sample_chunk}" ] || fail "Standalone has no JS under ${STANDALONE_CHUNKS} after sync."

# Run webapp DB migrations (DATABASE_URL from webapp.prod)
set -a
source "${ENV_FILE}"
set +a

# Backup webapp DB before migrations (same contract as deploy-prod: pre-migrations → /opt/backups/postgres/pre-migrations/)
sudo -n "${BACKUP_SCRIPT}" pre-migrations

pnpm --dir apps/webapp run migrate

# Same guardrail as deploy/host/deploy-prod.sh (shared script; fail before webapp restart).
bash "${PROJECT_ROOT}/deploy/host/webapp-post-migrate-schema-check.sh"

sudo -n /bin/systemctl restart "${WEBAPP_SERVICE}"
sleep 3
sudo -n /bin/systemctl is-active --quiet "${WEBAPP_SERVICE}"

chunk_http_code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WEBAPP_PORT}/_next/static/chunks/${sample_chunk}")"
if [ "${chunk_http_code}" != "200" ]; then
  fail "Chunk is not served after restart: /_next/static/chunks/${sample_chunk} (HTTP ${chunk_http_code})"
fi

for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:${WEBAPP_PORT}/api/health" -o /tmp/bersoncare-webapp-health.json; then
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "Webapp health check failed after 5 attempts (port ${WEBAPP_PORT})"
    exit 1
  fi
  sleep 2
done

grep -q '"ok":true' /tmp/bersoncare-webapp-health.json
