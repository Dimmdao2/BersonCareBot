#!/usr/bin/env bash
set -Eeuo pipefail

# HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
# Kept only as source evidence for the completed archive/drop migration; it is not live deploy tooling.
#
# Решение владельца 2026-07-29: «Rubitime у нас больше нет — убирать в архив явно».
# This copy is deliberately inert. Recover an earlier revision from git only for a separately approved
# historical audit; never run it against DEV, TEST or PROD.
echo "ARCHIVED/INERT: Rubitime retired 2026-07-27; this one-shot is not an operator entrypoint." >&2
exit 64
#
# R7 archive-then-drop tooling (B-7(b) of docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md §8).
#
# Replaces the PROSE-ONLY archive block of
# docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md §3 with one reusable,
# idempotent, fail-closed script. Order is fixed and non-negotiable:
#
#   1. GATE     explicit --execute flag + exact operator-supplied expected database name
#   2. ARCHIVE  pg_dump --data-only of the doc-derived target tables into a timestamped directory
#   3. SUMS     SHA256SUMS over every produced artifact
#   4. VERIFY   artifacts readable + non-empty + hash-matching + archived row count == live row count
#   5. DROP     ONLY after VERIFY passes, and ONLY by handing off to the normal repo migration chain
#
# NEVER an ad-hoc DROP TABLE (runbook §4 "Migration Rules": "Generate a normal repo migration; do not
# run ad hoc DROP TABLE"). This script therefore never issues DDL itself. The drop lives in
# apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql and is reached only
# via `pnpm run migrate` (--then-drop).
#
# --------------------------------------------------------------------------------------------------
# ARCHIVE TARGET LIST — derived from the docs, not invented. Each line cites its authorizing doc line.
#
#   public.appointment_records
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:175  ("Archive candidates: - `public.appointment_records`")
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:206  (`archive_before_drop`)
#     RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:44 + :111 (explicit pg_dump command)
#   integrator.rubitime_records
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:176 + :207 (`archive_before_drop`)
#     RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:45 + :112
#   integrator.rubitime_events
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:177 + :208 (`archive_before_drop`)
#     RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:46 + :113
#   public.rubitime_records          (the "rubitime-mirror"/public-shadow table)
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:178 + :209 (`archive_if_present`)
#     RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:47
#   public.rubitime_events           (the "rubitime-mirror"/public-shadow table)
#     RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md:179 + :209 (`archive_if_present`)
#     RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:47
#
# NOT archived (deliberate, doc-derived): the five R7 drop candidates
# (`integrator.rubitime_api_throttle`, `rubitime_booking_profiles`, `rubitime_branches`,
# `rubitime_services`, `rubitime_cooperators`). They are provider config/catalog mirrors, listed under
# "Drop/defer candidates" (DB_CLEANUP_SEQUENCE.md:215-219) and are absent from every "Archive
# candidates" list in all three docs. Adding them would expand the doc-approved archive set.
#
# KEEP-LIST — never dumped, never dropped, never referenced by this script or its migration
# (RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:31-38, R7_TABLE_DISPOSITION.md:35-38):
#   public.patient_bookings · public.be_external_entity_mappings · integrator.booking_calendar_map
#   integrator.message_retry_jobs · public.booking_* catalog tables (blocked on Track C R3-CATALOG)
#
# DROP AUTHORIZATION IS NARROWER THAN THE ARCHIVE LIST. Archiving is non-destructive, so all five
# tables above are archived. The drop migration this script hands off to drops ONLY the two public
# rubitime-mirror tables. Explicitly NOT dropped:
#   - public.appointment_records: RUNBOOK.md:128 "Do not drop `public.appointment_records` until every
#     runtime reference is gone"; R7_TABLE_DISPOSITION.md:126-150 documents heavy live read/write
#     traffic and rules "KEEP for now, ARCHIVE+DROP deferred". Its archive is authored here; its drop
#     is not authorable yet.
#   - integrator.rubitime_records / integrator.rubitime_events and the five drop candidates: already
#     dropped by the landed migration
#     apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql
#     (R7_TABLE_DISPOSITION.md:79-105). Not re-authored here; only archived (they return with any
#     fresh pre-SaaS prod dump, which is exactly why the archive must run before that migration).
# --------------------------------------------------------------------------------------------------

REPO_ROOT="$(realpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
DROP_MIGRATION_REL="apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql"

# Doc-derived archive targets. Order is the doc order. Keep in sync with the static gate.
ARCHIVE_TARGETS=(
  "public.appointment_records"
  "integrator.rubitime_records"
  "integrator.rubitime_events"
  "public.rubitime_records"
  "public.rubitime_events"
)

# Hard KEEP-list. Any appearance of one of these as an archive/drop target is a bug; asserted below.
KEEP_LIST=(
  "public.patient_bookings"
  "public.be_external_entity_mappings"
  "integrator.booking_calendar_map"
  "integrator.message_retry_jobs"
)

EXECUTE=0
THEN_DROP=0
DATABASE_URL_ARG=""
EXPECTED_DATABASE=""
ARCHIVE_BASE=""
ALLOW_AUTHORIZED_PROD_TARGET=0
AUTHORIZED_PROD_DATABASE=""
VIA_SUDO_POSTGRES=0

usage() {
  cat <<EOF
Usage:
  bash deploy/host/archive-rubitime-retirement-tables.sh \\
    --execute \\
    --database-url=<postgres url> \\
    --expected-database=<exact current_database() name> \\
    --archive-dir=<base dir OUTSIDE the repo> \\
    [--via-sudo-postgres] \\
    [--then-drop] \\
    [--allow-authorized-prod-target --authorized-prod-database=<exact name>]

Archives (pg_dump --data-only) the doc-derived R7 archive-before-drop tables into
<archive-dir>/rubitime-retirement-<UTC timestamp>/, writes SHA256SUMS, and VERIFIES the archive
before anything destructive is allowed to happen.

Refuses to do anything without --execute (default = refuse). Refuses unless current_database()
equals --expected-database EXACTLY. Refuses any non-loopback / non-local-socket database host,
always, with or without any flag. Refuses a prod/production/live-named database unless BOTH
--allow-authorized-prod-target AND a verbatim-matching --authorized-prod-database are supplied
(mirrors deploy/postgres/test-strict-rls-finalizer.sql and
apps/webapp/scripts/purge-placeholder-bookings-safety.ts).

Idempotent: each run writes its own timestamped directory and never mutates an existing one.
Missing tables are recorded as to_regclass() evidence, never silently treated as archived
(RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:120).

--then-drop, allowed ONLY after VERIFY passes, hands off to the NORMAL repo migration chain
(pnpm run migrate). It never issues DROP TABLE itself. The drop it reaches is
$DROP_MIGRATION_REL and covers ONLY
public.rubitime_records / public.rubitime_events. public.appointment_records is NOT dropped.
EOF
}

fatal() {
  echo "FATAL: $*" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=1 ;;
    --then-drop) THEN_DROP=1 ;;
    --via-sudo-postgres) VIA_SUDO_POSTGRES=1 ;;
    --allow-authorized-prod-target) ALLOW_AUTHORIZED_PROD_TARGET=1 ;;
    --database-url=*) DATABASE_URL_ARG="${arg#*=}" ;;
    --expected-database=*) EXPECTED_DATABASE="${arg#*=}" ;;
    --archive-dir=*) ARCHIVE_BASE="${arg#*=}" ;;
    --authorized-prod-database=*) AUTHORIZED_PROD_DATABASE="${arg#*=}" ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fatal "unknown argument: $arg" ;;
  esac
done

# ---------------------------------------------------------------------------------------------
# 1. GATE
# ---------------------------------------------------------------------------------------------

if [[ "$EXECUTE" -ne 1 ]]; then
  usage >&2
  fatal "refusing to run without the explicit --execute flag (default is refuse)"
fi
[[ -n "$DATABASE_URL_ARG" ]] || fatal "refusing without --database-url"
[[ -n "$EXPECTED_DATABASE" ]] || fatal "refusing without --expected-database (the exact expected current_database())"
[[ -n "$ARCHIVE_BASE" ]] || fatal "refusing without --archive-dir"

for command in pg_dump psql sha256sum realpath awk date mktemp; do
  command -v "$command" >/dev/null 2>&1 || fatal "required command is unavailable: $command"
done
if [[ "$VIA_SUDO_POSTGRES" -eq 1 ]]; then
  command -v sudo >/dev/null 2>&1 || fatal "required command is unavailable: sudo"
  [[ "$EUID" -ne 0 ]] || fatal "run this wrapper as the non-root repository owner; it uses sudo only for PostgreSQL access"
fi

# Self-assertion: the doc-derived target list must never intersect the KEEP-list.
for keep in "${KEEP_LIST[@]}"; do
  for target in "${ARCHIVE_TARGETS[@]}"; do
    [[ "$target" != "$keep" ]] || fatal "keep-list violation: $keep is present in ARCHIVE_TARGETS"
  done
done
for target in "${ARCHIVE_TARGETS[@]}"; do
  case "$target" in
    public.booking_*|*.booking_calendar_map|*.patient_bookings|*.be_external_entity_mappings|*.message_retry_jobs)
      fatal "keep-list violation: $target must never be an archive target" ;;
  esac
done

# --- database URL shape gate (mirrors purge-placeholder-bookings-safety.ts) ---
db_url_rest=""
case "$DATABASE_URL_ARG" in
  postgres://*) db_url_rest="${DATABASE_URL_ARG#postgres://}" ;;
  postgresql://*) db_url_rest="${DATABASE_URL_ARG#postgresql://}" ;;
  *) fatal "refusing_non_postgres_database_url" ;;
esac

db_url_query=""
if [[ "$db_url_rest" == *"?"* ]]; then
  db_url_query="${db_url_rest#*\?}"
  db_url_rest="${db_url_rest%%\?*}"
fi
db_url_authority="${db_url_rest%%/*}"
db_url_path=""
if [[ "$db_url_rest" == */* ]]; then
  db_url_path="${db_url_rest#*/}"
fi
[[ -n "$db_url_path" && "$db_url_path" != */* ]] || fatal "refusing_unparsable_database_name_in_url"

db_url_host="$db_url_authority"
if [[ "$db_url_host" == *"@"* ]]; then
  db_url_host="${db_url_host##*@}"
fi
if [[ "$db_url_host" == "["*"]"* ]]; then
  db_url_host="${db_url_host%%]*}]"
elif [[ "$db_url_host" == *:* ]]; then
  db_url_host="${db_url_host%%:*}"
fi
if [[ -z "$db_url_host" ]]; then
  # Socket form: postgresql:///<db>?host=/var/run/postgresql
  for pair in ${db_url_query//&/ }; do
    [[ "$pair" == host=* ]] && db_url_host="${pair#host=}"
  done
fi
[[ -n "$db_url_host" ]] || fatal "refusing_database_url_without_host"

case "$db_url_host" in
  127.0.0.1|localhost|::1|"[::1]") ;;
  /*) [[ -d "$db_url_host" ]] || fatal "refusing_nonexistent_local_socket_directory" ;;
  # The owner-gated prod flag NEVER relaxes this: an authorized prod cutover is still loopback-only,
  # run ON the prod host. PROD (135.x) is never opened over the network by this script.
  *) fatal "refusing_non_loopback_database_host" ;;
esac

[[ "$db_url_path" == "$EXPECTED_DATABASE" ]] || fatal "refusing_database_name_mismatch (url=$db_url_path expected=$EXPECTED_DATABASE)"

PSQL=(psql)
PG_DUMP=(pg_dump)
if [[ "$VIA_SUDO_POSTGRES" -eq 1 ]]; then
  PSQL=(sudo -n -u postgres psql)
  PG_DUMP=(sudo -n -u postgres pg_dump)
fi

live_database="$("${PSQL[@]}" "$DATABASE_URL_ARG" -X -q -t -A -c 'SELECT current_database()' 2>/dev/null || true)"
[[ -n "$live_database" ]] || fatal "could not read current_database() from the supplied database url"
# The hard identity gate: the running database must equal the operator-supplied name EXACTLY.
[[ "$live_database" == "$EXPECTED_DATABASE" ]] \
  || fatal "refusing_expected_database_mismatch (current_database()=$live_database expected=$EXPECTED_DATABASE)"

# Live-like-name refusal, relaxed ONLY by the explicit flag + a verbatim expected-name match.
if [[ "$live_database" =~ (^|[_-])(prod|production|live)($|[_-]) ]]; then
  if [[ "$ALLOW_AUTHORIZED_PROD_TARGET" -eq 1 ]]; then
    [[ -n "$AUTHORIZED_PROD_DATABASE" ]] || fatal "refusing_authorized_prod_target_without_expected_database"
    [[ "$live_database" == "$AUTHORIZED_PROD_DATABASE" ]] || fatal "refusing_authorized_prod_target_mismatch"
    echo "[r7-archive] owner-gated authorized prod target accepted: $live_database"
  else
    fatal "refusing_live_like_database (pass --allow-authorized-prod-target with a verbatim --authorized-prod-database to unlock)"
  fi
fi

# The archive must live OUTSIDE the repository (runbook §3: "Use a timestamped directory outside the
# repo"). Resolved with `realpath -m` so the containment check happens BEFORE anything is created.
ARCHIVE_BASE="$(realpath -m "$ARCHIVE_BASE")"
case "$ARCHIVE_BASE" in
  "$REPO_ROOT"|"$REPO_ROOT"/*) fatal "refusing_archive_dir_inside_repo ($ARCHIVE_BASE is inside $REPO_ROOT)" ;;
esac
mkdir -p "$ARCHIVE_BASE" || fatal "could not create archive base directory: $ARCHIVE_BASE"

ARCHIVE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_DIR="$ARCHIVE_BASE/rubitime-retirement-$ARCHIVE_STAMP"
[[ ! -e "$ARCHIVE_DIR" ]] || fatal "refusing_existing_archive_dir ($ARCHIVE_DIR already exists)"
mkdir -p "$ARCHIVE_DIR"
chmod 0700 "$ARCHIVE_DIR"

echo "[r7-archive] database        : $live_database"
echo "[r7-archive] archive dir     : $ARCHIVE_DIR"
echo "[r7-archive] targets         : ${ARCHIVE_TARGETS[*]}"
echo "[r7-archive] drop hand-off   : $([[ "$THEN_DROP" -eq 1 ]] && echo "requested (pnpm run migrate)" || echo "not requested")"

# ---------------------------------------------------------------------------------------------
# 2. ARCHIVE (pg_dump --data-only per target; missing tables get to_regclass evidence)
# ---------------------------------------------------------------------------------------------

present_targets=()
missing_targets=()
declare -A live_row_count=()

for target in "${ARCHIVE_TARGETS[@]}"; do
  regclass="$("${PSQL[@]}" "$DATABASE_URL_ARG" -X -q -t -A \
    -c "SELECT COALESCE(to_regclass('$target')::text, '')" 2>/dev/null || true)"
  if [[ -z "$regclass" ]]; then
    missing_targets+=("$target")
    {
      echo "table: $target"
      echo "database: $live_database"
      echo "checked_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "to_regclass: NULL"
      echo "verdict: table not present; nothing to archive (runbook §3 missing-table evidence)"
    } > "$ARCHIVE_DIR/$target.MISSING.txt"
    echo "[r7-archive] MISSING  $target (to_regclass -> NULL; evidence recorded)"
    continue
  fi
  count="$("${PSQL[@]}" "$DATABASE_URL_ARG" -X -q -t -A -c "SELECT count(*) FROM $target" 2>/dev/null || true)"
  [[ "$count" =~ ^[0-9]+$ ]] || fatal "could not read row count for $target"
  live_row_count["$target"]="$count"
  present_targets+=("$target")
  # Write via a shell redirect (not pg_dump --file) so the artifact is always owned by the invoking
  # operator and the archive directory can stay 0700 even when pg_dump runs as the postgres OS user.
  "${PG_DUMP[@]}" "$DATABASE_URL_ARG" --data-only --no-owner --no-privileges \
    --table="$target" > "$ARCHIVE_DIR/$target.sql" \
    || fatal "pg_dump failed for $target"
  echo "[r7-archive] ARCHIVED $target ($count rows) -> $target.sql"
done

if [[ "${#present_targets[@]}" -eq 0 ]]; then
  echo "[r7-archive] no target table is present in $live_database; nothing was archived"
fi

# ---------------------------------------------------------------------------------------------
# 3. SHA256SUMS (over every produced artifact, excluding SHA256SUMS/manifest/marker themselves)
# ---------------------------------------------------------------------------------------------

(
  cd "$ARCHIVE_DIR"
  shopt -s nullglob
  artifacts=(*.sql *.MISSING.txt)
  if [[ "${#artifacts[@]}" -eq 0 ]]; then
    : > SHA256SUMS
  else
    sha256sum "${artifacts[@]}" > SHA256SUMS
  fi
) || fatal "could not write SHA256SUMS"

# ---------------------------------------------------------------------------------------------
# 4. VERIFY — must pass BEFORE anything destructive is reachable
# ---------------------------------------------------------------------------------------------

echo "[r7-archive] verifying archive before any destructive step"

verify_failed=0
( cd "$ARCHIVE_DIR" && sha256sum -c --strict SHA256SUMS ) || verify_failed=1

for target in "${present_targets[@]}"; do
  file="$ARCHIVE_DIR/$target.sql"
  if [[ ! -r "$file" ]]; then
    echo "VERIFY FAILED: archive file is not readable: $file" >&2
    verify_failed=1
    continue
  fi
  if [[ ! -s "$file" ]]; then
    echo "VERIFY FAILED: archive file is empty: $file" >&2
    verify_failed=1
    continue
  fi
  # Count the data rows actually present in the COPY block and compare with the live table.
  archived_rows="$(awk '
    /^COPY /   { in_copy = 1; next }
    in_copy && /^\\\.$/ { in_copy = 0; next }
    in_copy    { rows++ }
    END        { print rows + 0 }
  ' "$file")"
  expected_rows="${live_row_count[$target]}"
  if [[ "$archived_rows" != "$expected_rows" ]]; then
    echo "VERIFY FAILED: $target archived $archived_rows rows but the live table has $expected_rows" >&2
    verify_failed=1
    continue
  fi
  echo "[r7-archive] VERIFIED $target: readable, non-empty, hash-matching, $archived_rows/$expected_rows rows"
done

for target in "${missing_targets[@]}"; do
  file="$ARCHIVE_DIR/$target.MISSING.txt"
  [[ -r "$file" && -s "$file" ]] || { echo "VERIFY FAILED: missing-table evidence unusable: $file" >&2; verify_failed=1; }
done

if [[ "$verify_failed" -ne 0 ]]; then
  fatal "archive verification FAILED; no destructive step is allowed (archive kept at $ARCHIVE_DIR)"
fi

{
  echo "{"
  echo "  \"database\": \"$live_database\","
  echo "  \"archive_dir\": \"$ARCHIVE_DIR\","
  echo "  \"archived_at_utc\": \"$ARCHIVE_STAMP\","
  echo "  \"archive_only\": \"traceability/rollback only; must not resurrect integrator-only rows absent from the fresh Rubitime CSV and must never become an import source\","
  echo "  \"present_tables\": ["
  for i in "${!present_targets[@]}"; do
    sep=","
    [[ "$i" -eq $(( ${#present_targets[@]} - 1 )) ]] && sep=""
    echo "    {\"table\": \"${present_targets[$i]}\", \"rows\": ${live_row_count[${present_targets[$i]}]}}$sep"
  done
  echo "  ],"
  echo "  \"missing_tables\": ["
  for i in "${!missing_targets[@]}"; do
    sep=","
    [[ "$i" -eq $(( ${#missing_targets[@]} - 1 )) ]] && sep=""
    echo "    \"${missing_targets[$i]}\"$sep"
  done
  echo "  ]"
  echo "}"
} > "$ARCHIVE_DIR/ARCHIVE_MANIFEST.json"

echo "verified_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ARCHIVE_DIR/ARCHIVE_VERIFIED"
echo "database=$live_database" >> "$ARCHIVE_DIR/ARCHIVE_VERIFIED"

ls -lh "$ARCHIVE_DIR"
cat "$ARCHIVE_DIR/SHA256SUMS"
echo "[r7-archive] ARCHIVE VERIFIED: $ARCHIVE_DIR"

# ---------------------------------------------------------------------------------------------
# 5. DROP — reachable only now, and only through the normal repo migration chain
# ---------------------------------------------------------------------------------------------

[[ -f "$REPO_ROOT/$DROP_MIGRATION_REL" ]] || fatal "drop migration is missing from the repo: $DROP_MIGRATION_REL"

cat <<EOF
[r7-archive] drop contract:
  migration : $DROP_MIGRATION_REL
  drops     : public.rubitime_records, public.rubitime_events (IF EXISTS ... CASCADE, idempotent)
  NOT dropped: public.appointment_records -- still has live runtime readers/writers
              (RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md:128,
               RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md:126-150). Archived above, drop deferred.
  NOT dropped: any KEEP-list table (${KEEP_LIST[*]}, public.booking_* catalog).
EOF

if [[ "$THEN_DROP" -ne 1 ]]; then
  cat <<EOF
[r7-archive] --then-drop was not passed. Archive is complete and verified; nothing was dropped.
             To run the drop through the normal migration chain:
               cd $REPO_ROOT && DATABASE_URL='<same url>' pnpm run migrate
EOF
  exit 0
fi

echo "[r7-archive] running the normal repo migration chain (pnpm run migrate) to apply the drop"
command -v pnpm >/dev/null 2>&1 || fatal "required command is unavailable: pnpm"
(
  cd "$REPO_ROOT"
  DATABASE_URL="$DATABASE_URL_ARG" pnpm run migrate
) || fatal "repo migration chain failed; the verified archive remains at $ARCHIVE_DIR"

for mirror in public.rubitime_records public.rubitime_events; do
  still="$("${PSQL[@]}" "$DATABASE_URL_ARG" -X -q -t -A \
    -c "SELECT COALESCE(to_regclass('$mirror')::text, '')" 2>/dev/null || true)"
  [[ -z "$still" ]] || fatal "post-drop check failed: $mirror still exists"
  echo "[r7-archive] DROPPED $mirror (to_regclass -> NULL)"
done

echo "[r7-archive] DONE: archive verified at $ARCHIVE_DIR, mirror tables dropped by migration"
