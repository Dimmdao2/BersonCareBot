#!/usr/bin/env bash
# Synthetic test harness for deploy/postgres/postgres-backup.sh.
#
# Runs the canonical script only against a temporary BACKUPS_ROOT and temporary env
# files, with fake pg_dump/age/psql binaries on PATH (never system pg_dump/psql,
# never a real DATABASE_URL). sha256sum is the real system binary — it is a pure
# hashing utility with no DB/network/secret dependency, and using the real one lets
# this harness exercise the actual documented verify command (`sha256sum -c`).
#
# No network, no sleep, no large files, no root.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_UNDER_TEST="${HERE}/postgres-backup.sh"
[ -x "$SCRIPT_UNDER_TEST" ] || { echo "FATAL: ${SCRIPT_UNDER_TEST} is not executable" >&2; exit 1; }

WORKROOT="$(mktemp -d "${TMPDIR:-/tmp}/bcb-postgres-backup-test.XXXXXX")"
cleanup() { rm -rf "$WORKROOT"; }
trap cleanup EXIT

FAILED=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

# Synthetic, never-real credential marker. Must never appear in argv logs, stdout,
# stderr, operator_job_status tick text, or on-disk filenames.
SECRET_MARKER="S3nsitiveMarker_9f3a"
UNIFIED_DB="bcb_synth_unified"
SPLIT_DB_A="bcb_synth_integrator"
SPLIT_DB_B="bcb_synth_webapp"

# --- fake binaries ---------------------------------------------------------

make_fakebin() {
  local dir="$1"
  mkdir -p "$dir"

  cat > "${dir}/pg_dump" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
: "${FAKE_CALL_LOG:?}"
echo "pg_dump $*" >> "$FAKE_CALL_LOG"
if [ "${FAKE_PG_DUMP_FAIL:-0}" = "1" ]; then
  # Realistic libpq-style error text that echoes the conninfo string — this is the
  # This deliberately credential-bearing provider stderr must be suppressed
  # before it reaches logs/DB.
  echo "pg_dump: error: connection to server failed: could not connect to ${PGDATABASE:-}" >&2
  exit 1
fi
[ -n "${PGDATABASE:-}" ] || { echo "pg_dump: PGDATABASE not set" >&2; exit 1; }
printf 'FAKE-PGDUMP-CUSTOM-FORMAT\nsource=%s\n' "$PGDATABASE"
EOS

  cat > "${dir}/age" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
: "${FAKE_CALL_LOG:?}"
echo "age $*" >> "$FAKE_CALL_LOG"
recipients=""
outfile=""
while [ $# -gt 0 ]; do
  case "$1" in
    -R) recipients="$2"; shift 2 ;;
    -o) outfile="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$recipients" ] || { echo "age: missing -R recipients file" >&2; exit 1; }
[ -r "$recipients" ] || { echo "age: recipients file not readable: $recipients" >&2; exit 1; }
[ -s "$recipients" ] || { echo "age: recipients file empty: $recipients" >&2; exit 1; }
[ -n "$outfile" ] || { echo "age: missing -o outfile" >&2; exit 1; }
valid=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [ -n "$line" ] || continue
  case "$line" in '#'*) continue ;; esac
  if [[ "$line" =~ ^age1[ac-hj-np-z02-9]+$ ]] || [[ "$line" =~ ^ssh-(rsa|ed25519|ed25519-sk|rsa-sk)[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
    valid=$((valid + 1))
  else
    echo "age: invalid recipient" >&2
    exit 1
  fi
done < "$recipients"
[ "$valid" -gt 0 ] || { echo "age: no recipients" >&2; exit 1; }
if [ "${FAKE_AGE_FAIL_ON_ENCRYPT:-0}" = "1" ] && [ "$outfile" != /dev/null ]; then
  echo "age: simulated encryption failure" >&2
  exit 1
fi
{ printf 'FAKE-AGE-ENCRYPTED\n'; cat; } > "$outfile"
EOS

  cat > "${dir}/psql" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
: "${FAKE_CALL_LOG:?}"
echo "psql $*" >> "$FAKE_CALL_LOG"
sql=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [ "${args[$i]}" = "-c" ]; then
    sql="${args[$((i + 1))]:-}"
  fi
done
if [ -n "$sql" ] && [ -n "${FAKE_PSQL_TICK_LOG:-}" ]; then
  # Deliberately record only the -c SQL text (what the real script would store in
  # operator_job_status), never PGDATABASE — PGDATABASE legitimately carries the
  # connection string via env by design, so logging it here would be a harness
  # artifact, not evidence of the script leaking a credential.
  printf 'SQL=%s\n' "$sql" >> "$FAKE_PSQL_TICK_LOG"
fi
if [ -n "${FAKE_PSQL_ENV_LOG:-}" ]; then
  printf 'PGDATABASE_set=%s\n' "$([ -n "${PGDATABASE:-}" ] && echo yes || echo no)" >> "$FAKE_PSQL_ENV_LOG"
fi
if [ "${FAKE_PSQL_FAIL:-0}" = "1" ]; then
  echo "psql: simulated failure" >&2
  exit 1
fi
exit 0
EOS

  cat > "${dir}/ln" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${FAKE_LN_STATE:-}" ]; then
  count=0
  [ -f "$FAKE_LN_STATE" ] && count="$(cat "$FAKE_LN_STATE")"
  count=$((count + 1))
  printf '%s\n' "$count" > "$FAKE_LN_STATE"
  if [ "${FAKE_LN_FAIL_ON:-0}" = "$count" ]; then
    echo "ln: simulated publication failure" >&2
    exit 1
  fi
fi
exec /usr/bin/ln "$@"
EOS

  chmod +x "${dir}/pg_dump" "${dir}/age" "${dir}/psql" "${dir}/ln"

  cat > "${dir}/chmod" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
for target in "${@:2}"; do
  if [ "${FAKE_CHMOD_FAIL_MODE_DIR:-0}" = "1" ] && [ "${target##*/}" = manual ]; then
    echo "chmod: simulated mode-directory failure" >&2
    exit 1
  fi
  if [ "${FAKE_CHMOD_FAIL_MANIFEST:-0}" = "1" ] && [[ "$target" == *.sha256.*.partial ]]; then
    echo "chmod: simulated manifest failure" >&2
    exit 1
  fi
done
exec /usr/bin/chmod "$@"
EOS
  chmod +x "${dir}/chmod"
}

make_fake_sha256sum_failing() {
  local dir="$1"
  mkdir -p "$dir"
  cat > "${dir}/sha256sum" <<'EOS'
#!/usr/bin/env bash
echo "sha256sum: simulated checksum failure" >&2
exit 1
EOS
  chmod +x "${dir}/sha256sum"
}

# --- fixtures ----------------------------------------------------------------

write_env_file() {
  local path="$1" db="$2" host="${3:-127.0.0.1}" port="${4:-5999}"
  printf "DATABASE_URL='postgres://bcb_test_user:%s@%s:%s/%s'\n" "$SECRET_MARKER" "$host" "$port" "$db" > "$path"
}

write_recipients_file() {
  local path="$1"
  printf 'age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqk9x8jh\n' > "$path"
}

# Runs postgres-backup.sh with an isolated env, fake binaries first on PATH, and
# captures stdout/stderr/argv-call-log/psql-tick-log into the given case directory.
# Extra positional args after the fixed ones are literal EXTRA=VALUE env assignments
# (e.g. FAKE_PG_DUMP_FAIL=1) applied only to this invocation.
run_backup() {
  local case_dir="$1" mode="$2" backups_root="$3" api_env="$4" webapp_env="$5" fakebin="$6" recipients_file="$7"
  shift 7
  local call_log="${case_dir}/call.log"
  local tick_log="${case_dir}/tick.log"
  : > "$call_log"
  : > "$tick_log"
  set +e
  env -i \
    PATH="${fakebin}:/usr/bin:/bin" \
    BERSONCAREBOT_API_ENV_FILE="$api_env" \
    BERSONCAREBOT_WEBAPP_ENV_FILE="$webapp_env" \
    BERSONCAREBOT_BACKUPS_ROOT="$backups_root" \
    BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE="$recipients_file" \
    FAKE_CALL_LOG="$call_log" \
    FAKE_PSQL_TICK_LOG="$tick_log" \
    "$@" \
    bash "$SCRIPT_UNDER_TEST" "$mode" \
    >"${case_dir}/stdout.log" 2>"${case_dir}/stderr.log"
  RUN_RC=$?
  set -e
}

run_backup_xtrace() {
  local case_dir="$1" mode="$2" backups_root="$3" api_env="$4" webapp_env="$5" fakebin="$6" recipients_file="$7"
  local call_log="${case_dir}/call.log"
  local tick_log="${case_dir}/tick.log"
  : > "$call_log"
  : > "$tick_log"
  set +e
  env -i \
    PATH="${fakebin}:/usr/bin:/bin" \
    BERSONCAREBOT_API_ENV_FILE="$api_env" \
    BERSONCAREBOT_WEBAPP_ENV_FILE="$webapp_env" \
    BERSONCAREBOT_BACKUPS_ROOT="$backups_root" \
    BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE="$recipients_file" \
    FAKE_CALL_LOG="$call_log" \
    FAKE_PSQL_TICK_LOG="$tick_log" \
    bash -x "$SCRIPT_UNDER_TEST" "$mode" \
    >"${case_dir}/stdout.log" 2>"${case_dir}/stderr.log"
  RUN_RC=$?
  set -e
}

assert_no_marker() {
  local label="$1"
  shift
  local f
  for f in "$@"; do
    [ -e "$f" ] || continue
    if grep -qF "$SECRET_MARKER" "$f" 2>/dev/null; then
      fail "${label}: secret marker leaked in $f"
      return
    fi
  done
  pass "${label}: no secret marker leak"
}

assert_no_marker_in_names() {
  local label="$1" dir="$2"
  if find "$dir" -iname "*${SECRET_MARKER}*" 2>/dev/null | grep -q .; then
    fail "${label}: secret marker leaked in a filename under $dir"
  else
    pass "${label}: no secret marker in filenames"
  fi
}

mode() { stat -c '%a' "$1"; }

# --- Scenario 1: unified DATABASE_URL success -------------------------------

case1="${WORKROOT}/case1"; mkdir -p "$case1"
fakebin1="${case1}/fakebin"; make_fakebin "$fakebin1"
root1="${case1}/backups_root"
api1="${case1}/api.env"; webapp1="${case1}/webapp.env"
write_env_file "$api1" "$UNIFIED_DB"
write_env_file "$webapp1" "$UNIFIED_DB"
recipients1="${case1}/age-recipients.txt"; write_recipients_file "$recipients1"

run_backup "$case1" manual "$root1" "$api1" "$webapp1" "$fakebin1" "$recipients1"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario1: unified backup exits 0"; else fail "scenario1: unified backup exited $RUN_RC"; fi

artifact1="$(find "${root1}/manual" -maxdepth 1 -name "unified_${UNIFIED_DB}_*.dump.age" 2>/dev/null | head -1)"
checksum1="${artifact1}.sha256"
if [ -n "$artifact1" ] && [ -f "$artifact1" ]; then pass "scenario1: encrypted artifact exists"; else fail "scenario1: encrypted artifact missing"; fi
if [ -n "$artifact1" ] && [ -f "$checksum1" ]; then pass "scenario1: checksum manifest exists"; else fail "scenario1: checksum manifest missing"; fi

if [ -n "$artifact1" ]; then
  [ "$(mode "$artifact1")" = "600" ] && pass "scenario1: artifact mode 0600" || fail "scenario1: artifact mode $(mode "$artifact1") != 600"
  [ "$(mode "$checksum1")" = "600" ] && pass "scenario1: checksum mode 0600" || fail "scenario1: checksum mode $(mode "$checksum1") != 600"
  [ "$(mode "${root1}/manual")" = "700" ] && pass "scenario1: outdir mode 0700" || fail "scenario1: outdir mode wrong"
  [ "$(mode "$root1")" = "700" ] && pass "scenario1: backups root mode 0700" || fail "scenario1: backups root mode wrong"
fi

if find "$root1" -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario1: leftover .partial file(s)"
else
  pass "scenario1: no leftover .partial files"
fi

if find "$root1" -name '*.dump' 2>/dev/null | grep -q .; then
  fail "scenario1: plaintext .dump file present"
else
  pass "scenario1: no plaintext .dump file"
fi

if [ -n "$artifact1" ] && head -c 20 "$artifact1" | grep -q '^FAKE-AGE-ENCRYPTED'; then
  pass "scenario1: artifact went through the encryption step (not raw pg_dump bytes)"
else
  fail "scenario1: artifact does not look encrypted"
fi

assert_no_marker "scenario1" "$case1/stdout.log" "$case1/stderr.log" "$case1/call.log" "$case1/tick.log"
assert_no_marker_in_names "scenario1" "$root1"

if grep -q "postgres://" "$case1/call.log"; then
  fail "scenario1: a postgres:// URL appeared in fake-binary argv (credential in argv)"
else
  pass "scenario1: no postgres:// URL in fake-binary argv"
fi

if grep -q "backup.manual" "$case1/tick.log" && grep -q "'success'" "$case1/tick.log"; then
  pass "scenario1: operator_job_status success tick recorded"
else
  fail "scenario1: success tick missing/wrong job_key"
fi

# Documented verify command: sha256sum -c must PASS on an untouched artifact...
if [ -n "$artifact1" ] && (cd "$(dirname "$artifact1")" && sha256sum -c "$(basename "$checksum1")" >/dev/null 2>&1); then
  pass "scenario1: sha256sum -c verifies an intact artifact"
else
  fail "scenario1: sha256sum -c failed on an intact artifact"
fi

# ...and FAIL once the artifact is corrupted — proves manifest mismatch is detectable
# by the documented verify command.
if [ -n "$artifact1" ]; then
  printf 'X' >> "$artifact1"
  if (cd "$(dirname "$artifact1")" && sha256sum -c "$(basename "$checksum1")" >/dev/null 2>&1); then
    fail "scenario1: sha256sum -c did not detect corruption"
  else
    pass "scenario1: sha256sum -c detects corruption"
  fi
fi

# --- Scenario 2: split DATABASE_URL success (two generations) --------------

case2="${WORKROOT}/case2"; mkdir -p "$case2"
fakebin2="${case2}/fakebin"; make_fakebin "$fakebin2"
root2="${case2}/backups_root"
api2="${case2}/api.env"; webapp2="${case2}/webapp.env"
write_env_file "$api2" "$SPLIT_DB_A"
write_env_file "$webapp2" "$SPLIT_DB_B"
recipients2="${case2}/age-recipients.txt"; write_recipients_file "$recipients2"

run_backup "$case2" pre-migrations "$root2" "$api2" "$webapp2" "$fakebin2" "$recipients2"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario2: split-URL backup exits 0"; else fail "scenario2: split-URL backup exited $RUN_RC"; fi

integrator_artifact="$(find "${root2}/pre-migrations" -maxdepth 1 -name "integrator_${SPLIT_DB_A}_*.dump.age" 2>/dev/null | head -1)"
webapp_artifact="$(find "${root2}/pre-migrations" -maxdepth 1 -name "webapp_${SPLIT_DB_B}_*.dump.age" 2>/dev/null | head -1)"
if [ -n "$integrator_artifact" ] && [ -n "$webapp_artifact" ]; then
  pass "scenario2: two distinct generations produced"
else
  fail "scenario2: expected two generations (integrator_*, webapp_*)"
fi
if [ -n "$integrator_artifact" ] && [ -f "${integrator_artifact}.sha256" ] && [ -n "$webapp_artifact" ] && [ -f "${webapp_artifact}.sha256" ]; then
  pass "scenario2: both generations have checksum manifests"
else
  fail "scenario2: missing checksum manifest for one of the two generations"
fi
assert_no_marker "scenario2" "$case2/stdout.log" "$case2/stderr.log" "$case2/call.log" "$case2/tick.log"
assert_no_marker_in_names "scenario2" "$root2"

# --- Scenario 3: missing age binary -> fail closed before pg_dump ----------

case3="${WORKROOT}/case3"; mkdir -p "$case3"
fakebin3="${case3}/fakebin"; mkdir -p "$fakebin3"
# Only pg_dump/psql — deliberately no `age` shim.  A private tools-only PATH
# supplies the shell utilities required by the script but cannot fall back to a
# system age binary.
cat > "${fakebin3}/pg_dump" <<'EOS'
#!/usr/bin/env bash
echo "pg_dump $*" >> "${FAKE_CALL_LOG:?}"
EOS
cat > "${fakebin3}/psql" <<'EOS'
#!/usr/bin/env bash
echo "psql $*" >> "${FAKE_CALL_LOG:?}"
exit 0
EOS
chmod +x "${fakebin3}/pg_dump" "${fakebin3}/psql"
for tool3 in bash ln rm mkdir chmod basename sed cut tr date sync find sort sha256sum; do
  ln -s "$(command -v "$tool3")" "${fakebin3}/${tool3}"
done
root3="${case3}/backups_root"
api3="${case3}/api.env"; webapp3="${case3}/webapp.env"
write_env_file "$api3" "$UNIFIED_DB"
write_env_file "$webapp3" "$UNIFIED_DB"
recipients3="${case3}/age-recipients.txt"; write_recipients_file "$recipients3"

if env -i PATH="$fakebin3" bash -c 'command -v age >/dev/null 2>&1'; then
  fail "scenario3: test tools PATH unexpectedly resolves age"
else
  pass "scenario3: isolated tools PATH cannot resolve a real age binary"
fi

run_backup "$case3" manual "$root3" "$api3" "$webapp3" "$fakebin3" "$recipients3" PATH="$fakebin3"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario3: missing age fails closed (nonzero exit)"; else fail "scenario3: missing age did not fail"; fi
if [ ! -d "$root3" ]; then
  pass "scenario3: BACKUPS_ROOT never created (failed before any dump work)"
else
  fail "scenario3: BACKUPS_ROOT was created despite missing age"
fi
if grep -q '^pg_dump ' "$case3/call.log" 2>/dev/null; then
  fail "scenario3: pg_dump was invoked despite missing age (must fail before pg_dump)"
else
  pass "scenario3: pg_dump was never invoked"
fi

# --- Scenario 4: empty age recipients file -> fail closed -------------------

case4="${WORKROOT}/case4"; mkdir -p "$case4"
fakebin4="${case4}/fakebin"; make_fakebin "$fakebin4"
root4="${case4}/backups_root"
api4="${case4}/api.env"; webapp4="${case4}/webapp.env"
write_env_file "$api4" "$UNIFIED_DB"
write_env_file "$webapp4" "$UNIFIED_DB"
recipients4="${case4}/age-recipients-empty.txt"; : > "$recipients4"

run_backup "$case4" manual "$root4" "$api4" "$webapp4" "$fakebin4" "$recipients4"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario4: empty recipients file fails closed"; else fail "scenario4: empty recipients file did not fail"; fi
if grep -q '^pg_dump ' "$case4/call.log" 2>/dev/null; then
  fail "scenario4: pg_dump was invoked despite empty recipients file"
else
  pass "scenario4: pg_dump was never invoked"
fi

# --- Scenario 5: injected pg_dump failure -> clean partials + safe tick ---

case5="${WORKROOT}/case5"; mkdir -p "$case5"
fakebin5="${case5}/fakebin"; make_fakebin "$fakebin5"
root5="${case5}/backups_root"
api5="${case5}/api.env"; webapp5="${case5}/webapp.env"
write_env_file "$api5" "$UNIFIED_DB"
write_env_file "$webapp5" "$UNIFIED_DB"
recipients5="${case5}/age-recipients.txt"; write_recipients_file "$recipients5"

run_backup "$case5" hourly "$root5" "$api5" "$webapp5" "$fakebin5" "$recipients5" FAKE_PG_DUMP_FAIL=1

if [ "$RUN_RC" -ne 0 ]; then pass "scenario5: injected pg_dump failure fails the run"; else fail "scenario5: injected pg_dump failure did not fail the run"; fi
if find "$root5" -name '*.dump.age' -o -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario5: leftover artifact/partial after pg_dump failure"
else
  pass "scenario5: no leftover artifact/partial after pg_dump failure"
fi
if grep -q "backup.hourly" "$case5/tick.log" 2>/dev/null && grep -q "'failure'" "$case5/tick.log" 2>/dev/null; then
  pass "scenario5: operator_job_status failure tick recorded"
else
  fail "scenario5: failure tick missing/wrong job_key"
fi
assert_no_marker "scenario5" "$case5/stdout.log" "$case5/stderr.log" "$case5/tick.log"
if grep -q "backup dump failed" "$case5/tick.log" 2>/dev/null; then
  pass "scenario5: failure tick contains only the safe generic error"
else
  fail "scenario5: safe generic failure text missing from failure tick"
fi

# --- Scenario 6: injected age failure -> clean partials ---------------------

case6="${WORKROOT}/case6"; mkdir -p "$case6"
fakebin6="${case6}/fakebin"; make_fakebin "$fakebin6"
root6="${case6}/backups_root"
api6="${case6}/api.env"; webapp6="${case6}/webapp.env"
write_env_file "$api6" "$UNIFIED_DB"
write_env_file "$webapp6" "$UNIFIED_DB"
recipients6="${case6}/age-recipients.txt"; write_recipients_file "$recipients6"

run_backup "$case6" daily "$root6" "$api6" "$webapp6" "$fakebin6" "$recipients6" FAKE_AGE_FAIL_ON_ENCRYPT=1

if [ "$RUN_RC" -ne 0 ]; then pass "scenario6: injected age failure fails the run"; else fail "scenario6: injected age failure did not fail the run"; fi
if find "$root6" -name '*.dump.age' -o -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario6: leftover artifact/partial after age failure"
else
  pass "scenario6: no leftover artifact/partial after age failure"
fi
assert_no_marker "scenario6" "$case6/stdout.log" "$case6/stderr.log" "$case6/tick.log"

# --- Scenario 7: injected checksum (sha256sum) failure ----------------------

case7="${WORKROOT}/case7"; mkdir -p "$case7"
fakebin7="${case7}/fakebin"; make_fakebin "$fakebin7"
make_fake_sha256sum_failing "$fakebin7"
root7="${case7}/backups_root"
api7="${case7}/api.env"; webapp7="${case7}/webapp.env"
write_env_file "$api7" "$UNIFIED_DB"
write_env_file "$webapp7" "$UNIFIED_DB"
recipients7="${case7}/age-recipients.txt"; write_recipients_file "$recipients7"

run_backup "$case7" weekly "$root7" "$api7" "$webapp7" "$fakebin7" "$recipients7"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario7: injected checksum failure fails the run"; else fail "scenario7: injected checksum failure did not fail the run"; fi
if find "$root7" -name '*.dump.age' 2>/dev/null | grep -q .; then
  fail "scenario7: final artifact present without a valid checksum step (must not happen)"
else
  pass "scenario7: no orphaned artifact after checksum failure"
fi
if find "$root7" -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario7: leftover .partial file after checksum failure"
else
  pass "scenario7: no leftover .partial file after checksum failure"
fi

# --- Scenario 8: retention treats artifact+manifest as one generation ------

case8="${WORKROOT}/case8"; mkdir -p "$case8"
fakebin8="${case8}/fakebin"; make_fakebin "$fakebin8"
root8="${case8}/backups_root"
api8="${case8}/api.env"; webapp8="${case8}/webapp.env"
write_env_file "$api8" "$UNIFIED_DB"
write_env_file "$webapp8" "$UNIFIED_DB"
recipients8="${case8}/age-recipients.txt"; write_recipients_file "$recipients8"

hourly_dir="${root8}/hourly"
mkdir -p "$hourly_dir"
chmod 0700 "$root8" "$hourly_dir"
old_primary="${hourly_dir}/unified_${UNIFIED_DB}_20200101_000000.dump.age"
old_companion="${old_primary}.sha256"
printf 'old-fake-ciphertext\n' > "$old_primary"
printf 'deadbeef  %s\n' "$(basename "$old_primary")" > "$old_companion"
chmod 0600 "$old_primary" "$old_companion"
touch -d '10 days ago' "$old_primary" "$old_companion"

decoy_dir="${WORKROOT}/decoy-outside-root"
mkdir -p "$decoy_dir"
decoy_file="${decoy_dir}/unified_${UNIFIED_DB}_20200101_000000.dump.age"
printf 'decoy\n' > "$decoy_file"
touch -d '10 days ago' "$decoy_file"

run_backup "$case8" prune "$root8" "$api8" "$webapp8" "$fakebin8" "$recipients8"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario8: prune exits 0"; else fail "scenario8: prune exited $RUN_RC"; fi
if [ -e "$old_primary" ] || [ -e "$old_companion" ]; then
  fail "scenario8: hourly generation older than 48h was not pruned (primary+companion)"
else
  pass "scenario8: hourly generation (primary+companion) pruned together as one generation"
fi
if [ -e "$decoy_file" ]; then
  pass "scenario8: prune never touched a file outside BACKUPS_ROOT"
else
  fail "scenario8: a file outside BACKUPS_ROOT was removed by prune"
fi

# --- Scenario 9: pre-migrations keep-newest-20 does not double-count manifests

case9="${WORKROOT}/case9"; mkdir -p "$case9"
fakebin9="${case9}/fakebin"; make_fakebin "$fakebin9"
root9="${case9}/backups_root"
api9="${case9}/api.env"; webapp9="${case9}/webapp.env"
write_env_file "$api9" "$UNIFIED_DB"
write_env_file "$webapp9" "$UNIFIED_DB"
recipients9="${case9}/age-recipients.txt"; write_recipients_file "$recipients9"

premig_dir="${root9}/pre-migrations"
mkdir -p "$premig_dir"
chmod 0700 "$root9" "$premig_dir"
# 21 generations, all older than 30 days, oldest first. Keep-newest-20 must delete
# exactly the single oldest GENERATION (primary+companion), not 21/42 individual files.
for i in $(seq -w 1 21); do
  ts="202001${i}_000000"
  primary="${premig_dir}/unified_${UNIFIED_DB}_${ts}.dump.age"
  printf 'gen-%s\n' "$i" > "$primary"
  printf 'deadbeef  %s\n' "$(basename "$primary")" > "${primary}.sha256"
  chmod 0600 "$primary" "${primary}.sha256"
  touch -d "$((40 - 10#$i)) days ago" "$primary" "${primary}.sha256"
done

run_backup "$case9" prune "$root9" "$api9" "$webapp9" "$fakebin9" "$recipients9"

remaining_primaries="$(find "$premig_dir" -maxdepth 1 -name '*.dump.age' | wc -l)"
remaining_companions="$(find "$premig_dir" -maxdepth 1 -name '*.sha256' | wc -l)"
if [ "$remaining_primaries" -eq 20 ] && [ "$remaining_companions" -eq 20 ]; then
  pass "scenario9: keep-newest-20 kept exactly 20 generations (primary+companion paired, not double-counted)"
else
  fail "scenario9: expected 20 primaries + 20 companions, got ${remaining_primaries} primaries / ${remaining_companions} companions"
fi
oldest_primary="${premig_dir}/unified_${UNIFIED_DB}_20200101_000000.dump.age"
if [ ! -e "$oldest_primary" ] && [ ! -e "${oldest_primary}.sha256" ]; then
  pass "scenario9: the single oldest generation (both files) was removed"
else
  fail "scenario9: oldest generation was not fully removed"
fi

# --- Scenario 10: hostile env (command substitution) never executes --------

case10="${WORKROOT}/case10"; mkdir -p "$case10"
fakebin10="${case10}/fakebin"; make_fakebin "$fakebin10"
root10="${case10}/backups_root"
api10="${case10}/api.env"; webapp10="${case10}/webapp.env"
marker10="${case10}/PWNED"
printf 'DATABASE_URL=$(touch %s)\n' "$marker10" > "$api10"
write_env_file "$webapp10" "$UNIFIED_DB"
recipients10="${case10}/age-recipients.txt"; write_recipients_file "$recipients10"

run_backup "$case10" manual "$root10" "$api10" "$webapp10" "$fakebin10" "$recipients10"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario10: hostile env assignment fails the run"; else fail "scenario10: hostile env assignment did not fail"; fi
if [ -e "$marker10" ]; then
  fail "scenario10: env file content was executed (command substitution ran)"
else
  pass "scenario10: env file content was never executed"
fi
if grep -q '^pg_dump ' "$case10/call.log" 2>/dev/null; then
  fail "scenario10: pg_dump was invoked despite hostile/unparseable env file"
else
  pass "scenario10: pg_dump was never invoked"
fi

# --- Scenario 11: duplicate DATABASE_URL assignment is rejected ------------

case11="${WORKROOT}/case11"; mkdir -p "$case11"
fakebin11="${case11}/fakebin"; make_fakebin "$fakebin11"
root11="${case11}/backups_root"
api11="${case11}/api.env"; webapp11="${case11}/webapp.env"
printf "DATABASE_URL='postgres://u:%s@127.0.0.1:5999/dba'\nDATABASE_URL='postgres://u:%s@127.0.0.1:5999/dbb'\n" "$SECRET_MARKER" "$SECRET_MARKER" > "$api11"
write_env_file "$webapp11" "$UNIFIED_DB"
recipients11="${case11}/age-recipients.txt"; write_recipients_file "$recipients11"

run_backup "$case11" manual "$root11" "$api11" "$webapp11" "$fakebin11" "$recipients11"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario11: duplicate DATABASE_URL assignment fails the run"; else fail "scenario11: duplicate DATABASE_URL assignment did not fail"; fi
if grep -q '^pg_dump ' "$case11/call.log" 2>/dev/null; then
  fail "scenario11: pg_dump was invoked despite duplicate DATABASE_URL"
else
  pass "scenario11: pg_dump was never invoked"
fi

# --- Scenario 12: pathless URI never leaks credentials into a filename -----

case12="${WORKROOT}/case12"; mkdir -p "$case12"
fakebin12="${case12}/fakebin"; make_fakebin "$fakebin12"
root12="${case12}/backups_root"
api12="${case12}/api.env"; webapp12="${case12}/webapp.env"
printf "DATABASE_URL='postgres://bcb_test_user:%s@127.0.0.1:5999'\n" "$SECRET_MARKER" > "$api12"
printf "DATABASE_URL='postgres://bcb_test_user:%s@127.0.0.1:5999'\n" "$SECRET_MARKER" > "$webapp12"
recipients12="${case12}/age-recipients.txt"; write_recipients_file "$recipients12"

run_backup "$case12" manual "$root12" "$api12" "$webapp12" "$fakebin12" "$recipients12"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario12: pathless URI backup still succeeds"; else fail "scenario12: pathless URI backup exited $RUN_RC"; fi
artifact12="$(find "${root12}/manual" -maxdepth 1 -name "unified_unknown_*.dump.age" 2>/dev/null | head -1)"
if [ -n "$artifact12" ] && [ -f "$artifact12" ]; then
  pass "scenario12: pathless URI falls back to the fixed 'unknown' label"
else
  fail "scenario12: expected an artifact named unified_unknown_*.dump.age"
fi
assert_no_marker "scenario12" "$case12/stdout.log" "$case12/stderr.log" "$case12/call.log" "$case12/tick.log"
assert_no_marker_in_names "scenario12" "$root12"

# --- Scenario 13: an inherited DATABASE_URL is never used ------------------

case13="${WORKROOT}/case13"; mkdir -p "$case13"
fakebin13="${case13}/fakebin"; make_fakebin "$fakebin13"
root13="${case13}/backups_root"
api13="${case13}/api.env"; webapp13="${case13}/webapp.env"
printf 'NODE_ENV=production\n' > "$api13"
write_env_file "$webapp13" "$UNIFIED_DB"
recipients13="${case13}/age-recipients.txt"; write_recipients_file "$recipients13"

call_log13="${case13}/call.log"; : > "$call_log13"
set +e
DATABASE_URL="postgres://inherited_should_not_leak@127.0.0.1/inherited_db" \
  PATH="${fakebin13}:/usr/bin:/bin" \
  BERSONCAREBOT_API_ENV_FILE="$api13" \
  BERSONCAREBOT_WEBAPP_ENV_FILE="$webapp13" \
  BERSONCAREBOT_BACKUPS_ROOT="$root13" \
  BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE="$recipients13" \
  FAKE_CALL_LOG="$call_log13" \
  bash "$SCRIPT_UNDER_TEST" manual >"${case13}/stdout.log" 2>"${case13}/stderr.log"
RUN_RC=$?
set -e

if [ "$RUN_RC" -ne 0 ]; then pass "scenario13: env file missing DATABASE_URL fails even with one inherited in the shell"; else fail "scenario13: inherited DATABASE_URL was used instead of failing"; fi
if grep -qF "inherited_db" "$case13/call.log" "$case13/stdout.log" "$case13/stderr.log" 2>/dev/null; then
  fail "scenario13: inherited DATABASE_URL value leaked into script behavior"
else
  pass "scenario13: inherited DATABASE_URL value never appears anywhere"
fi

# --- Scenario 14: split mode, FIRST dump alone fails -> no dangling pair ---

case14="${WORKROOT}/case14"; mkdir -p "$case14"
fakebin14="${case14}/fakebin"; make_fakebin "$fakebin14"
cat > "${fakebin14}/pg_dump" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
: "${FAKE_CALL_LOG:?}"
echo "pg_dump $*" >> "$FAKE_CALL_LOG"
case "${PGDATABASE:-}" in
  *bcb_synth_integrator*)
    : "${FAKE_FIRST_SPLIT_DUMP_FAIL_MARKER:?}"
    : > "$FAKE_FIRST_SPLIT_DUMP_FAIL_MARKER"
    echo "pg_dump: simulated first split dump failure" >&2
    exit 1
    ;;
esac
printf 'FAKE-PGDUMP-CUSTOM-FORMAT\n'
EOS
chmod +x "${fakebin14}/pg_dump"
root14="${case14}/backups_root"
api14="${case14}/api.env"; webapp14="${case14}/webapp.env"
write_env_file "$api14" "$SPLIT_DB_A"
write_env_file "$webapp14" "$SPLIT_DB_B"
recipients14="${case14}/age-recipients.txt"; write_recipients_file "$recipients14"

first_fail_marker14="${case14}/first-split-dump-failure-reached"
run_backup "$case14" pre-migrations "$root14" "$api14" "$webapp14" "$fakebin14" "$recipients14" FAKE_FIRST_SPLIT_DUMP_FAIL_MARKER="$first_fail_marker14"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario14: split-URL first-dump failure fails the run"; else fail "scenario14: split-URL first-dump failure did not fail the run"; fi
if [ -e "$first_fail_marker14" ]; then pass "scenario14: first-split failure injection was reached"; else fail "scenario14: first-split failure injection was not reached"; fi
if [ "$(grep -c '^pg_dump ' "$case14/call.log" 2>/dev/null || true)" -eq 2 ]; then pass "scenario14: second split dump was attempted without being injected to fail"; else fail "scenario14: expected both split dump attempts"; fi
if find "${root14}/pre-migrations" -name '*.dump.age' -o -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario14: a generation/partial survived a first-dump failure in split mode"
else
  pass "scenario14: no generation left behind after first-dump failure in split mode"
fi

# --- Scenario 15: split mode, SECOND dump fails -> first pair rolled back --

case15="${WORKROOT}/case15"; mkdir -p "$case15"
fakebin15="${case15}/fakebin"; mkdir -p "$fakebin15"
# pg_dump fails only for the SECOND (webapp) database, so the first
# (integrator) dump publishes successfully before the run fails overall.
cat > "${fakebin15}/pg_dump" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
: "${FAKE_CALL_LOG:?}"
echo "pg_dump $*" >> "$FAKE_CALL_LOG"
case "${PGDATABASE:-}" in
  *bcb_synth_webapp*)
    echo "pg_dump: error: connection to server failed" >&2
    exit 1
    ;;
esac
printf 'FAKE-PGDUMP-CUSTOM-FORMAT\nsource=%s\n' "$PGDATABASE"
EOS
chmod +x "${fakebin15}/pg_dump"
# Reuse the standard fake age/psql from make_fakebin, only override pg_dump above.
make_fakebin "${fakebin15}/std"
cp "${fakebin15}/std/age" "${fakebin15}/age"
cp "${fakebin15}/std/psql" "${fakebin15}/psql"
rm -rf "${fakebin15}/std"
root15="${case15}/backups_root"
api15="${case15}/api.env"; webapp15="${case15}/webapp.env"
write_env_file "$api15" "$SPLIT_DB_A"
write_env_file "$webapp15" "$SPLIT_DB_B"
recipients15="${case15}/age-recipients.txt"; write_recipients_file "$recipients15"

run_backup "$case15" pre-migrations "$root15" "$api15" "$webapp15" "$fakebin15" "$recipients15"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario15: split-URL second-dump failure fails the run"; else fail "scenario15: split-URL second-dump failure did not fail the run"; fi
if find "${root15}/pre-migrations" -name '*.dump.age' -o -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario15: the first (successful) DB pair was not rolled back after the second DB failed"
else
  pass "scenario15: first DB's generation was rolled back after the second DB failed (no lone current-run pair)"
fi

# --- Scenario 16: artifact publication fails after manifest is published ---

case16="${WORKROOT}/case16"; mkdir -p "$case16"
fakebin16="${case16}/fakebin"; make_fakebin "$fakebin16"
root16="${case16}/backups_root"
api16="${case16}/api.env"; webapp16="${case16}/webapp.env"
write_env_file "$api16" "$UNIFIED_DB"
write_env_file "$webapp16" "$UNIFIED_DB"
recipients16="${case16}/age-recipients.txt"; write_recipients_file "$recipients16"

ln_state16="${case16}/ln-count"
run_backup "$case16" manual "$root16" "$api16" "$webapp16" "$fakebin16" "$recipients16" \
  FAKE_LN_STATE="$ln_state16" FAKE_LN_FAIL_ON=2

if [ "$RUN_RC" -ne 0 ]; then pass "scenario16: injected second atomic publication (artifact) failure is reported"; else fail "scenario16: injected second publication failure was not reported"; fi
if find "$root16" -type f \( -name '*.sha256' -o -name '*.dump.age' \) 2>/dev/null | grep -q .; then
  fail "scenario16: a dangling manifest or artifact survived a failed second publication"
else
  pass "scenario16: manifest was rolled back, no dangling manifest/artifact after failed artifact publication"
fi
if find "$root16" -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario16: leftover .partial file after failed second publication"
else
  pass "scenario16: no leftover .partial file after failed second publication"
fi

# --- Scenario 17: TERM mid-dump leaves no secret-bearing temp residue ------

case17="${WORKROOT}/case17"; mkdir -p "$case17"
fakebin17="${case17}/fakebin"; mkdir -p "$fakebin17"
sync_file17="${case17}/pgdump-started"
cat > "${fakebin17}/pg_dump" <<EOS
#!/usr/bin/env bash
touch "${sync_file17}"
# Block until the parent sends TERM; the script's own trap must clean up.
while true; do sleep 0.05; done
EOS
cat > "${fakebin17}/age" <<'EOS'
#!/usr/bin/env bash
cat >/dev/null
exit 0
EOS
cat > "${fakebin17}/psql" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS
chmod +x "${fakebin17}/pg_dump" "${fakebin17}/age" "${fakebin17}/psql"
root17="${case17}/backups_root"
api17="${case17}/api.env"; webapp17="${case17}/webapp.env"
write_env_file "$api17" "$UNIFIED_DB"
write_env_file "$webapp17" "$UNIFIED_DB"
recipients17="${case17}/age-recipients.txt"; write_recipients_file "$recipients17"

# A separate process group makes TERM reach only the synthetic script and its
# fake pipeline, never this harness or unrelated processes.
setsid env -i \
  PATH="${fakebin17}:/usr/bin:/bin" \
  BERSONCAREBOT_API_ENV_FILE="$api17" \
  BERSONCAREBOT_WEBAPP_ENV_FILE="$webapp17" \
  BERSONCAREBOT_BACKUPS_ROOT="$root17" \
  BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE="$recipients17" \
  bash "$SCRIPT_UNDER_TEST" manual >"${case17}/stdout.log" 2>"${case17}/stderr.log" &
bg_pid17=$!

waited17=0
while [ ! -e "$sync_file17" ] && [ "$waited17" -lt 100 ]; do
  sleep 0.05
  waited17=$((waited17 + 1))
done
if [ -e "$sync_file17" ]; then
  kill -TERM -- "-${bg_pid17}" 2>/dev/null || true
else
  fail "scenario17: fake pg_dump never started (test harness timing issue)"
fi
set +e
wait "$bg_pid17" 2>/dev/null
signal_rc17=$?
set -e

if [ "$signal_rc17" -ne 0 ]; then pass "scenario17: TERM during dump exits non-zero"; else fail "scenario17: TERM during dump exited 0"; fi
if find "$root17" -type f 2>/dev/null | grep -q .; then
  fail "scenario17: leftover file(s) under BACKUPS_ROOT after TERM: $(find "$root17" -type f 2>/dev/null | tr '\n' ' ')"
else
  pass "scenario17: no leftover files under BACKUPS_ROOT after TERM"
fi
if find "${WORKROOT}" -maxdepth 1 -iname '*postgres-backup*' -newer "$sync_file17" 2>/dev/null | grep -v "^${case17}\$" | grep -q .; then
  fail "scenario17: an untracked temp file/dir appeared outside the case directory"
else
  pass "scenario17: no untracked temp file/dir appeared outside BACKUPS_ROOT"
fi
assert_no_marker "scenario17" "$case17/stdout.log" "$case17/stderr.log"

# --- Scenario 18: TERM after first split pair rolls back current-run finals -

case18="${WORKROOT}/case18"; mkdir -p "$case18"
fakebin18="${case18}/fakebin"; make_fakebin "$fakebin18"
sync_file18="${case18}/webapp-dump-started"
cat > "${fakebin18}/pg_dump" <<EOS
#!/usr/bin/env bash
set -euo pipefail
case "\${PGDATABASE:-}" in
  *${SPLIT_DB_B}*)
    touch "${sync_file18}"
    while true; do sleep 0.05; done
    ;;
esac
printf 'FAKE-PGDUMP-CUSTOM-FORMAT\\n'
EOS
chmod +x "${fakebin18}/pg_dump"
root18="${case18}/backups_root"
api18="${case18}/api.env"; webapp18="${case18}/webapp.env"
write_env_file "$api18" "$SPLIT_DB_A"
write_env_file "$webapp18" "$SPLIT_DB_B"
recipients18="${case18}/age-recipients.txt"; write_recipients_file "$recipients18"
: > "${case18}/call.log"

setsid env -i \
  PATH="${fakebin18}:/usr/bin:/bin" \
  BERSONCAREBOT_API_ENV_FILE="$api18" \
  BERSONCAREBOT_WEBAPP_ENV_FILE="$webapp18" \
  BERSONCAREBOT_BACKUPS_ROOT="$root18" \
  BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE="$recipients18" \
  FAKE_CALL_LOG="${case18}/call.log" \
  bash "$SCRIPT_UNDER_TEST" pre-migrations >"${case18}/stdout.log" 2>"${case18}/stderr.log" &
bg_pid18=$!

waited18=0
while [ ! -e "$sync_file18" ] && [ "$waited18" -lt 100 ]; do
  sleep 0.05
  waited18=$((waited18 + 1))
done
if [ -e "$sync_file18" ]; then
  kill -TERM -- "-${bg_pid18}" 2>/dev/null || true
else
  fail "scenario18: second split dump never started (test harness timing issue)"
fi
set +e
wait "$bg_pid18" 2>/dev/null
signal_rc18=$?
set -e

if [ "$signal_rc18" -ne 0 ]; then pass "scenario18: TERM during second split dump exits non-zero"; else fail "scenario18: TERM during second split dump exited 0"; fi
if find "$root18" -type f \( -name '*.dump.age' -o -name '*.sha256' -o -name '*.partial' \) 2>/dev/null | grep -q .; then
  fail "scenario18: first split pair or partial survived TERM during the active logical set"
else
  pass "scenario18: TERM rolled back the already-published first split pair and partials"
fi

# --- Scenario 19: no-clobber on same-second/pre-existing final name --------

case19="${WORKROOT}/case19"; mkdir -p "$case19"
fakebin19="${case19}/fakebin"; make_fakebin "$fakebin19"
root19="${case19}/backups_root"
api19="${case19}/api.env"; webapp19="${case19}/webapp.env"
write_env_file "$api19" "$UNIFIED_DB"
write_env_file "$webapp19" "$UNIFIED_DB"
recipients19="${case19}/age-recipients.txt"; write_recipients_file "$recipients19"

manual_dir19="${root19}/manual"
mkdir -p "$manual_dir19"
chmod 0700 "$root19" "$manual_dir19"
fixed_ts19="20260719_020202"
existing_artifact19="${manual_dir19}/unified_${UNIFIED_DB}_${fixed_ts19}.dump.age"
existing_checksum19="${existing_artifact19}.sha256"
printf 'PRE-EXISTING-VALID-GENERATION\n' > "$existing_artifact19"
(cd "$manual_dir19" && sha256sum "$(basename "$existing_artifact19")" > "$(basename "$existing_checksum19")")
chmod 0600 "$existing_artifact19" "$existing_checksum19"
before_hash19="$(sha256sum "$existing_artifact19" | cut -d' ' -f1)"

cat > "${fakebin19}/date" <<EOS
#!/usr/bin/env bash
case "\$*" in
  *'+%Y%m%d_%H%M%S'*) printf '%s\\n' '${fixed_ts19}' ;;
  *) exec /usr/bin/date "\$@" ;;
esac
EOS
chmod +x "${fakebin19}/date"

run_backup "$case19" manual "$root19" "$api19" "$webapp19" "$fakebin19" "$recipients19"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario19: colliding final name refuses to clobber"; else fail "scenario19: colliding final name did not fail"; fi
after_hash19="$(sha256sum "$existing_artifact19" | cut -d' ' -f1)"
if [ "$before_hash19" = "$after_hash19" ]; then
  pass "scenario19: pre-existing generation content is unchanged"
else
  fail "scenario19: pre-existing generation content was overwritten"
fi
if find "$manual_dir19" -name '*.partial' 2>/dev/null | grep -q .; then
  fail "scenario19: leftover .partial file after refused collision"
else
  pass "scenario19: no leftover .partial file after refused collision"
fi

# --- Scenario 20: symlinked mode directory is refused (dump path) ----------

case20="${WORKROOT}/case20"; mkdir -p "$case20"
fakebin20="${case20}/fakebin"; make_fakebin "$fakebin20"
root20="${case20}/backups_root"
outside20="${case20}/outside-target"
mkdir -p "$root20" "$outside20"
chmod 0700 "$root20"
ln -s "$outside20" "${root20}/manual"
api20="${case20}/api.env"; webapp20="${case20}/webapp.env"
write_env_file "$api20" "$UNIFIED_DB"
write_env_file "$webapp20" "$UNIFIED_DB"
recipients20="${case20}/age-recipients.txt"; write_recipients_file "$recipients20"

if [ -L "${root20}/manual" ] && [ "$(readlink "${root20}/manual")" = "$outside20" ]; then pass "scenario20: real symlinked mode directory fixture was created"; else fail "scenario20: symlinked mode directory fixture was not created"; fi
run_backup "$case20" manual "$root20" "$api20" "$webapp20" "$fakebin20" "$recipients20"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario20: symlinked mode directory is refused"; else fail "scenario20: symlinked mode directory was not refused"; fi
if find "$outside20" -mindepth 1 2>/dev/null | grep -q .; then
  fail "scenario20: a file was written outside BACKUPS_ROOT through the symlinked mode dir"
else
  pass "scenario20: nothing was written outside BACKUPS_ROOT through the symlinked mode dir"
fi

# --- Scenario 21: symlinked BACKUPS_ROOT itself is refused ------------------

case21s="${WORKROOT}/case21-symlink-root"; mkdir -p "$case21s"
fakebin21s="${case21s}/fakebin"; make_fakebin "$fakebin21s"
outside21s="${case21s}/outside-root-target"
mkdir -p "$outside21s"
root21s="${case21s}/backups_root_symlink"
ln -s "$outside21s" "$root21s"
api21s="${case21s}/api.env"; webapp21s="${case21s}/webapp.env"
write_env_file "$api21s" "$UNIFIED_DB"
write_env_file "$webapp21s" "$UNIFIED_DB"
recipients21s="${case21s}/age-recipients.txt"; write_recipients_file "$recipients21s"

run_backup "$case21s" manual "$root21s" "$api21s" "$webapp21s" "$fakebin21s" "$recipients21s"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario21: symlinked BACKUPS_ROOT is refused"; else fail "scenario21: symlinked BACKUPS_ROOT was not refused"; fi
if find "$outside21s" -mindepth 1 2>/dev/null | grep -q .; then
  fail "scenario21: a file was written outside the physical root through a symlinked BACKUPS_ROOT"
else
  pass "scenario21: nothing was written outside the physical root through a symlinked BACKUPS_ROOT"
fi

# --- Scenario 28: mode-directory chmod failure is fail-closed ---------------

case28="${WORKROOT}/case28"; mkdir -p "$case28"
fakebin28="${case28}/fakebin"; make_fakebin "$fakebin28"
root28="${case28}/backups_root"
api28="${case28}/api.env"; webapp28="${case28}/webapp.env"
write_env_file "$api28" "$UNIFIED_DB"; write_env_file "$webapp28" "$UNIFIED_DB"
recipients28="${case28}/age-recipients.txt"; write_recipients_file "$recipients28"
run_backup "$case28" manual "$root28" "$api28" "$webapp28" "$fakebin28" "$recipients28" FAKE_CHMOD_FAIL_MODE_DIR=1
if [ "$RUN_RC" -ne 0 ]; then pass "scenario28: mode-directory chmod failure returns non-zero"; else fail "scenario28: mode-directory chmod failure was masked"; fi
if ! find "$root28" -type f \( -name '*.dump.age' -o -name '*.sha256' -o -name '*.partial' \) 2>/dev/null | grep -q . && ! grep -q "'success'" "$case28/tick.log" 2>/dev/null; then pass "scenario28: no finals/partials/success tick after mode chmod failure"; else fail "scenario28: residue or success tick after mode chmod failure"; fi

# --- Scenario 29: manifest write/chmod failures are fail-closed --------------

case29="${WORKROOT}/case29"; mkdir -p "$case29"
fakebin29="${case29}/fakebin"; make_fakebin "$fakebin29"
root29="${case29}/backups_root"
api29="${case29}/api.env"; webapp29="${case29}/webapp.env"
write_env_file "$api29" "$UNIFIED_DB"; write_env_file "$webapp29" "$UNIFIED_DB"
recipients29="${case29}/age-recipients.txt"; write_recipients_file "$recipients29"
run_backup "$case29" manual "$root29" "$api29" "$webapp29" "$fakebin29" "$recipients29" BERSONCAREBOT_TEST_FAIL_MANIFEST_WRITE=1
if [ "$RUN_RC" -ne 0 ]; then pass "scenario29: manifest write failure returns non-zero"; else fail "scenario29: manifest write failure was masked"; fi
if ! find "$root29" -type f \( -name '*.dump.age' -o -name '*.sha256' -o -name '*.partial' \) 2>/dev/null | grep -q . && ! grep -q "'success'" "$case29/tick.log" 2>/dev/null; then pass "scenario29: no finals/partials/success tick after manifest write failure"; else fail "scenario29: residue or success tick after manifest write failure"; fi
run_backup "$case29" manual "$root29" "$api29" "$webapp29" "$fakebin29" "$recipients29" FAKE_CHMOD_FAIL_MANIFEST=1
if [ "$RUN_RC" -ne 0 ]; then pass "scenario29: manifest chmod failure returns non-zero"; else fail "scenario29: manifest chmod failure was masked"; fi
if ! find "$root29" -type f \( -name '*.dump.age' -o -name '*.sha256' -o -name '*.partial' \) 2>/dev/null | grep -q . && ! grep -q "'success'" "$case29/tick.log" 2>/dev/null; then pass "scenario29: no finals/partials/success tick after manifest chmod failure"; else fail "scenario29: residue or success tick after manifest chmod failure"; fi

# --- Scenario 22: orphan artifact/manifest retention -----------------------

case21="${WORKROOT}/case21"; mkdir -p "$case21"
fakebin21="${case21}/fakebin"; make_fakebin "$fakebin21"
root21="${case21}/backups_root"
api21="${case21}/api.env"; webapp21="${case21}/webapp.env"
write_env_file "$api21" "$UNIFIED_DB"
write_env_file "$webapp21" "$UNIFIED_DB"
recipients21="${case21}/age-recipients.txt"; write_recipients_file "$recipients21"

hourly_dir21="${root21}/hourly"
mkdir -p "$hourly_dir21"
chmod 0700 "$root21" "$hourly_dir21"

orphan_artifact21="${hourly_dir21}/unified_${UNIFIED_DB}_20260101_000000.dump.age"
printf 'orphan-artifact-no-manifest\n' > "$orphan_artifact21"
chmod 0600 "$orphan_artifact21"
touch -d '10 minutes ago' "$orphan_artifact21"

orphan_manifest21="${hourly_dir21}/unified_${UNIFIED_DB}_20260101_010101.dump.age.sha256"
printf 'deadbeef  unified_%s_20260101_010101.dump.age\n' "$UNIFIED_DB" > "$orphan_manifest21"
chmod 0600 "$orphan_manifest21"
touch -d '10 minutes ago' "$orphan_manifest21"

# A complete, recent pair must never be touched by orphan pruning.
good_artifact21="${hourly_dir21}/unified_${UNIFIED_DB}_20260101_020202.dump.age"
good_manifest21="${good_artifact21}.sha256"
printf 'good-pair\n' > "$good_artifact21"
printf 'deadbeef  %s\n' "$(basename "$good_artifact21")" > "$good_manifest21"
chmod 0600 "$good_artifact21" "$good_manifest21"

run_backup "$case21" prune "$root21" "$api21" "$webapp21" "$fakebin21" "$recipients21"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario22: prune with orphans exits 0"; else fail "scenario22: prune with orphans exited $RUN_RC"; fi
if [ -e "$orphan_artifact21" ]; then
  fail "scenario22: orphan artifact (no manifest) survived prune"
else
  pass "scenario22: orphan artifact (no manifest) was pruned"
fi
if [ -e "$orphan_manifest21" ]; then
  fail "scenario22: orphan manifest (no artifact) survived prune"
else
  pass "scenario22: orphan manifest (no artifact) was pruned"
fi
if [ -e "$good_artifact21" ] && [ -e "$good_manifest21" ]; then
  pass "scenario22: complete pair was never touched by orphan pruning"
else
  fail "scenario22: complete pair was incorrectly removed by orphan pruning"
fi

# A very fresh orphan manifest (inside the 1-minute grace window) must
# survive a prune run untouched, to avoid racing a healthy in-flight publish.
case21b="${WORKROOT}/case21b"; mkdir -p "$case21b"
fakebin21b="${case21b}/fakebin"; make_fakebin "$fakebin21b"
root21b="${case21b}/backups_root"
api21b="${case21b}/api.env"; webapp21b="${case21b}/webapp.env"
write_env_file "$api21b" "$UNIFIED_DB"
write_env_file "$webapp21b" "$UNIFIED_DB"
recipients21b="${case21b}/age-recipients.txt"; write_recipients_file "$recipients21b"
hourly_dir21b="${root21b}/hourly"
mkdir -p "$hourly_dir21b"
chmod 0700 "$root21b" "$hourly_dir21b"
fresh_manifest21b="${hourly_dir21b}/unified_${UNIFIED_DB}_20260719_090909.dump.age.sha256"
printf 'deadbeef  fresh\n' > "$fresh_manifest21b"
chmod 0600 "$fresh_manifest21b"

run_backup "$case21b" prune "$root21b" "$api21b" "$webapp21b" "$fakebin21b" "$recipients21b"

if [ -e "$fresh_manifest21b" ]; then
  pass "scenario22b: a manifest inside the grace window is not pruned as an orphan"
else
  fail "scenario22b: a fresh (in-flight-lookalike) manifest was pruned too early"
fi

# A fresh incomplete encrypted artifact must retain the manifest-first grace,
# but must not count as one of pre-migrations' 20 complete retained pairs.
case21c="${WORKROOT}/case21c"; mkdir -p "$case21c"
fakebin21c="${case21c}/fakebin"; make_fakebin "$fakebin21c"
root21c="${case21c}/backups_root"
api21c="${case21c}/api.env"; webapp21c="${case21c}/webapp.env"
write_env_file "$api21c" "$UNIFIED_DB"
write_env_file "$webapp21c" "$UNIFIED_DB"
recipients21c="${case21c}/age-recipients.txt"; write_recipients_file "$recipients21c"
premig_dir21c="${root21c}/pre-migrations"
mkdir -p "$premig_dir21c"
chmod 0700 "$root21c" "$premig_dir21c"
for i in $(seq -w 1 21); do
  primary="${premig_dir21c}/unified_${UNIFIED_DB}_202001${i}_000000.dump.age"
  printf 'complete-%s\n' "$i" > "$primary"
  printf 'deadbeef  %s\n' "$(basename "$primary")" > "${primary}.sha256"
  chmod 0600 "$primary" "${primary}.sha256"
  touch -d "$((45 - 10#$i)) days ago" "$primary" "${primary}.sha256"
done
oldest_complete21c="${premig_dir21c}/unified_${UNIFIED_DB}_20200101_000000.dump.age"
fresh_incomplete21c="${premig_dir21c}/unified_${UNIFIED_DB}_fresh-incomplete.dump.age"
printf 'fresh-incomplete\n' > "$fresh_incomplete21c"
chmod 0600 "$fresh_incomplete21c"
run_backup "$case21c" prune "$root21c" "$api21c" "$webapp21c" "$fakebin21c" "$recipients21c"
if [ -e "$fresh_incomplete21c" ]; then pass "scenario22c: fresh incomplete artifact keeps manifest-first grace"; else fail "scenario22c: fresh incomplete artifact was pruned inside grace"; fi
if [ ! -e "$oldest_complete21c" ] && [ ! -e "${oldest_complete21c}.sha256" ]; then pass "scenario22c: fresh incomplete artifact did not consume a keep-20 slot"; else fail "scenario22c: an old complete pair incorrectly retained because fresh incomplete artifact ranked"; fi

# --- Scenario 23: unusual filenames (space/tab) are handled NUL-safely -----

case22="${WORKROOT}/case22"; mkdir -p "$case22"
fakebin22="${case22}/fakebin"; make_fakebin "$fakebin22"
root22="${case22}/backups_root"
api22="${case22}/api.env"; webapp22="${case22}/webapp.env"
write_env_file "$api22" "$UNIFIED_DB"
write_env_file "$webapp22" "$UNIFIED_DB"
recipients22="${case22}/age-recipients.txt"; write_recipients_file "$recipients22"

premig_dir22="${root22}/pre-migrations"
mkdir -p "$premig_dir22"
chmod 0700 "$root22" "$premig_dir22"
# 21 generations, oldest first, all older than 30 days; one of them (the
# very oldest, which keep-newest-20 must remove) has a space and a tab in
# its filename to prove the NUL-safe sorter handles it correctly.
for i in $(seq -w 2 21); do
  ts="202001${i}_000000"
  primary="${premig_dir22}/unified_${UNIFIED_DB}_${ts}.dump.age"
  printf 'gen-%s\n' "$i" > "$primary"
  printf 'deadbeef  %s\n' "$(basename "$primary")" > "${primary}.sha256"
  chmod 0600 "$primary" "${primary}.sha256"
  touch -d "$((42 - 10#$i)) days ago" "$primary" "${primary}.sha256"
done
odd_name22="${premig_dir22}/unified_${UNIFIED_DB}_2020 0101$(printf '\t')oldest.dump.age"
printf 'gen-oldest\n' > "$odd_name22"
printf 'deadbeef  %s\n' "$(basename "$odd_name22")" > "${odd_name22}.sha256"
chmod 0600 "$odd_name22" "${odd_name22}.sha256"
touch -d '41 days ago' "$odd_name22" "${odd_name22}.sha256"

run_backup "$case22" prune "$root22" "$api22" "$webapp22" "$fakebin22" "$recipients22"

if [ "$RUN_RC" -eq 0 ]; then pass "scenario23: prune with an unusual (space/tab) filename exits 0"; else fail "scenario23: prune with an unusual filename exited $RUN_RC"; fi
remaining_primaries22="$(find "$premig_dir22" -maxdepth 1 -name '*.dump.age' | wc -l)"
if [ "$remaining_primaries22" -eq 20 ]; then
  pass "scenario23: keep-newest-20 still kept exactly 20 generations with an unusual filename present"
else
  fail "scenario23: expected 20 primaries, got ${remaining_primaries22}"
fi
if [ -e "$odd_name22" ] || [ -e "${odd_name22}.sha256" ]; then
  fail "scenario23: the oldest generation (unusual filename) was not removed"
else
  pass "scenario23: the oldest generation (unusual filename) was correctly identified and removed"
fi

# --- Scenario 24: whitespace-only and comment-only recipients fail closed --

case23="${WORKROOT}/case23"; mkdir -p "$case23"
fakebin23="${case23}/fakebin"; make_fakebin "$fakebin23"
root23="${case23}/backups_root"
api23="${case23}/api.env"; webapp23="${case23}/webapp.env"
write_env_file "$api23" "$UNIFIED_DB"
write_env_file "$webapp23" "$UNIFIED_DB"
recipients23a="${case23}/age-recipients-whitespace.txt"; printf '   \n\t\n   \n' > "$recipients23a"

run_backup "$case23" manual "$root23" "$api23" "$webapp23" "$fakebin23" "$recipients23a"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario24a: whitespace-only recipients file fails closed"; else fail "scenario24a: whitespace-only recipients file did not fail"; fi
if grep -q '^pg_dump ' "$case23/call.log" 2>/dev/null; then
  fail "scenario24a: pg_dump was invoked despite whitespace-only recipients file"
else
  pass "scenario24a: pg_dump was never invoked"
fi

case23b="${WORKROOT}/case23b"; mkdir -p "$case23b"
fakebin23b="${case23b}/fakebin"; make_fakebin "$fakebin23b"
root23b="${case23b}/backups_root"
recipients23b="${case23b}/age-recipients-comment.txt"; printf '# just a comment\n# another comment\n' > "$recipients23b"

run_backup "$case23b" manual "$root23b" "$api23" "$webapp23" "$fakebin23b" "$recipients23b"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario24b: comment-only recipients file fails closed"; else fail "scenario24b: comment-only recipients file did not fail"; fi
if grep -q '^pg_dump ' "$case23b/call.log" 2>/dev/null; then
  fail "scenario24b: pg_dump was invoked despite comment-only recipients file"
else
  pass "scenario24b: pg_dump was never invoked"
fi

# The configured age parser, not a shell prefix heuristic, must reject every
# malformed recipient line before pg_dump.  Cover both age and SSH forms.
case23c="${WORKROOT}/case23c"; mkdir -p "$case23c"
fakebin23c="${case23c}/fakebin"; make_fakebin "$fakebin23c"
root23c="${case23c}/backups_root"
recipients23c="${case23c}/age-recipients-malformed-age1.txt"; printf 'age1not-a-valid-recipient\n' > "$recipients23c"
run_backup "$case23c" manual "$root23c" "$api23" "$webapp23" "$fakebin23c" "$recipients23c"
if [ "$RUN_RC" -ne 0 ]; then pass "scenario24c: malformed age1 recipient fails parser preflight"; else fail "scenario24c: malformed age1 recipient did not fail"; fi
if grep -q '^pg_dump ' "$case23c/call.log" 2>/dev/null; then fail "scenario24c: pg_dump was invoked after malformed age1 recipient"; else pass "scenario24c: pg_dump was never invoked"; fi
if grep -q '^age ' "$case23c/call.log" 2>/dev/null; then pass "scenario24c: configured age parser preflight was reached"; else fail "scenario24c: configured age parser preflight was not reached"; fi

case23d="${WORKROOT}/case23d"; mkdir -p "$case23d"
fakebin23d="${case23d}/fakebin"; make_fakebin "$fakebin23d"
root23d="${case23d}/backups_root"
recipients23d="${case23d}/age-recipients-malformed-ssh.txt"; printf 'ssh-ed25519 not/a+valid=ssh-key\n' > "$recipients23d"
run_backup "$case23d" manual "$root23d" "$api23" "$webapp23" "$fakebin23d" "$recipients23d"
if [ "$RUN_RC" -ne 0 ]; then pass "scenario24d: malformed SSH recipient fails parser preflight"; else fail "scenario24d: malformed SSH recipient did not fail"; fi
if grep -q '^pg_dump ' "$case23d/call.log" 2>/dev/null; then fail "scenario24d: pg_dump was invoked after malformed SSH recipient"; else pass "scenario24d: pg_dump was never invoked"; fi
if grep -q '^age ' "$case23d/call.log" 2>/dev/null; then pass "scenario24d: configured age parser preflight was reached"; else fail "scenario24d: configured age parser preflight was not reached"; fi

# --- Scenario 25: psql tick failure does not fail an otherwise-good dump ---

case24="${WORKROOT}/case24"; mkdir -p "$case24"
fakebin24="${case24}/fakebin"; make_fakebin "$fakebin24"
root24="${case24}/backups_root"
api24="${case24}/api.env"; webapp24="${case24}/webapp.env"
write_env_file "$api24" "$UNIFIED_DB"
write_env_file "$webapp24" "$UNIFIED_DB"
recipients24="${case24}/age-recipients.txt"; write_recipients_file "$recipients24"

run_backup "$case24" manual "$root24" "$api24" "$webapp24" "$fakebin24" "$recipients24" FAKE_PSQL_FAIL=1

if [ "$RUN_RC" -eq 0 ]; then pass "scenario25: psql tick failure does not fail an otherwise-successful dump"; else fail "scenario25: psql tick failure incorrectly failed the whole run (rc=$RUN_RC)"; fi
artifact24="$(find "${root24}/manual" -maxdepth 1 -name "unified_${UNIFIED_DB}_*.dump.age" 2>/dev/null | head -1)"
if [ -n "$artifact24" ] && [ -f "$artifact24" ] && [ -f "${artifact24}.sha256" ]; then
  pass "scenario25: artifact and manifest exist despite the tick failure"
else
  fail "scenario25: artifact/manifest missing when only the tick failed"
fi
if grep -qi 'warning' "$case24/stderr.log" "$case24/stdout.log" 2>/dev/null; then
  pass "scenario25: a warning was surfaced for the failed tick"
else
  fail "scenario25: no warning surfaced for the failed tick"
fi

# --- Scenario 26: filesystem root is never a valid backup root ------------

case25="${WORKROOT}/case25"; mkdir -p "$case25"
fakebin25="${case25}/fakebin"; make_fakebin "$fakebin25"
api25="${case25}/api.env"; webapp25="${case25}/webapp.env"
write_env_file "$api25" "$UNIFIED_DB"
write_env_file "$webapp25" "$UNIFIED_DB"
recipients25="${case25}/age-recipients.txt"; write_recipients_file "$recipients25"

run_backup "$case25" manual "/" "$api25" "$webapp25" "$fakebin25" "$recipients25"

if [ "$RUN_RC" -ne 0 ]; then pass "scenario26: filesystem root is rejected as an unsafe backup root"; else fail "scenario26: filesystem root was accepted as a backup root"; fi
if grep -q '^pg_dump ' "$case25/call.log" 2>/dev/null; then
  fail "scenario26: pg_dump was invoked with filesystem root as BACKUPS_ROOT"
else
  pass "scenario26: pg_dump was never invoked for an unsafe root"
fi

# --- Scenario 27: inherited bash -x cannot expose a secret marker -----------

case27="${WORKROOT}/case27"; mkdir -p "$case27"
fakebin27="${case27}/fakebin"; make_fakebin "$fakebin27"
root27="${case27}/backups_root"
api27="${case27}/api.env"; webapp27="${case27}/webapp.env"
write_env_file "$api27" "$UNIFIED_DB"
write_env_file "$webapp27" "$UNIFIED_DB"
recipients27="${case27}/age-recipients.txt"; write_recipients_file "$recipients27"
run_backup_xtrace "$case27" manual "$root27" "$api27" "$webapp27" "$fakebin27" "$recipients27"
if [ "$RUN_RC" -eq 0 ]; then pass "scenario27: bash -x run succeeds"; else fail "scenario27: bash -x run exited $RUN_RC"; fi
assert_no_marker "scenario27" "$case27/stdout.log" "$case27/stderr.log" "$case27/call.log" "$case27/tick.log"
if grep -q '^age ' "$case27/call.log" && grep -q '^pg_dump ' "$case27/call.log"; then pass "scenario27: parser preflight and providers were reached after xtrace disable"; else fail "scenario27: expected preflight/provider calls were not reached"; fi

# --- summary -----------------------------------------------------------------

echo "---"
if [ "$FAILED" -eq 0 ]; then
  echo "ALL SYNTHETIC TESTS PASSED"
  exit 0
else
  echo "SYNTHETIC TESTS FAILED"
  exit 1
fi
