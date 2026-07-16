#!/usr/bin/env bash
set +x
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$PROJECT_ROOT/deploy/host/set-postgres-role-password.mjs"
PROVISIONER="$PROJECT_ROOT/deploy/host/provision-c4-operational-runtime.sh"
PG_BINDIR="$(pg_config --bindir)"
ROOT="$(mktemp -d /tmp/bcb-c4-password.XXXXXX)"
DATA="$ROOT/data"
SOCKET="$ROOT/socket"
ARTIFACTS="$ROOT/artifacts"
SERVER_STARTED=0
mkdir -m 0777 "$SOCKET"
mkdir -m 0700 "$ARTIFACTS"
chmod 0755 "$ROOT"

cleanup(){
  if [ "$SERVER_STARTED" = "1" ]; then
    "$PG_BINDIR/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$ROOT"
}
trap cleanup EXIT HUP INT TERM

fail(){ echo "FATAL: noninteractive password smoke failed: $*" >&2; exit 1; }
[ -x "$HELPER" ] || fail "helper is not executable"
command -v script >/dev/null || fail "script(1) is required"
command -v timeout >/dev/null || fail "timeout(1) is required"
sudo -n -u postgres test -r "$HELPER" || fail "postgres cannot read helper"

"$PG_BINDIR/initdb" -D "$DATA" -A trust -U postgres --no-locale >/dev/null
cat >> "$DATA/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$SOCKET'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql.log'
log_statement = 'all'
log_min_error_statement = 'debug5'
log_min_duration_statement = 0
log_parameter_max_length = -1
log_parameter_max_length_on_error = -1
EOF
printf 'local all postgres trust\nlocal all all scram-sha-256\n' > "$DATA/pg_hba.conf"
"$PG_BINDIR/pg_ctl" -D "$DATA" -w start >/dev/null
SERVER_STARTED=1
"$PG_BINDIR/psql" -h "$SOCKET" -U postgres -d postgres -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE c4_password_role_a LOGIN;
CREATE ROLE c4_password_role_b LOGIN;
SQL

secret_a=$'C4-a quote\' backslash\\ spaces $ ; -- 2026'
secret_b=$'C4-b rotate " percent% colon: slash/ plus+ 2026'
secret_c=$'C4-c PTY [brackets] {braces} =_ 2026'
secret_d=$'C4-d forced post-bind server error ! 2026'

run_helper_sudo(){
  local role="$1" secret="$2" output="$3"
  if ! printf '%s' "$secret" | sudo -n -u postgres env \
      PGHOST="$SOCKET" PGPORT=5432 PGUSER=postgres \
      node "$HELPER" postgres "$role" >"$output" 2>&1; then
    fail "canonical sudo/stdin helper invocation failed"
  fi
}

assert_auth(){
  local role="$1" secret="$2"
  PGPASSWORD="$secret" "$PG_BINDIR/psql" -h "$SOCKET" -U "$role" -d postgres \
    -X -v ON_ERROR_STOP=1 -qAtc "SELECT current_user" | grep -Fxq "$role" || fail "credential verification failed"
}

# Canonical non-TTY path, live argv scan for both raw and reversible base64,
# two roles, rotation, same-password rerun, and old-password rejection.
encoded_c="$(printf '%s' "$secret_c" | base64 -w0)"
printf '%s' "$secret_c" | sudo -n -u postgres env \
  PGHOST="$SOCKET" PGPORT=5432 PGUSER=postgres \
  node "$HELPER" postgres c4_password_role_b >"$ARTIFACTS/process-scan.out" 2>&1 &
scan_pid=$!
while kill -0 "$scan_pid" >/dev/null 2>&1; do
  for cmdline_path in /proc/[0-9]*/cmdline; do
    [ -r "$cmdline_path" ] || continue
    command_line="$(tr '\0' ' ' < "$cmdline_path" 2>/dev/null || true)"
    [[ "$command_line" != *"$secret_c"* ]] || fail "raw secret leaked to live process arguments"
    [[ "$command_line" != *"$encoded_c"* ]] || fail "encoded secret leaked to live process arguments"
  done
done
wait "$scan_pid" || fail "process-argument harness failed"
unset encoded_c
assert_auth c4_password_role_b "$secret_c"

run_helper_sudo c4_password_role_a "$secret_a" "$ARTIFACTS/non-tty-a.out"
assert_auth c4_password_role_a "$secret_a"
run_helper_sudo c4_password_role_a "$secret_b" "$ARTIFACTS/non-tty-rotate.out"
assert_auth c4_password_role_a "$secret_b"
run_helper_sudo c4_password_role_a "$secret_b" "$ARTIFACTS/non-tty-idempotent.out"
assert_auth c4_password_role_a "$secret_b"
if PGPASSWORD="$secret_a" "$PG_BINDIR/psql" -h "$SOCKET" -U c4_password_role_a -d postgres \
    -X -v ON_ERROR_STOP=1 -qAtc "SELECT 1" >/dev/null 2>&1; then
  fail "old credential remained valid after rotation"
fi

# True PTY stdin: script(1) forwards its stdin to the helper's controlling PTY.
# Echo is disabled before Node starts, so the credential cannot enter transcript.
transcript="$ARTIFACTS/pty.transcript"
pty_command="stty -echo; sudo -n -u postgres env PGHOST='$SOCKET' PGPORT=5432 PGUSER=postgres node '$HELPER' postgres c4_password_role_b"
# In canonical terminal mode the hidden newline terminates the one-line password;
# script(1) does not translate closing its own stdin into EOF on the child PTY.
if ! printf '%s\n' "$secret_b" | timeout 10 script -E never -qefc "$pty_command" "$transcript" >/dev/null 2>&1; then
  fail "PTY stdin helper invocation prompted, hung, or failed"
fi
assert_auth c4_password_role_b "$secret_b"

# A failure inside the server-side dynamic ALTER must expose only the generic
# client diagnostic and must not persist PL/pgSQL ERROR CONTEXT in server logs.
if printf '%s' "$secret_d" | sudo -n -u postgres env \
    PGHOST="$SOCKET" PGPORT=5432 PGUSER=postgres \
    node "$HELPER" postgres c4_missing_role >"$ARTIFACTS/post-bind-error.out" 2>&1; then
  fail "post-bind server error unexpectedly succeeded"
fi
grep -Fxq "FATAL: PostgreSQL role password update failed" "$ARTIFACTS/post-bind-error.out" || \
  fail "post-bind server error exposed a non-generic client diagnostic"

# Invalid identifiers fail before connection and still expose only the generic diagnostic.
for bad_args in "postgres bad-role" "bad-db c4_password_role_a"; do
  if printf '%s' "$secret_a" | sudo -n -u postgres env \
      PGHOST="$SOCKET" PGPORT=5432 PGUSER=postgres \
      node "$HELPER" $bad_args >"$ARTIFACTS/invalid.out" 2>&1; then
    fail "unsafe identifier was accepted"
  fi
done

# `bash -x` must be neutralized before provisioner touches any URL/password.
bash -x "$PROVISIONER" --self-test >"$ARTIFACTS/provision-xtrace.out" 2>&1
head -n 1 "$ARTIFACTS/provision-xtrace.out" | grep -Fq 'set +x' || fail "provisioner did not disable inherited xtrace"

pattern_file="$ARTIFACTS/secret.patterns"
printf '%s\n' "$secret_a" "$secret_b" "$secret_c" "$secret_d" \
  "$(printf '%s' "$secret_a" | base64 -w0)" \
  "$(printf '%s' "$secret_b" | base64 -w0)" \
  "$(printf '%s' "$secret_c" | base64 -w0)" \
  "$(printf '%s' "$secret_d" | base64 -w0)" > "$pattern_file"
chmod 0600 "$pattern_file"
for output in "$ARTIFACTS"/*.out "$transcript"; do
  if grep -F -f "$pattern_file" "$output" >/dev/null 2>&1; then
    fail "secret leaked to captured output"
  fi
done
grep -Fq "PostgreSQL role password updated: OK" "$ARTIFACTS/process-scan.out" || fail "safe success marker missing"

"$PG_BINDIR/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null
SERVER_STARTED=0
if find "$DATA/log" -type f -print0 | xargs -0 grep -F -f "$pattern_file" >/dev/null 2>&1; then
  fail "raw or encoded secret persisted in PostgreSQL logs"
fi

rm -f "$ARTIFACTS"/*.out "$transcript" "$pattern_file"
[ -z "$(find "$ARTIFACTS" -mindepth 1 -print -quit)" ] || fail "temporary secret artifacts remain"
echo "C4 noninteractive PostgreSQL role password smoke: OK (sudo stdin + PTY + rotation + forced-log no-leak)"
