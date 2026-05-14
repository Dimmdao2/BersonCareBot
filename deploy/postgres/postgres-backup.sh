#!/bin/bash
# Canonical PostgreSQL backup for BersonCareBot production.
# Install on host: sudo install -m 0755 deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
#
# Reads DATABASE_URL from api.prod and webapp.prod. After DB unification both URLs
# typically match — one pg_dump is enough (see run_backup_dumps).
#
# Modes:
#   pre-migrations | hourly | daily | weekly | manual  → pg_dump + operator_job_status tick
#   prune          → retention only (no dump) + tick
#
# Retention (MVP, fixed): hourly 48h, daily 35d, weekly 12w (84d),
# pre-migrations: always keep the 20 newest files; among the rest, delete only if older than 30 days.
# Prune only touches paths under /opt/backups/postgres/.
#
# DB ticks: `public.operator_job_status` with job_family=backup and job_key backup.hourly | … (see MVP plan).
#
# Env:
#   BERSONCAREBOT_API_ENV_FILE     default /opt/env/bersoncarebot/api.prod
#   BERSONCAREBOT_WEBAPP_ENV_FILE  default /opt/env/bersoncarebot/webapp.prod
#   BERSONCAREBOT_PRUNE_DRY_RUN=1  print prune actions, do not delete

set -euo pipefail

API_ENV_FILE="${BERSONCAREBOT_API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${BERSONCAREBOT_WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
BACKUPS_ROOT="/opt/backups/postgres"
PRUNE_DRY_RUN="${BERSONCAREBOT_PRUNE_DRY_RUN:-0}"
JOB_FAMILY="backup"

die() {
  echo "postgres-backup: $*" >&2
  exit 1
}

db_name_from_database_url() {
  local raw="$1"
  raw="${raw#jdbc:}"
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

sql_escape_literal() {
  printf '%s' "$1" | sed "s/'/''/g" | cut -c1-2000
}

backup_job_key() {
  case "$1" in
    pre-migrations) echo 'backup.pre_migrations' ;;
    hourly) echo 'backup.hourly' ;;
    daily) echo 'backup.daily' ;;
    weekly) echo 'backup.weekly' ;;
    manual) echo 'backup.manual' ;;
    prune) echo 'backup.prune' ;;
    *) die "internal: unknown mode for job_key: $1" ;;
  esac
}

tick_job_success() {
  local conn="$1"
  local job_key="$2"
  local duration_ms="$3"
  local started_iso="$4"
  psql "$conn" -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO public.operator_job_status (job_key, job_family, last_status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_duration_ms, last_error, meta_json)
     VALUES ('${job_key}', '${JOB_FAMILY}', 'success', '${started_iso}'::timestamptz, now(), now(), NULL, ${duration_ms}, NULL, '{}'::jsonb)
     ON CONFLICT (job_key) DO UPDATE SET
       job_family = EXCLUDED.job_family,
       last_status = 'success',
       last_started_at = EXCLUDED.last_started_at,
       last_finished_at = now(),
       last_success_at = now(),
       last_failure_at = NULL,
       last_duration_ms = EXCLUDED.last_duration_ms,
       last_error = NULL;" \
    >/dev/null
}

tick_job_failure() {
  local conn="$1"
  local job_key="$2"
  local duration_ms="$3"
  local err_raw="$4"
  local started_iso="$5"
  local err
  err="$(sql_escape_literal "$err_raw")"
  psql "$conn" -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO public.operator_job_status (job_key, job_family, last_status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_duration_ms, last_error, meta_json)
     VALUES ('${job_key}', '${JOB_FAMILY}', 'failure', '${started_iso}'::timestamptz, now(), NULL, now(), ${duration_ms}, '${err}', '{}'::jsonb)
     ON CONFLICT (job_key) DO UPDATE SET
       job_family = EXCLUDED.job_family,
       last_status = 'failure',
       last_started_at = EXCLUDED.last_started_at,
       last_finished_at = now(),
       last_failure_at = now(),
       last_duration_ms = EXCLUDED.last_duration_ms,
       last_error = EXCLUDED.last_error;" \
    >/dev/null
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

run_backup_dumps() {
  local outdir="$1"
  local ts="$2"
  local integrator_url="$3"
  local webapp_url="$4"

  mkdir -p "$outdir"
  if [ "$integrator_url" = "$webapp_url" ]; then
    dump_one "unified" "$integrator_url" "$outdir" "$ts"
  else
    dump_one "integrator" "$integrator_url" "$outdir" "$ts"
    dump_one "webapp" "$webapp_url" "$outdir" "$ts"
  fi
}

prune_delete_file() {
  local f="$1"
  case "$f" in
    "${BACKUPS_ROOT}"/*) ;;
    *) die "refused prune outside ${BACKUPS_ROOT}: $f" ;;
  esac
  if [ "$PRUNE_DRY_RUN" = "1" ]; then
    echo "postgres-backup: [dry-run] would delete: $f"
  else
    rm -f "$f"
  fi
}

prune_dir_age_minutes() {
  local dir="$1"
  local minutes="$2"
  [ -d "$dir" ] || return 0
  while IFS= read -r -d '' f; do
    prune_delete_file "$f"
  done < <(find "$dir" -type f \( -name '*.dump' -o -name '*.sql' -o -name '*.gz' \) -mmin +"$minutes" -print0 2>/dev/null || true)
}

prune_dir_age_days() {
  local dir="$1"
  local days="$2"
  [ -d "$dir" ] || return 0
  while IFS= read -r -d '' f; do
    prune_delete_file "$f"
  done < <(find "$dir" -type f \( -name '*.dump' -o -name '*.sql' -o -name '*.gz' \) -mtime +"$days" -print0 2>/dev/null || true)
}

# Keep the 20 newest backups regardless of age; among older ranks, delete only if mtime > 30 days.
prune_pre_migrations_capped() {
  local dir="${BACKUPS_ROOT}/pre-migrations"
  [ -d "$dir" ] || return 0
  local -a sorted
  mapfile -t sorted < <(find "$dir" -type f \( -name '*.dump' -o -name '*.sql' -o -name '*.gz' \) -printf '%T@\t%p\n' 2>/dev/null | sort -t $'\t' -k1,1nr | cut -f2- || true)
  local i=0
  local f
  for f in "${sorted[@]}"; do
    i=$((i + 1))
    if [ "$i" -le 20 ]; then
      continue
    fi
    if [ -n "$(find "$f" -mtime +30 -print -quit 2>/dev/null || true)" ]; then
      prune_delete_file "$f"
    fi
  done
}

run_prune_retention() {
  echo "postgres-backup: pruning under ${BACKUPS_ROOT} (dry_run=${PRUNE_DRY_RUN})"
  prune_dir_age_minutes "${BACKUPS_ROOT}/hourly" 2880
  prune_dir_age_days "${BACKUPS_ROOT}/daily" 35
  prune_dir_age_days "${BACKUPS_ROOT}/weekly" 84
  prune_pre_migrations_capped
  echo "postgres-backup: prune done"
}

run_mode() {
  local mode="$1"
  local outdir=""
  local job_key
  job_key="$(backup_job_key "$mode")"

  case "$mode" in
    pre-migrations)
      outdir="${BACKUPS_ROOT}/pre-migrations"
      ;;
    hourly)
      outdir="${BACKUPS_ROOT}/hourly"
      ;;
    daily)
      outdir="${BACKUPS_ROOT}/daily"
      ;;
    weekly)
      outdir="${BACKUPS_ROOT}/weekly"
      ;;
    manual)
      outdir="${BACKUPS_ROOT}/manual"
      ;;
    prune)
      ;;
    *)
      die "unknown mode: ${mode} (use: pre-migrations | hourly | daily | weekly | manual | prune)"
      ;;
  esac

  local integrator_url webapp_url
  integrator_url="$(load_database_url "$API_ENV_FILE")"
  webapp_url="$(load_database_url "$WEBAPP_ENV_FILE")"

  local started="$SECONDS"
  local run_started_iso
  run_started_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [ "$mode" = "prune" ]; then
    run_prune_retention
    local dur_ms=$(( (SECONDS - started) * 1000 ))
    tick_job_success "$webapp_url" "$job_key" "$dur_ms" "$run_started_iso" || echo "postgres-backup: warning: operator_job_status tick failed" >&2
    echo "postgres-backup: done (${mode})"
    return 0
  fi

  local ts
  ts="$(date +%Y%m%d_%H%M%S)"
  set +e
  local log
  log="$(run_backup_dumps "$outdir" "$ts" "$integrator_url" "$webapp_url" 2>&1)"
  local rc=$?
  set -e
  echo "$log"
  local dur_ms=$(( (SECONDS - started) * 1000 ))
  if [ "$rc" -ne 0 ]; then
    tick_job_failure "$webapp_url" "$job_key" "$dur_ms" "$log" "$run_started_iso" || true
    die "backup dump failed"
  fi
  tick_job_success "$webapp_url" "$job_key" "$dur_ms" "$run_started_iso" || echo "postgres-backup: warning: operator_job_status tick failed" >&2

  echo "postgres-backup: done (${mode})"
}

main() {
  local mode="${1:-}"
  [ -n "$mode" ] || die "usage: $0 pre-migrations|hourly|daily|weekly|manual|prune"
  run_mode "$mode"
}

main "$@"
