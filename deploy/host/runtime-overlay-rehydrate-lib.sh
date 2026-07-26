#!/usr/bin/env bash

# Shared post-migration runtime-overlay closure.
#
# This file is a sourced library, not an operator entrypoint. The caller must provide
# runtime_overlay_admin_psql(), which executes psql against its already guarded target.
# Keeping the ordered SQL list here prevents TEST and DEV recovery paths from drifting.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "FATAL: runtime-overlay-rehydrate-lib.sh is a sourced library" >&2
  exit 2
fi

runtime_overlay_validate_pg_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "FATAL: $label must be a simple PostgreSQL identifier, got: $value" >&2
    return 1
  fi
}

runtime_overlay_parse_database_identity() {
  local label="$1"
  local expected_database="$2"
  local identity="$3"
  local role_name database_name

  role_name="${identity%%|*}"
  database_name="${identity#*|}"
  if [[ "$identity" != *"|"* || -z "$role_name" || -z "$database_name" ]]; then
    echo "FATAL: $label identity probe returned an invalid shape" >&2
    return 1
  fi
  runtime_overlay_validate_pg_identifier "$label role" "$role_name" || return 1
  if [[ "$database_name" != "$expected_database" ]]; then
    echo "FATAL: $label points to '$database_name', expected '$expected_database'" >&2
    return 1
  fi
  printf '%s\n' "$role_name"
}

runtime_overlay_assert_separate_roles() {
  local label="$1"
  local owner_role="$2"
  local runtime_role="$3"
  runtime_overlay_validate_pg_identifier "$label owner role" "$owner_role" || return 1
  runtime_overlay_validate_pg_identifier "$label runtime role" "$runtime_role" || return 1
  if [[ "$owner_role" == "$runtime_role" ]]; then
    echo "FATAL: $label runtime role must be distinct from the owner/migrator role" >&2
    return 1
  fi
}

runtime_overlay_assert_canonical_file() {
  local path="$1"
  local expected="$2"
  local label="$3"
  if [[ -L "$path" || ! -f "$path" || "$(realpath "$path")" != "$expected" ]]; then
    echo "FATAL: $label path guard failed" >&2
    return 1
  fi
}

runtime_overlay_apply_post_migration_chain() {
  local repo_root="$1"
  local database_name="$2"
  local e1_runtime_role="$3"
  local protected_context_installed="$4"
  local relative_path

  declare -F runtime_overlay_admin_psql >/dev/null || {
    echo "FATAL: runtime_overlay_admin_psql callback is missing" >&2
    return 1
  }
  if [[ "$repo_root" != /* || -L "$repo_root" || ! -d "$repo_root" || "$(realpath "$repo_root")" != "$repo_root" ]]; then
    echo "FATAL: runtime overlay repository root path guard failed" >&2
    return 1
  fi
  runtime_overlay_validate_pg_identifier "runtime overlay database" "$database_name" || return 1
  runtime_overlay_validate_pg_identifier "runtime overlay E1 role" "$e1_runtime_role" || return 1
  if [[ "$protected_context_installed" != "0" && "$protected_context_installed" != "1" ]]; then
    echo "FATAL: protected-context state must be 0 or 1" >&2
    return 1
  fi

  local -a always_overlays=(
    deploy/postgres/organization-member-invites-rls.sql
    deploy/postgres/patient-invites-rls.sql
    deploy/postgres/store-p0-entitlements-rls.sql
    deploy/postgres/patient-course-assignment-wall.sql
    deploy/postgres/patient-support-mark-read-grant.sql
    deploy/postgres/patient-write-grants-role-pool-mismatch.sql
    deploy/postgres/specialist-signup-public-bootstrap-rls.sql
    deploy/postgres/specialist-owner-provisioning-rls.sql
    deploy/postgres/u9a-platform-settings-role.sql
    deploy/postgres/c5a-platform-operations-runtime.sql
  )
  local -a protected_overlays=(
    deploy/postgres/runtime-overlay-app-owner-handoff.sql
    deploy/postgres/reference-catalog-rls.sql
    deploy/postgres/patient-visible-catalog-rls.sql
    deploy/postgres/patient-web-push-vapid-public-key-accessor.sql
    deploy/postgres/public-booking-bootstrap-resolver.sql
    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql
  )

  for relative_path in "${always_overlays[@]}"; do
    runtime_overlay_assert_canonical_file \
      "$repo_root/$relative_path" \
      "$repo_root/$relative_path" \
      "runtime overlay $relative_path" || return 1
    runtime_overlay_admin_psql -d "$database_name" -X -v ON_ERROR_STOP=1 \
      -f "$repo_root/$relative_path" || return 1
  done

  if [[ "$protected_context_installed" == "1" ]]; then
    for relative_path in "${protected_overlays[@]}"; do
      runtime_overlay_assert_canonical_file \
        "$repo_root/$relative_path" \
        "$repo_root/$relative_path" \
        "runtime overlay $relative_path" || return 1
      runtime_overlay_admin_psql -d "$database_name" -X -v ON_ERROR_STOP=1 \
        -f "$repo_root/$relative_path" || return 1
    done
  fi

  relative_path=deploy/postgres/e1-webapp-runtime-config.sql
  runtime_overlay_assert_canonical_file \
    "$repo_root/$relative_path" \
    "$repo_root/$relative_path" \
    "runtime overlay $relative_path" || return 1
  runtime_overlay_admin_psql -d "$database_name" -X -v ON_ERROR_STOP=1 \
    -v e1_webapp_runtime_role="$e1_runtime_role" \
    -f "$repo_root/$relative_path"
}
