#!/usr/bin/env bash
# Deliver the current committed DEV branch to the existing named TEST environment.
# B0/post-B0 only: no restore, database recreation, zero-state, greenfield or historical replay.

set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="${1:-feat/doctor-ui-rebuild}"
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
DB=bersoncarebot_test
MIGRATOR_ROLE=bcb_test_migrator
OBJECT_OWNER_ROLE=app_object_owner
BUNDLE=/tmp/bcb-test-deploy.bundle
TRANSCRIPT_DIR=${BCB_TEST_DEPLOY_TRANSCRIPT_DIR:-/var/log/bersoncarebot/deploy-test}
TRANSCRIPT=""
UNITS=(api worker scheduler webapp media-worker)
CREDENTIAL_DIR=""
WRITERS_STOPPED=0
SERVICES_RELEASED=0

fail() {
  printf 'FATAL: %s\n' "$1" >&2
  exit 1
}

start_transcript() {
  sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0750 "$TRANSCRIPT_DIR" ||
    fail "cannot create TEST deploy transcript directory"
  TRANSCRIPT="$TRANSCRIPT_DIR/deploy-test.$(date -u +%Y%m%dT%H%M%SZ).log"
  : > "$TRANSCRIPT" && chmod 0640 "$TRANSCRIPT" || fail "cannot create TEST deploy transcript"
  exec > >(tee -a "$TRANSCRIPT") 2>&1
  printf 'deploy-test transcript: %s\n' "$TRANSCRIPT"
}

cleanup() {
  local status=$?
  trap - EXIT
  rm -f -- "$BUNDLE"
  if [[ -n "$CREDENTIAL_DIR" ]]; then rm -rf -- "$CREDENTIAL_DIR"; fi
  if [[ "$status" -ne 0 && "$WRITERS_STOPPED" == 1 && "$SERVICES_RELEASED" != 1 ]]; then
    printf 'TEST writers remain stopped after failed migration/deploy; inspect the transcript before recovery.\n' >&2
  fi
  exit "$status"
}
trap cleanup EXIT

[[ "$(id -u)" -ne 0 ]] || fail 'run as the non-root repository owner'
start_transcript
[[ "$(realpath "$SRC_REPO")" == /home/dev/dev-projects/BersonCareBot ]] || fail 'source repository path guard failed'
[[ -d "$DEPLOY_REPO/.git" ]] || fail 'TEST deploy checkout is missing'
for command in curl flock git mktemp node pnpm realpath sudo systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
for env_file in "$API_ENV" "$WEBAPP_ENV"; do
  [[ ! -L "$env_file" && -f "$env_file" ]] || fail "canonical TEST env is missing: $env_file"
done

for address in $(hostname -I 2>/dev/null || true); do
  [[ "$address" == 151.241.228.122 ]] && on_dev_test_host=1
done
[[ "${on_dev_test_host:-0}" == 1 ]] || fail 'TEST deploy is allowed only on DEV/TEST host 151.241.228.122'

exec 9>/tmp/bcb-test-deploy.lock
flock -n 9 || fail 'another TEST deploy is already running'

for env_file in "$API_ENV" "$WEBAPP_ENV"; do
  mode="$(sudo -u deploy bash -lc "set -a; . '$env_file'; set +a; printf '%s' \"\${DB_PRINCIPAL_CONTEXT_MODE:-missing}\"")"
  [[ "$mode" == port-context ]] || fail "$env_file must use DB_PRINCIPAL_CONTEXT_MODE=port-context, got $mode"
done

database_identity="$(sudo -n -u postgres psql -X -d "$DB" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT current_database() || '|' || pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database();")"
[[ "$database_identity" == "$DB|postgres" ]] || fail "unexpected TEST database identity: $database_identity"

migrator_state="$(sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' ||
          rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' ||
          (rolpassword IS NULL)::text || '|' ||
          (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=role.oid)::text
     FROM pg_catalog.pg_authid AS role WHERE rolname='$MIGRATOR_ROLE';")"
[[ "$migrator_state" == false\|false\|false\|false\|false\|false\|true\|0 ]] ||
  fail "$MIGRATOR_ROLE is not the stationary declaration migrator"

git -C "$SRC_REPO" diff --quiet --ignore-submodules -- || fail 'tracked source changes must be committed before TEST deploy'
git -C "$SRC_REPO" diff --cached --quiet --ignore-submodules -- || fail 'staged source changes must be committed before TEST deploy'
git -C "$SRC_REPO" show-ref --verify --quiet "refs/heads/$BRANCH" || fail "local branch does not exist: $BRANCH"

rm -f -- "$BUNDLE"
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"
chmod 644 "$BUNDLE"
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD

OWNER_MIGRATOR="$DEPLOY_REPO/deploy/postgres/privileges/migrate-local.mjs"
INTEGRATOR_MIGRATOR="$DEPLOY_REPO/deploy/postgres/privileges/migrate-integrator-local.mjs"
RECONCILER="$DEPLOY_REPO/deploy/postgres/privileges/reconcile-access.mjs"
GENERATOR="$DEPLOY_REPO/deploy/postgres/privileges/generate-cli.mjs"
PORT_CONTEXT_ENV_BOOTSTRAP="$DEPLOY_REPO/deploy/host/bootstrap-c4-test-env.mjs"
DRIZZLE_FOLDER="$DEPLOY_REPO/apps/webapp/db/drizzle-migrations"
for required_path in "$OWNER_MIGRATOR" "$INTEGRATOR_MIGRATOR" "$RECONCILER" "$GENERATOR" \
  "$PORT_CONTEXT_ENV_BOOTSTRAP" "$DRIZZLE_FOLDER"; do
  sudo -u deploy test -r "$required_path" || fail "deploy cannot read required B0 artifact: $required_path"
done

sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

for unit_name in "${UNITS[@]}"; do sudo systemctl stop "bersoncarebot-$unit_name-test"; done
WRITERS_STOPPED=1
target_sessions="$(sudo -n -u postgres psql -X -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname='$DB' AND pid<>pg_backend_pid();")"
[[ "$target_sessions" == 0 ]] || fail "TEST database is not quiescent: $target_sessions session(s)"

node --experimental-strip-types "$GENERATOR" --shared-role-baseline |
  sudo -n -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1
node --experimental-strip-types "$GENERATOR" --shared-role-verify |
  sudo -n -u postgres psql -X -1 -d postgres -v ON_ERROR_STOP=1

node "$OWNER_MIGRATOR" --db "$DB" --migrator "$MIGRATOR_ROLE" \
  --drizzle-folder "$DRIZZLE_FOLDER" --sudo-postgres
node "$INTEGRATOR_MIGRATOR" --db "$DB" --migrator "$MIGRATOR_ROLE" --owner "$OBJECT_OWNER_ROLE" \
  --root "$DEPLOY_REPO/apps/integrator" --sudo-postgres

CREDENTIAL_DIR="$(mktemp -d /tmp/bcb-test-reconcile-credentials.XXXXXX)"
chmod 700 "$CREDENTIAL_DIR"
RECONCILE_ENV="$CREDENTIAL_DIR/reconcile.env"
sudo node - "$API_ENV" "$WEBAPP_ENV" >"$RECONCILE_ENV" <<'NODE'
const { readFileSync } = require('node:fs');
function parse(path) {
  const values = new Map();
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match || values.has(match[1])) throw new Error(`invalid or duplicate env entry in ${path}`);
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    values.set(match[1], value);
  }
  return values;
}
function password(values, key, expectedLogin) {
  const url = new URL(values.get(key));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      (url.port && url.port !== '5432') || url.pathname !== '/bersoncarebot_test' ||
      decodeURIComponent(url.username) !== expectedLogin || !url.password) throw new Error(`${key} identity mismatch`);
  const value = decodeURIComponent(url.password);
  if ([...value].some((character) => { const point = character.codePointAt(0); return point === undefined || point <= 0x1f || point === 0x7f; })) throw new Error(`${key} unsafe password`);
  return value;
}
const api = parse(process.argv[2]);
const webapp = parse(process.argv[3]);
const entries = [
  ['BCB_TEST_INTEGRATOR_PASSWORD', password(api, 'INTEGRATOR_DB_URL', 'bcb_test_integrator')],
  ['BCB_TEST_WEBAPP_STAFF_PASSWORD', password(webapp, 'DATABASE_URL_STAFF', 'bcb_test_webapp_staff')],
  ['BCB_TEST_WEBAPP_PATIENT_PASSWORD', password(webapp, 'DATABASE_URL_PATIENT', 'bcb_test_webapp_patient')],
  ['BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD', password(webapp, 'DATABASE_URL_GLOBAL_ADMIN', 'bcb_test_webapp_global_admin')],
];
process.stdout.write(`${entries.map(([key, value]) => `${key}='${value.replaceAll("'", `'"'"'`)}'`).join('\n')}\n`);
NODE
chmod 600 "$RECONCILE_ENV"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
sudo env -i PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" HOME=/root \
  RECONCILE_ENV="$RECONCILE_ENV" DEPLOY_REPO="$DEPLOY_REPO" DB="$DB" bash -c '
    set -Eeuo pipefail
    set -a; . "$RECONCILE_ENV"; set +a
    exec node "$DEPLOY_REPO/deploy/postgres/privileges/reconcile-access.mjs" \
      --env test --db "$DB" --admin-socket /var/run/postgresql --admin-port 5432
  '
sudo node --experimental-strip-types "$PORT_CONTEXT_ENV_BOOTSTRAP" --port-context-execute

for unit_name in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$unit_name-test"; done
for attempt in $(seq 1 30); do
  all_active=1
  for unit_name in "${UNITS[@]}"; do
    sudo systemctl is-active --quiet "bersoncarebot-$unit_name-test" || all_active=0
  done
  if [[ "$all_active" == 1 ]] && curl -fsS --max-time 3 http://127.0.0.1:3300/health >/dev/null &&
     curl -fsS --max-time 3 http://127.0.0.1:6300/api/health >/dev/null; then
    SERVICES_RELEASED=1
    printf 'deploy-test: PASS branch=%s head=%s B0/post-B0 only\n' \
      "$BRANCH" "$(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
fail 'TEST services did not become healthy within 30 seconds'
