#!/usr/bin/env bash
# saas-test-mode.sh — TEST-only SaaS runtime mode preflight/switch helper.
#
# Scope is deliberately narrow:
#   - TEST env files only: /opt/env/bersoncarebot/api.test and webapp.test.
#   - default action is dry-run; --apply is required to rewrite env files.
#   - dormant mode is legacy-guc and requires the existing DATABASE_URL values to
#     already point to the owner-capable bersoncarebot_test topology.
#   - locked mode is not reconstructed here because locked URLs/secrets are not
#     repo-known. Use the future full flip wrapper for locked ON.
set -euo pipefail

API_ENV="/opt/env/bersoncarebot/api.test"
WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"
ENV_FILES=("$API_ENV" "$WEBAPP_ENV")
TEST_DB_NAME="bersoncarebot_test"
TEST_OWNER_ROLE="bersoncarebot_test"
UNIT_ORDER=(api worker scheduler webapp media-worker)

ACTION="dry-run"
MODE=""
CHECK=0
RESTART=0

usage() {
  cat <<'EOF'
Usage:
  bash deploy/host/saas-test-mode.sh --check
  bash deploy/host/saas-test-mode.sh --mode dormant [--dry-run]
  bash deploy/host/saas-test-mode.sh --mode dormant --apply [--restart]

Options:
  --check           Redacted current-mode preflight only. Does not change files.
  --mode dormant   Switch/plan TEST env to DB_PRINCIPAL_CONTEXT_MODE=legacy-guc.
  --mode locked    Explicitly blocked here; locked topology needs future flip wrapper.
  --dry-run        Print a redacted plan only. Default.
  --apply          Rewrite TEST env files atomically after backup.
  --restart        With --apply only, restart TEST units in deploy-test order.
EOF
}

fatal() {
  echo "FATAL: $*" >&2
  exit 1
}

log() {
  echo "== [saas-test-mode] $* =="
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --check)
      CHECK=1
      ;;
    --dry-run)
      ACTION="dry-run"
      ;;
    --apply)
      ACTION="apply"
      ;;
    --restart)
      RESTART=1
      ;;
    --mode)
      [ "$#" -ge 2 ] || fatal "--mode requires a value"
      MODE="$2"
      shift
      ;;
    --mode=*)
      MODE="${1#--mode=}"
      ;;
    *)
      fatal "unknown argument: $1"
      ;;
  esac
  shift
done

assert_test_only_paths() {
  [ "$API_ENV" = "/opt/env/bersoncarebot/api.test" ] || fatal "API_ENV must be api.test"
  [ "$WEBAPP_ENV" = "/opt/env/bersoncarebot/webapp.test" ] || fatal "WEBAPP_ENV must be webapp.test"
  local file
  for file in "${ENV_FILES[@]}"; do
    case "$file" in
      /opt/env/bersoncarebot/*.test) ;;
      *) fatal "refusing non-TEST env path: $file" ;;
    esac
    case "$file" in
      *prod*|*main*) fatal "refusing prod/main-looking env path: $file" ;;
    esac
  done
}

assert_files_readable() {
  local file
  for file in "${ENV_FILES[@]}"; do
    [ -r "$file" ] || fatal "env file is not readable: $file"
    [ -f "$file" ] || fatal "env path is not a regular file: $file"
  done
}

render_redacted_report() {
  node - "$TEST_DB_NAME" "$TEST_OWNER_ROLE" "${ENV_FILES[@]}" <<'NODE'
const [expectedDb, expectedUser, ...files] = process.argv.slice(2);
const fs = require("node:fs");
const path = require("node:path");

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  const commentIndex = trimmed.search(/\s+#/);
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
}

function parseEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (match) values.set(match[1], unquote(match[2]));
  }
  return values;
}

function urlSummary(value) {
  if (!value) return { shape: "<missing>", db: "", user: "", ok: false };
  try {
    const url = new URL(value);
    const db = url.pathname.replace(/^\/+/, "");
    const port = url.port || (url.protocol === "postgres:" || url.protocol === "postgresql:" ? "5432" : "");
    return {
      shape: `${url.protocol}//${url.username || "<no-user>"}@${url.hostname}:${port}/${db}`,
      db,
      user: url.username,
      ok: db === expectedDb && url.username === expectedUser,
    };
  } catch {
    return { shape: "<invalid-url>", db: "", user: "", ok: false };
  }
}

let failed = false;
for (const file of files) {
  const values = parseEnv(fs.readFileSync(file, "utf8"));
  const mode = values.get("DB_PRINCIPAL_CONTEXT_MODE") || "legacy-guc";
  const databaseUrl = urlSummary(values.get("DATABASE_URL") || "");
  const staffUrl = urlSummary(values.get("DATABASE_URL_STAFF") || "");
  const nonstaffUrl = urlSummary(values.get("DATABASE_URL_NONSTAFF") || "");
  const supportedMode = ["legacy-guc", "shadow", "locked"].includes(mode);
  const isTestPath = file === "/opt/env/bersoncarebot/api.test" || file === "/opt/env/bersoncarebot/webapp.test";
  failed ||= !supportedMode || !isTestPath;
  console.log([
    `file=${path.basename(file)}`,
    `mode=${mode}`,
    `database_url_shape=${databaseUrl.shape}`,
    `database_url_dormant_owner_topology=${databaseUrl.ok ? "yes" : "no"}`,
    staffUrl.shape !== "<missing>" ? `staff_url_shape=${staffUrl.shape}` : "",
    nonstaffUrl.shape !== "<missing>" ? `nonstaff_url_shape=${nonstaffUrl.shape}` : "",
  ].filter(Boolean).join(" "));
}
process.exit(failed ? 1 : 0);
NODE
}

assert_dormant_topology() {
  node - "$TEST_DB_NAME" "$TEST_OWNER_ROLE" "${ENV_FILES[@]}" <<'NODE'
const [expectedDb, expectedUser, ...files] = process.argv.slice(2);
const fs = require("node:fs");

function parseEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values.set(match[1], value);
  }
  return values;
}

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

for (const file of files) {
  const values = parseEnv(fs.readFileSync(file, "utf8"));
  const rawUrl = values.get("DATABASE_URL");
  if (!rawUrl) fail(`${file} has no DATABASE_URL; cannot derive dormant owner-capable runtime topology`);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${file} DATABASE_URL is not parseable; refusing to print or rewrite it`);
  }
  const db = url.pathname.replace(/^\/+/, "");
  if (db !== expectedDb || url.username !== expectedUser) {
    fail(`${file} DATABASE_URL is not the known dormant TEST owner topology (expected user/db ${expectedUser}/${expectedDb}; got redacted shape ${url.username || "<no-user>"}/${db || "<no-db>"})`);
  }
}
NODE
}

rewrite_env_file() {
  local file="$1"
  local timestamp backup tmp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="${file}.bak.${timestamp}"
  tmp="$(mktemp "${file}.tmp.XXXXXX")"
  cp -p -- "$file" "$backup"
  chmod --reference="$file" "$tmp" 2>/dev/null || true
  chown --reference="$file" "$tmp" 2>/dev/null || true
  node - "$file" "$tmp" <<'NODE'
const fs = require("node:fs");
const [file, tmp] = process.argv.slice(2);
const key = "DB_PRINCIPAL_CONTEXT_MODE";
const value = "legacy-guc";
const text = fs.readFileSync(file, "utf8");
const hadTrailingNewline = text.endsWith("\n");
const lines = text.split(/\r?\n/);
let replaced = false;
const output = [];
for (const rawLine of lines) {
  if (rawLine === "" && output.length === lines.length - 1 && !hadTrailingNewline) {
    output.push(rawLine);
    continue;
  }
  const line = rawLine.trim();
  const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(normalized);
  if (match && match[1] === key) {
    if (!replaced) {
      output.push(`${key}=${value}`);
      replaced = true;
    }
    continue;
  }
  output.push(rawLine);
}
if (!replaced) {
  if (output.length > 0 && output[output.length - 1] !== "") output.push("");
  output.push(`${key}=${value}`);
}
fs.writeFileSync(tmp, `${output.join("\n").replace(/\n+$/, "")}\n`, { mode: fs.statSync(file).mode });
NODE
  mv -f -- "$tmp" "$file"
  echo "   updated $(basename "$file") (backup=$(basename "$backup"), secret values redacted)"
}

restart_test_units() {
  local unit
  [ "$ACTION" = "apply" ] || fatal "--restart is allowed only with --apply"
  log "restart TEST units in deploy-test order"
  for unit in "${UNIT_ORDER[@]}"; do
    sudo systemctl restart "bersoncarebot-$unit-test"
  done
}

assert_test_only_paths
assert_files_readable

if [ "$CHECK" = "1" ]; then
  [ -z "$MODE" ] || fatal "--check reports current mode; do not combine it with --mode"
  [ "$RESTART" = "0" ] || fatal "--check cannot restart services"
  log "current TEST mode preflight (redacted)"
  render_redacted_report
  exit 0
fi

[ -n "$MODE" ] || { usage; fatal "--mode is required unless --check is used"; }
case "$MODE" in
  dormant|legacy-guc)
    MODE="dormant"
    ;;
  locked)
    fatal "locked mode is not implemented by this TEST env rollback helper. Locked mode needs repo-known dual URLs/signing secret distribution and the future full flip wrapper; refusing to fake it."
    ;;
  shadow)
    fatal "shadow mode is not implemented by this TEST env rollback helper; use the future full flip wrapper."
    ;;
  *)
    fatal "unsupported mode: $MODE"
    ;;
esac

if [ "$RESTART" = "1" ] && [ "$ACTION" != "apply" ]; then
  fatal "--restart requires --apply"
fi

log "redacted current state"
render_redacted_report
log "dormant topology preflight"
assert_dormant_topology

if [ "$ACTION" = "dry-run" ]; then
  log "dry-run only"
  echo "   would set DB_PRINCIPAL_CONTEXT_MODE=legacy-guc in api.test and webapp.test"
  echo "   would create per-file backups before atomic replacement"
  echo "   would not print DATABASE_URL, signing secret, or other secret values"
  if [ "$RESTART" = "1" ]; then
    echo "   would restart TEST units in order: ${UNIT_ORDER[*]}"
  else
    echo "   would not restart units unless --apply --restart is used"
  fi
  exit 0
fi

[ "$ACTION" = "apply" ] || fatal "internal error: unsupported action $ACTION"
log "apply dormant TEST env mode"
for file in "${ENV_FILES[@]}"; do
  [ -w "$file" ] || fatal "env file is not writable; run this owner-approved apply as an operator with write access: $file"
  rewrite_env_file "$file"
done
log "post-apply redacted state"
render_redacted_report

if [ "$RESTART" = "1" ]; then
  restart_test_units
else
  echo "   TEST units not restarted; mode takes effect after the next documented TEST restart/deploy."
fi
