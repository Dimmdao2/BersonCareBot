#!/bin/bash
# Canonical PostgreSQL backup for BersonCareBot production.
# Install on host: sudo install -m 0755 deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
#
# Dumps both production databases used by deploy:
#   - Integrator: DATABASE_URL from api.prod (typically tgcarebot)
#   - Webapp:     DATABASE_URL from webapp.prod (typically bcb_webapp_prod)
#
# Usage (run as root, or via sudo — as in deploy-prod / deploy-webapp-prod):
#   postgres-backup.sh pre-migrations   → /opt/backups/postgres/pre-migrations/
#   postgres-backup.sh hourly           → /opt/backups/postgres/hourly/
#
# Env overrides (optional):
#   BERSONCAREBOT_API_ENV_FILE     default /opt/env/bersoncarebot/api.prod
#   BERSONCAREBOT_WEBAPP_ENV_FILE  default /opt/env/bersoncarebot/webapp.prod

set -euo pipefail

API_ENV_FILE="${BERSONCAREBOT_API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${BERSONCAREBOT_WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"

die() {
  echo "postgres-backup: $*" >&2
  exit 1
}

db_name_from_database_url() {
  local raw="$1"
  # Strip JDBC-style prefixes if ever present
  raw="${raw#jdbc:}"
  # postgresql://.../dbname or postgres://.../dbname
  raw="${raw%%\?*}"
  echo "${raw##*/}"
}

load_database_url() {
  local envfile="$1"
  [ -f "$envfile" ] || die "env file not found: ${envfile}"
  set -a
  # shellcheck disable=SC1090
  source "$envfile"
  set +a
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL missing or empty in ${envfile}"
  echo "$DATABASE_URL"
}

dump_one() {
  local label="$1"
  local conn="$2"
  local outdir="$3"
  local ts="$4"
  local dbname
  dbname="$(db_name_from_database_url "$conn")"
  local outfile="${outdir}/${label}_${dbname}_${ts}.dump"
  echo "postgres-backup: writing ${outfile}"
  pg_dump "$conn" -Fc --no-owner --no-acl -f "$outfile"
}

run_mode() {
  local mode="$1"
  local outdir
  case "$mode" in
    pre-migrations)
      outdir="/opt/backups/postgres/pre-migrations"
      ;;
    hourly)
      outdir="/opt/backups/postgres/hourly"
      ;;
    daily)
      outdir="/opt/backups/postgres/daily"
      ;;
    manual)
      outdir="/opt/backups/postgres/manual"
      ;;
    *)
      die "unknown mode: ${mode} (use: pre-migrations | hourly | daily | manual)"
      ;;
  esac

  mkdir -p "$outdir"
  local ts
  ts="$(date +%Y%m%d_%H%M%S)"

  local integrator_url webapp_url
  integrator_url="$(load_database_url "$API_ENV_FILE")"
  webapp_url="$(load_database_url "$WEBAPP_ENV_FILE")"

  dump_one "integrator" "$integrator_url" "$outdir" "$ts"
  dump_one "webapp" "$webapp_url" "$outdir" "$ts"
  echo "postgres-backup: done (${mode})"
}

main() {
  local mode="${1:-}"
  [ -n "$mode" ] || die "usage: $0 pre-migrations|hourly|daily|manual"
  run_mode "$mode"
}

main "$@"
