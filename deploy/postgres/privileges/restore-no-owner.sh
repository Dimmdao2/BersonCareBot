#!/usr/bin/env bash
# Restore application data through local postgres without replaying legacy dump owners/logins.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <database> <dump> <privileges-sql>" >&2
  exit 64
fi

db="$1"
dump="$2"
privileges_sql="$3"
[[ -f "$dump" && -f "$privileges_sql" ]] || { echo 'dump or generated privileges SQL is missing' >&2; exit 66; }

# Old OWNER metadata is deliberately ignored: application DDL/data is created as the ordinary
# object owner, then the generated artifact assigns the exact seam owners and ACL/policy wall.
pg_restore -U postgres --no-owner --no-privileges --role=app_object_owner --dbname="$db" "$dump"
psql -X -U postgres -d "$db" -1 -v ON_ERROR_STOP=1 -f "$privileges_sql"
