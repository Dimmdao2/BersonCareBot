#!/bin/bash
# Canonical PostgreSQL backup for BersonCareBot production.
# Install on host: sudo install -m 0755 deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
#
# Reads DATABASE_URL from api.prod and webapp.prod as pure data (see
# extract_database_url) — env files are never sourced/executed. After DB
# unification both URLs typically match — one pg_dump is enough (see
# run_backup_dumps).
#
# Modes:
#   pre-migrations | hourly | daily | weekly | manual  → pg_dump + operator_job_status tick
#   prune          → retention only (no dump) + tick
#
# Output artifact per dump: <label>_<dbname>_<ts>.dump.age — a pg_dump custom-format
# stream encrypted with `age` (never written to disk in plaintext), plus a companion
# atomic checksum manifest <artifact>.sha256. The manifest is always published through
# an atomic no-clobber link BEFORE the artifact, so a final-looking artifact can never
# appear without a ready manifest; the manifest is rolled back if artifact publication
# fails or the process is signaled between the two publications. Verify: `cd <dir> && sha256sum
# -c <artifact>.sha256`. Decrypt only with the separately-held age private key (see
# deploy/postgres/README.md); this script never reads or holds that private key.
#
# <dbname> is never derived from the credential-bearing URI authority
# (user:pass@host[:port]) — only from the path segment after it, sanitized to a safe
# slug; a pathless/unusual URI falls back to the fixed label "unknown" (see
# db_name_from_database_url).
#
# Requires `age` in PATH and a non-secret age recipients file (public keys only) at
# BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE (default /opt/backups/age-recipients.txt).
# Fails closed before running pg_dump if any required command, the recipients file, or
# at least one syntactically usable non-comment recipient line, is unavailable.
#
# DATABASE_URL is never passed as a pg_dump/psql command-line argument (not visible in
# argv/`ps`); it is injected only via the PGDATABASE libpq environment variable, which
# libpq accepts as a full connection string (preserves host/port/user/db/sslmode).
#
# BACKUPS_ROOT and every mode output directory must be an absolute, non-root path with
# no symlink component; dump modes fail closed on an unsafe path, prune modes skip and
# warn rather than operate on one (see assert_safe_backup_path / is_safe_backup_dir).
#
# Retention (MVP, fixed): hourly 48h, daily 35d, weekly 12w (84d),
# pre-migrations: always keep the 20 newest COMPLETE generations; among the rest, delete
# only if older than 30 days. An encrypted artifact + its .sha256 manifest count as ONE
# generation; legacy plaintext single-file generations (no manifest) remain generations
# in their own right. An artifact without a manifest, or a manifest without an artifact,
# is an orphan and is pruned unconditionally (see prune_orphans) instead of ever
# occupying a "kept" slot. Prune only touches paths under /opt/backups/postgres/.
#
# DB ticks: `public.operator_job_status` with job_family=backup and job_key backup.hourly | … (see MVP plan).
# A run is reported success only after the encrypted artifact AND its checksum manifest
# exist. Provider failure text is suppressed; operator_job_status receives only a safe
# generic failure message, never a captured connection string or temporary error file.
#
# Env:
#   BERSONCAREBOT_API_ENV_FILE               default /opt/env/bersoncarebot/api.prod
#   BERSONCAREBOT_WEBAPP_ENV_FILE             default /opt/env/bersoncarebot/webapp.prod
#   BERSONCAREBOT_BACKUPS_ROOT                default /opt/backups/postgres (override for tests only)
#   BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE  default /opt/backups/age-recipients.txt
#   BERSONCAREBOT_PRUNE_DRY_RUN=1             print prune actions, do not delete

set -euo pipefail
# A caller may have invoked this script as `bash -x` or inherited xtrace.  Stop
# tracing before reading any credential-bearing dotenv value or invoking a
# provider: neither DATABASE_URL nor provider environment may reach xtrace.
set +x

die() {
  echo "postgres-backup: $*" >&2
  exit 1
}

assert_canonical_prod_host() {
  local current_hostname address found_ip=0
  current_hostname="$(hostname -s 2>/dev/null || true)"
  [ "$current_hostname" = "adelaide" ] ||
    die "refusing PROD backup on host '${current_hostname:-unknown}'; expected adelaide"
  for address in $(hostname -I 2>/dev/null || true); do
    if [ "$address" = "135.106.162.170" ]; then
      found_ip=1
      break
    fi
  done
  [ "$found_ip" -eq 1 ] ||
    die "refusing PROD backup without local IPv4 135.106.162.170"
}

assert_canonical_prod_host

API_ENV_FILE="${BERSONCAREBOT_API_ENV_FILE:-/opt/env/bersoncarebot/api.prod}"
WEBAPP_ENV_FILE="${BERSONCAREBOT_WEBAPP_ENV_FILE:-/opt/env/bersoncarebot/webapp.prod}"
BACKUPS_ROOT="${BERSONCAREBOT_BACKUPS_ROOT:-/opt/backups/postgres}"
AGE_RECIPIENTS_FILE="${BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE:-/opt/backups/age-recipients.txt}"
PRUNE_DRY_RUN="${BERSONCAREBOT_PRUNE_DRY_RUN:-0}"
JOB_FAMILY="backup"

umask 077

# This script never reads a bare $DATABASE_URL variable anywhere (only the
# local return value of extract_database_url), so an inherited DATABASE_URL
# in the calling shell's environment cannot influence which database gets
# backed up. The explicit unset here is defense-in-depth documentation of
# that invariant, not a functional requirement.
unset DATABASE_URL 2>/dev/null || true

declare -a PARTIAL_FILES=()
# Finals created by the currently active logical backup set.  They are kept in
# this shell (not in a command-substitution child) until the complete set has
# succeeded, so a signal or a later split-dump failure can remove only this
# invocation's own pairs.
declare -a CURRENT_RUN_PUBLISHED=()
declare -a CURRENT_RUN_PUBLISHED_PARTIALS=()
PENDING_ORPHAN_MANIFEST=""
PENDING_MANIFEST_PARTIAL=""
PENDING_ARTIFACT=""
PENDING_ARTIFACT_PARTIAL=""
LAST_PUBLISHED_ARTIFACT=""

# Best-effort durability for a just-written file; never fatal.
fsync_path() {
  sync "$1" 2>/dev/null || true
}

trim_whitespace() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

trim_underscores() {
  local s="$1"
  s="${s#"${s%%[!_]*}"}"
  s="${s%"${s##*[!_]}"}"
  printf '%s' "$s"
}

is_normalized_nonroot_absolute_path() {
  local path="$1"
  case "$path" in
    /*) ;;
    *) return 1 ;;
  esac
  [ "$path" != "/" ] || return 1
  case "$path" in
    *'//'*) return 1 ;;
    */./*|*/../*|*/.|*/..|*/) return 1 ;;
  esac
  return 0
}

# True (0) only if no already-existing component of the given absolute path
# is a symlink. Pure parameter-expansion path splitting — no IFS array
# splitting, no globbing — so a component containing shell-special
# characters can never be mis-parsed or trigger pathname expansion.
path_has_no_symlink_components() {
  local path="$1" walk="" rest seg
  rest="${path#/}"
  while [ -n "$rest" ]; do
    seg="${rest%%/*}"
    if [ "$seg" = "$rest" ]; then
      rest=""
    else
      rest="${rest#*/}"
    fi
    walk="${walk}/${seg}"
    [ -L "$walk" ] && return 1
  done
  return 0
}

# Fail closed (die) on an unsafe backup path: must be absolute, not the
# filesystem root, no symlink component anywhere in it, and (if it already
# exists) a real directory — never a regular file/socket/device/fifo. Called
# before any mkdir/chmod/write/publication under the path.
assert_safe_backup_path() {
  local path="$1"
  is_normalized_nonroot_absolute_path "$path" || die "refusing non-canonical backup path (must be absolute, non-root, no dot components): ${path}"
  path_has_no_symlink_components "$path" || die "refusing path with a symlink component: ${path}"
  if [ -e "$path" ] && [ ! -d "$path" ]; then
    die "refusing existing non-directory node at backup path: ${path}"
  fi
}

# Non-fatal counterpart used by prune: true only if the path is under
# BACKUPS_ROOT, is an existing directory, and has no symlink component.
# Never follows a symlink to decide — callers skip (not redirect into) an
# unsafe existing directory.
is_safe_backup_dir() {
  local path="$1"
  is_normalized_nonroot_absolute_path "$BACKUPS_ROOT" || return 1
  is_normalized_nonroot_absolute_path "$path" || return 1
  case "$path" in
    "${BACKUPS_ROOT}"/*|"${BACKUPS_ROOT}") ;;
    *) return 1 ;;
  esac
  [ -d "$path" ] || return 1
  path_has_no_symlink_components "$path"
}

ensure_dir_0700() {
  assert_safe_backup_path "$1" || return 1
  mkdir -p "$1" || return 1
  # Check again after mkdir: every component that now exists must still be a
  # real directory, not a symlink substituted while the directory was made.
  assert_safe_backup_path "$1" || return 1
  chmod 0700 "$1" || return 1
}

# Roll back every temporary/pending resource this run created: exact
# tracked .partial paths under BACKUPS_ROOT, a checksum manifest that was
# already published but whose paired artifact has not completed, and final
# pairs from the active logical set. Never touches an earlier valid
# generation (only ever exact tracked paths, never a glob). Runs on normal
# exit (no-op — partials were removed and finals were untracked) and on
# every trapped signal below.
cleanup_partials() {
  local f
  if [ -n "$PENDING_ORPHAN_MANIFEST" ]; then
    # Pending ownership is registered before either link is attempted.  A
    # final can be removed only while its retained source partial proves the
    # same inode; a same-name collision/replacement is never ours to delete.
    if [ -n "$PENDING_ARTIFACT" ] && [ -n "$PENDING_ARTIFACT_PARTIAL" ] &&
      [ -e "$PENDING_ARTIFACT_PARTIAL" ] && [ "$PENDING_ARTIFACT" -ef "$PENDING_ARTIFACT_PARTIAL" ]; then
      rm -f -- "$PENDING_ARTIFACT" 2>/dev/null || true
    fi
    if [ -n "$PENDING_MANIFEST_PARTIAL" ] && [ -e "$PENDING_MANIFEST_PARTIAL" ] &&
      [ "$PENDING_ORPHAN_MANIFEST" -ef "$PENDING_MANIFEST_PARTIAL" ]; then
      rm -f -- "$PENDING_ORPHAN_MANIFEST" 2>/dev/null || true
    fi
    PENDING_ORPHAN_MANIFEST=""
    PENDING_MANIFEST_PARTIAL=""
    PENDING_ARTIFACT=""
    PENDING_ARTIFACT_PARTIAL=""
  fi
  local i source
  for i in "${!CURRENT_RUN_PUBLISHED[@]}"; do
    f="${CURRENT_RUN_PUBLISHED[$i]}"
    source="${CURRENT_RUN_PUBLISHED_PARTIALS[$i]:-}"
    [ -n "$f" ] || continue
    case "$f" in "${BACKUPS_ROOT}"/*) ;; *) continue ;; esac
    [ -n "$source" ] && [ -e "$source" ] && [ "$f" -ef "$source" ] && rm -f -- "$f" 2>/dev/null || true
  done
  CURRENT_RUN_PUBLISHED=()
  CURRENT_RUN_PUBLISHED_PARTIALS=()
  # Source partials are inode witnesses for the final cleanup above, so they
  # must be removed only after that proof has been evaluated.
  for f in "${PARTIAL_FILES[@]}"; do
    [ -n "$f" ] || continue
    case "$f" in
      "${BACKUPS_ROOT}"/*) rm -f -- "$f" 2>/dev/null || true ;;
      *) ;;
    esac
  done
}

# INT/TERM/HUP are trapped explicitly (not relied on implicitly via EXIT)
# so a signal mid-run always cleans up tracked partials/pending manifest
# before the process actually terminates, with the conventional 128+signum
# exit code.
on_terminating_signal() {
  local sig="$1"
  cleanup_partials
  trap - EXIT INT TERM HUP
  case "$sig" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
    HUP) exit 129 ;;
    *) exit 1 ;;
  esac
}

trap cleanup_partials EXIT
trap 'on_terminating_signal INT' INT
trap 'on_terminating_signal TERM' TERM
trap 'on_terminating_signal HUP' HUP

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found in PATH: $1"
}

# Fail closed, before any pg_dump/age invocation, if any command this script
# needs after pg_dump (encrypt, checksum, safe publish) is missing, or if
# the configured age binary rejects any recipients-file line.  An empty stdin
# makes this parser preflight produce no ciphertext while still exercising the
# exact configured binary and its complete `-R` parser.
require_backup_prereqs() {
  require_command pg_dump
  require_command psql
  require_command sha256sum
  require_command age
  require_command ln
  require_command rm
  require_command mkdir
  require_command chmod
  require_command basename
  require_command sed
  require_command cut
  require_command tr
  require_command date
  [ -n "${AGE_RECIPIENTS_FILE:-}" ] || die "age recipients file path is empty (BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE)"
  [ -r "$AGE_RECIPIENTS_FILE" ] || die "age recipients file not readable: ${AGE_RECIPIENTS_FILE}"
  [ -s "$AGE_RECIPIENTS_FILE" ] || die "age recipients file is empty: ${AGE_RECIPIENTS_FILE}"
  age -R "$AGE_RECIPIENTS_FILE" -o /dev/null </dev/null >/dev/null 2>&1 || die "age recipients file is invalid: ${AGE_RECIPIENTS_FILE}"
}

require_prune_prereqs() {
  require_command find
  require_command sort
  require_command rm
}

# Derive a filesystem-safe, non-secret database-name segment from a
# postgres(ql):// URI for use only in artifact filenames/labels — never
# derived from the credential-bearing authority (user:pass@host[:port]).
# Only the path segment strictly after the LAST unescaped '@' and the first
# '/' following it is ever inspected; a pathless or unusual URI (no '/'
# after the host) falls back to the fixed non-secret label "unknown"
# instead of ever touching the authority.
db_name_from_database_url() {
  local raw="$1"
  raw="${raw#jdbc:}"
  raw="${raw%%\?*}"
  raw="${raw%%#*}"

  case "$raw" in
    postgres://*) raw="${raw#postgres://}" ;;
    postgresql://*) raw="${raw#postgresql://}" ;;
    *) printf '%s' "unknown"; return 0 ;;
  esac

  local hostpart="$raw"
  case "$raw" in
    *@*) hostpart="${raw##*@}" ;;
  esac

  local candidate=""
  case "$hostpart" in
    */*) candidate="${hostpart#*/}" ;;
  esac

  candidate="$(printf '%s' "$candidate" | tr -c 'A-Za-z0-9_-' '_')"
  candidate="${candidate:0:63}"
  candidate="$(trim_underscores "$candidate")"

  if [ -n "$candidate" ]; then
    printf '%s' "$candidate"
  else
    printf '%s' "unknown"
  fi
}

# Extract DATABASE_URL from an env file as pure data — the file is read
# line-by-line and never sourced/executed/eval'd, so no line can run a
# command or expand host state regardless of its content, and an inherited
# DATABASE_URL from the calling environment can never leak through (this
# function never reads a bare $DATABASE_URL variable). Accepts exactly one
# line of the documented dotenv form `DATABASE_URL=value` or a fully quoted
# value. Blank lines/full-line comments and unrelated normal dotenv entries
# are inert data. Any malformed attempt to assign DATABASE_URL is rejected.
extract_database_url() {
  local envfile="$1"
  [ -f "$envfile" ] || die "env file not found: ${envfile}"

  local value="" found=0 line raw quoted
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac
    case "$line" in
      DATABASE_URL=*)
        found=$((found + 1))
        raw="${line#DATABASE_URL=}"
        quoted=0
        case "$raw" in
          \')
            die "DATABASE_URL is empty in ${envfile}"
            ;;
          \'*)
            case "$raw" in *\') raw="${raw#\'}"; raw="${raw%\'}"; quoted=1 ;; *) die "DATABASE_URL has an unterminated single-quoted value in ${envfile}" ;; esac
            ;;
          \"*)
            case "$raw" in *\") raw="${raw#\"}"; raw="${raw%\"}"; quoted=1 ;; *) die "DATABASE_URL has an unterminated double-quoted value in ${envfile}" ;; esac
            ;;
          *\'*|*\"*) die "DATABASE_URL has malformed quoting in ${envfile}" ;;
        esac
        [ "$quoted" -eq 1 ] || case "$raw" in *[[:space:]]*) die "DATABASE_URL has whitespace in an unquoted value in ${envfile}" ;; esac
        value="$raw"
        ;;
      DATABASE_URL|DATABASE_URL[[:space:]]*|export[[:space:]]DATABASE_URL|export[[:space:]]DATABASE_URL=*|export[[:space:]]DATABASE_URL[[:space:]]*)
        die "DATABASE_URL assignment is malformed in ${envfile}"
        ;;
      *) ;;
    esac
  done < "$envfile"

  [ "$found" -eq 1 ] || die "expected exactly one DATABASE_URL assignment in ${envfile}, found ${found}"
  [ -n "$value" ] || die "DATABASE_URL is empty in ${envfile}"
  case "$value" in
    *'$'*|*'`'*|*'\'*|*';'*|*'|'*|*'&'*|*'<'*|*'>'*|*'('*|*')'*)
      die "DATABASE_URL in ${envfile} contains a disallowed character" ;;
  esac
  case "$value" in
    postgres://*|postgresql://*) ;;
    *) die "DATABASE_URL in ${envfile} is not a postgres(ql):// URI" ;;
  esac
  printf '%s' "$value"
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

# All psql calls below authenticate via the PGDATABASE libpq environment
# variable (accepts a full postgres:// connection string), never via argv —
# DATABASE_URL is never visible in `ps`/process argv.
tick_job_success() {
  local conn="$1"
  local job_key="$2"
  local duration_ms="$3"
  local started_iso="$4"
  PGDATABASE="$conn" psql -v ON_ERROR_STOP=1 -q -c \
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
    >/dev/null 2>&1
}

tick_job_failure() {
  local conn="$1"
  local job_key="$2"
  local duration_ms="$3"
  local err_raw="$4"
  local started_iso="$5"
  local err
  err="$(sql_escape_literal "$err_raw")"
  PGDATABASE="$conn" psql -v ON_ERROR_STOP=1 -q -c \
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
    >/dev/null 2>&1
}

# pg_dump streams straight into `age`; no plaintext dump ever touches disk. The
# ciphertext and its checksum manifest are each written to a same-directory,
# per-run-unique .partial path (PID + random token, so two concurrent runs can
# never corrupt each other's in-flight partial), fsynced best-effort, then
# atomically hard-linked into place. `ln` creates the final directory entry
# only if it does not yet exist; unlike a check-then-replace move, it cannot overwrite
# a same-second/concurrent generation. Publication order is manifest THEN
# artifact, so an external observer can never see a final-looking artifact
# without a ready manifest; if artifact publication fails, the manifest linked
# by this invocation is rolled back. Any failure leaves no partial/plaintext
# artifact behind and never disturbs an earlier generation.
dump_one() {
  local label="$1"
  local conn="$2"
  local outdir="$3"
  local ts="$4"
  local dbname
  dbname="$(db_name_from_database_url "$conn")"
  local outfile="${outdir}/${label}_${dbname}_${ts}.dump.age"
  local checksum_file="${outfile}.sha256"
  local run_token="$$_${RANDOM}${RANDOM}"
  local partial="${outfile}.${run_token}.partial"
  local checksum_partial="${checksum_file}.${run_token}.partial"

  LAST_PUBLISHED_ARTIFACT=""
  PENDING_ORPHAN_MANIFEST=""
  PENDING_MANIFEST_PARTIAL=""
  PENDING_ARTIFACT=""
  PENDING_ARTIFACT_PARTIAL=""

  if [ -e "$outfile" ] || [ -e "$checksum_file" ]; then
    echo "postgres-backup: refusing to clobber an existing generation for ${label}: ${outfile}" >&2
    return 1
  fi

  echo "postgres-backup: writing ${outfile}"

  PARTIAL_FILES+=("$partial")
  # Provider stderr may echo a credential-bearing conninfo. Suppress it and
  # expose only this generic, safe diagnostic.
  if ! PGDATABASE="$conn" pg_dump -Fc --no-owner --no-acl 2>/dev/null | age -R "$AGE_RECIPIENTS_FILE" -o "$partial" 2>/dev/null; then
    echo "postgres-backup: pg_dump/age pipeline failed for ${label}" >&2
    return 1
  fi
  [ -s "$partial" ] || { echo "postgres-backup: empty encrypted artifact for ${label}" >&2; return 1; }
  if ! chmod 0600 "$partial"; then
    echo "postgres-backup: artifact permission setup failed for ${label}" >&2
    return 1
  fi
  fsync_path "$partial"

  # Hash the ciphertext while it is still the (tracked, cleanup-eligible) .partial
  # file — never after publication — so a checksum failure can never strand a final-
  # named artifact without a matching manifest.
  local digest
  if ! digest="$(sha256sum "$partial" | cut -d' ' -f1)"; then
    echo "postgres-backup: checksum computation failed for ${label}" >&2
    return 1
  fi
  [ -n "$digest" ] || { echo "postgres-backup: empty checksum for ${label}" >&2; return 1; }

  PARTIAL_FILES+=("$checksum_partial")
  local manifest_basename
  if ! manifest_basename="$(basename "$outfile")"; then
    echo "postgres-backup: checksum manifest basename failed for ${label}" >&2
    return 1
  fi
  if [ "${BERSONCAREBOT_TEST_FAIL_MANIFEST_WRITE:-0}" = "1" ]; then
    echo "postgres-backup: checksum manifest write failed for ${label}" >&2
    return 1
  fi
  if ! printf '%s  %s\n' "$digest" "$manifest_basename" > "$checksum_partial"; then
    echo "postgres-backup: checksum manifest write failed for ${label}" >&2
    return 1
  fi
  if ! chmod 0600 "$checksum_partial"; then
    echo "postgres-backup: checksum manifest permission setup failed for ${label}" >&2
    return 1
  fi
  fsync_path "$checksum_partial"

  # `ln` is the collision-safe commit primitive. Its EEXIST result covers the
  # race that an earlier `-e` check cannot cover. Removing a partial only after
  # a successful link preserves the exact bytes we checksummed.
  # Register both expected final/source inode pairs before publication.  The
  # source partials intentionally remain until the entire logical set commits,
  # so signal/failure cleanup can prove ownership instead of deleting a
  # concurrent collision by pathname alone.
  PENDING_ORPHAN_MANIFEST="$checksum_file"
  PENDING_MANIFEST_PARTIAL="$checksum_partial"
  PENDING_ARTIFACT="$outfile"
  PENDING_ARTIFACT_PARTIAL="$partial"
  if ! ln -- "$checksum_partial" "$checksum_file"; then
    echo "postgres-backup: checksum publication failed or collided for ${label}" >&2
    PENDING_ORPHAN_MANIFEST=""
    PENDING_MANIFEST_PARTIAL=""
    PENDING_ARTIFACT=""
    PENDING_ARTIFACT_PARTIAL=""
    return 1
  fi
  if ! ln -- "$partial" "$outfile"; then
    echo "postgres-backup: artifact publication failed or collided for ${label}; rolling back published checksum manifest" >&2
    cleanup_partials
    PENDING_ORPHAN_MANIFEST=""
    PENDING_MANIFEST_PARTIAL=""
    PENDING_ARTIFACT=""
    PENDING_ARTIFACT_PARTIAL=""
    return 1
  fi
  CURRENT_RUN_PUBLISHED+=("$outfile" "$checksum_file")
  CURRENT_RUN_PUBLISHED_PARTIALS+=("$partial" "$checksum_partial")
  PENDING_ORPHAN_MANIFEST=""
  PENDING_MANIFEST_PARTIAL=""
  PENDING_ARTIFACT=""
  PENDING_ARTIFACT_PARTIAL=""
  LAST_PUBLISHED_ARTIFACT="$outfile"
}

run_backup_dumps() {
  local outdir="$1"
  local ts="$2"
  local integrator_url="$3"
  local webapp_url="$4"

  if ! ensure_dir_0700 "$outdir"; then
    echo "postgres-backup: backup directory setup failed: ${outdir}" >&2
    return 1
  fi
  # Each dump is checked explicitly — a later successful dump must not mask an
  # earlier failure.
  local rc=0
  local -a published=()
  if [ "$integrator_url" = "$webapp_url" ]; then
    if dump_one "unified" "$integrator_url" "$outdir" "$ts"; then
      published+=("$LAST_PUBLISHED_ARTIFACT")
    else
      rc=1
    fi
  else
    if dump_one "integrator" "$integrator_url" "$outdir" "$ts"; then
      published+=("$LAST_PUBLISHED_ARTIFACT")
    else
      rc=1
    fi
    if dump_one "webapp" "$webapp_url" "$outdir" "$ts"; then
      published+=("$LAST_PUBLISHED_ARTIFACT")
    else
      rc=1
    fi
  fi

  # A split run is one logical backup set: if either DB's dump failed, any
  # generation already published earlier in THIS run is rolled back too, so
  # a failed run never leaves a lone current-run pair behind. Earlier runs'
  # valid generations are untouched (published[] only ever holds paths
  # produced by this invocation).
  if [ "$rc" -ne 0 ] && ((${#published[@]})); then
    echo "postgres-backup: rolling back generations published earlier in this failed run" >&2
    cleanup_partials
  fi

  # A complete set no longer needs signal rollback: reporting a tick failure
  # must not delete an otherwise valid pair. The retained partial sources are
  # removed by the EXIT cleanup after this ownership list is deliberately
  # cleared.
  if [ "$rc" -eq 0 ]; then
    CURRENT_RUN_PUBLISHED=()
    CURRENT_RUN_PUBLISHED_PARTIALS=()
  fi
  return "$rc"
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

# One backup generation = the primary artifact + its .sha256 companion (if present).
# The companion is never counted as a separate generation (find never matches it
# directly — it only ever gets deleted alongside its primary).
prune_delete_generation() {
  local primary="$1"
  prune_delete_file "$primary"
  local companion="${primary}.sha256"
  if [ -e "$companion" ]; then
    prune_delete_file "$companion"
  fi
}

# Primary-artifact name patterns: new encrypted suffix plus legacy plaintext suffixes
# (pre-existing unencrypted dumps still age out on the same schedule).
ARTIFACT_NAME_ARGS=(-name '*.dump.age' -o -name '*.dump' -o -name '*.sql' -o -name '*.gz')
# Only the new encrypted format is pairing-sensitive — legacy plaintext dumps predate
# the checksum-manifest feature and were never expected to have a `.sha256` companion.
ENCRYPTED_ARTIFACT_NAME_ARGS=(-name '*.dump.age')

prune_dir_age_minutes() {
  local dir="$1"
  local minutes="$2"
  [ -d "$dir" ] || return 0
  if ! is_safe_backup_dir "$dir"; then
    echo "postgres-backup: skipping prune of unsafe path (symlink component or outside root): ${dir}" >&2
    return 0
  fi
  while IFS= read -r -d '' f; do
    prune_delete_generation "$f"
  done < <(find "$dir" -maxdepth 1 -type f \( "${ARTIFACT_NAME_ARGS[@]}" \) -mmin +"$minutes" -print0 2>/dev/null || true)
}

prune_dir_age_days() {
  local dir="$1"
  local days="$2"
  [ -d "$dir" ] || return 0
  if ! is_safe_backup_dir "$dir"; then
    echo "postgres-backup: skipping prune of unsafe path (symlink component or outside root): ${dir}" >&2
    return 0
  fi
  while IFS= read -r -d '' f; do
    prune_delete_generation "$f"
  done < <(find "$dir" -maxdepth 1 -type f \( "${ARTIFACT_NAME_ARGS[@]}" \) -mtime +"$days" -print0 2>/dev/null || true)
}

# An artifact without its manifest, or a manifest without its artifact, is never a
# usable/restorable backup on its own — prune both unconditionally (regardless of age)
# instead of ever letting either occupy a "kept" slot meant for a real generation. A
# 1-minute mtime grace window avoids racing a healthy in-flight dump_one publish
# (whose manifest briefly exists slightly before its artifact by design).
prune_orphans() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  if ! is_safe_backup_dir "$dir"; then
    echo "postgres-backup: skipping orphan prune of unsafe path (symlink component or outside root): ${dir}" >&2
    return 0
  fi
  local f
  while IFS= read -r -d '' f; do
    if [ ! -e "${f}.sha256" ]; then
      echo "postgres-backup: pruning orphan artifact without a manifest: ${f}" >&2
      prune_delete_file "$f"
    fi
  done < <(find "$dir" -maxdepth 1 -type f \( "${ENCRYPTED_ARTIFACT_NAME_ARGS[@]}" \) -mmin +1 -print0 2>/dev/null || true)

  while IFS= read -r -d '' f; do
    local primary="${f%.sha256}"
    if [ ! -e "$primary" ]; then
      echo "postgres-backup: pruning orphan manifest without an artifact: ${f}" >&2
      prune_delete_file "$f"
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name '*.sha256' -mmin +1 -print0 2>/dev/null || true)
}

# Keep the 20 newest COMPLETE generations regardless of age; among older ranks, delete
# only if mtime > 30 days. Ranked by primary artifact only — the .sha256 companion never
# appears in this list, so it can never be double-counted as its own generation. NUL-safe:
# mtime and path travel as two separate NUL-terminated fields (never newline/tab-joined
# text), so a filename containing whitespace/tabs/newlines can never corrupt field
# parsing; only the numeric mtime (never the filename) is ever sorted as text.
prune_pre_migrations_capped() {
  local dir="${BACKUPS_ROOT}/pre-migrations"
  [ -d "$dir" ] || return 0
  if ! is_safe_backup_dir "$dir"; then
    echo "postgres-backup: skipping capped prune of unsafe path (symlink component or outside root): ${dir}" >&2
    return 0
  fi

  local -a mtimes=() paths=()
  local mt p
  while IFS= read -r -d '' mt && IFS= read -r -d '' p; do
    case "$p" in
      *.dump.age) [ -f "${p}.sha256" ] || continue ;;
    esac
    mtimes+=("$mt")
    paths+=("$p")
  done < <(find "$dir" -maxdepth 1 -type f \( "${ARTIFACT_NAME_ARGS[@]}" \) -printf '%T@\0%p\0' 2>/dev/null || true)

  local n="${#paths[@]}"
  ((n)) || return 0

  local -a order
  mapfile -t order < <(
    local i
    for ((i = 0; i < n; i++)); do
      printf '%s\t%d\n' "${mtimes[$i]}" "$i"
    done | sort -t $'\t' -k1,1nr | cut -f2
  )

  local rank=0
  local idx f
  for idx in "${order[@]}"; do
    rank=$((rank + 1))
    f="${paths[$idx]}"
    if [ "$rank" -le 20 ]; then
      continue
    fi
    if [ -n "$(find "$f" -mtime +30 -print -quit 2>/dev/null || true)" ]; then
      prune_delete_generation "$f"
    fi
  done
}

run_prune_retention() {
  echo "postgres-backup: pruning under ${BACKUPS_ROOT} (dry_run=${PRUNE_DRY_RUN})"
  prune_orphans "${BACKUPS_ROOT}/hourly"
  prune_orphans "${BACKUPS_ROOT}/daily"
  prune_orphans "${BACKUPS_ROOT}/weekly"
  prune_orphans "${BACKUPS_ROOT}/pre-migrations"
  prune_orphans "${BACKUPS_ROOT}/manual"
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

  require_command psql
  if [ "$mode" != "prune" ]; then
    require_backup_prereqs
  else
    require_prune_prereqs
  fi

  ensure_dir_0700 "$BACKUPS_ROOT"

  local integrator_url webapp_url
  integrator_url="$(extract_database_url "$API_ENV_FILE")"
  webapp_url="$(extract_database_url "$WEBAPP_ENV_FILE")"

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
  # Do not run the stateful backup coordinator in command substitution: that
  # would create a subshell and strand its trap/rollback state. Provider stderr
  # is already suppressed at its source; this function prints only safe generic
  # messages directly from the current shell.
  local rc=0
  if run_backup_dumps "$outdir" "$ts" "$integrator_url" "$webapp_url"; then
    rc=0
  else
    rc=$?
  fi
  local dur_ms=$(( (SECONDS - started) * 1000 ))
  if [ "$rc" -ne 0 ]; then
    tick_job_failure "$webapp_url" "$job_key" "$dur_ms" "backup dump failed" "$run_started_iso" || true
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
