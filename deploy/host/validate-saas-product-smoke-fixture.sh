#!/usr/bin/env bash
set -euo pipefail

fail(){
  echo "FATAL: locked product-smoke fixture integrity check failed: $1" >&2
  return 1
}

validate_fixture(){
  local fixture_path="$1"
  local source_repo="$2"
  local deploy_repo="$3"
  local expected_uid="$4"
  local expected_gid="$5"
  local expected_mode="$6"
  local canonical_fixture canonical_source canonical_deploy metadata

  [ -n "$fixture_path" ] || { fail "path is empty"; return 1; }
  [[ "$fixture_path" = /* ]] || { fail "path must be absolute"; return 1; }
  canonical_fixture="$(realpath -e -- "$fixture_path")" || { fail "path does not resolve"; return 1; }
  [ "$fixture_path" = "$canonical_fixture" ] || {
    fail "path must be canonical and contain no symlink component"
    return 1
  }
  [ -f "$canonical_fixture" ] && [ ! -L "$canonical_fixture" ] || {
    fail "path is not a regular non-symlink file"
    return 1
  }

  canonical_source="$(realpath -e -- "$source_repo")" || { fail "source repo does not resolve"; return 1; }
  canonical_deploy="$(realpath -e -- "$deploy_repo")" || { fail "deploy repo does not resolve"; return 1; }
  case "$canonical_fixture" in
    "$canonical_source"|"$canonical_source"/*|"$canonical_deploy"|"$canonical_deploy"/*)
      fail "fixture must be outside source and deploy repositories"
      return 1
      ;;
  esac

  metadata="$(stat -Lc '%u:%g:%a' -- "$canonical_fixture")" || { fail "cannot read metadata"; return 1; }
  [ "$metadata" = "$expected_uid:$expected_gid:$expected_mode" ] || {
    fail "required owner/group/mode contract is not satisfied"
    return 1
  }
  printf '%s\n' "$canonical_fixture"
}

run_self_test(){
  local test_root source_repo deploy_repo protected_dir fixture alias_dir uid gid output
  test_root="$(mktemp -d /tmp/bcb-smoke-fixture-validator.XXXXXX)"
  trap 'rm -rf -- "$test_root"' RETURN
  source_repo="$test_root/source"
  deploy_repo="$test_root/deploy"
  protected_dir="$test_root/protected"
  mkdir -p "$source_repo" "$deploy_repo" "$protected_dir"
  fixture="$protected_dir/fixture.json"
  printf '{}\n' > "$fixture"
  chmod 0640 "$fixture"
  uid="$(id -u)"
  gid="$(id -g)"

  output="$(validate_fixture "$fixture" "$source_repo" "$deploy_repo" "$uid" "$gid" 640)"
  [ "$output" = "$fixture" ] || { fail "self-test valid fixture was not preserved"; return 1; }

  cp "$fixture" "$source_repo/in-repo.json"
  chmod 0640 "$source_repo/in-repo.json"
  if validate_fixture "$source_repo/in-repo.json" "$source_repo" "$deploy_repo" "$uid" "$gid" 640 >/dev/null 2>&1; then
    fail "self-test accepted in-repo fixture"
    return 1
  fi

  alias_dir="$test_root/protected-alias"
  ln -s "$protected_dir" "$alias_dir"
  if validate_fixture "$alias_dir/fixture.json" "$source_repo" "$deploy_repo" "$uid" "$gid" 640 >/dev/null 2>&1; then
    fail "self-test accepted symlink-parent fixture"
    return 1
  fi

  chmod 0644 "$fixture"
  if validate_fixture "$fixture" "$source_repo" "$deploy_repo" "$uid" "$gid" 640 >/dev/null 2>&1; then
    fail "self-test accepted unsafe mode"
    return 1
  fi
  chmod 0640 "$fixture"

  if validate_fixture "$fixture" "$source_repo" "$deploy_repo" "$((uid + 1))" "$gid" 640 >/dev/null 2>&1; then
    fail "self-test accepted unsafe owner"
    return 1
  fi
  if validate_fixture "$fixture" "$source_repo" "$deploy_repo" "$uid" "$((gid + 1))" 640 >/dev/null 2>&1; then
    fail "self-test accepted unsafe group"
    return 1
  fi
  echo "validate-saas-product-smoke-fixture self-test: OK"
}

case "${1:-}" in
  --validate)
    [ "$#" -eq 4 ] || { fail "usage: $0 --validate <fixture> <source-repo> <deploy-repo>"; exit 2; }
    deploy_gid="$(getent group deploy | cut -d: -f3)" || {
      fail "deploy group is missing"
      exit 1
    }
    [ -n "$deploy_gid" ] || { fail "deploy group is missing"; exit 1; }
    validate_fixture "$2" "$3" "$4" 0 "$deploy_gid" 640
    ;;
  --self-test)
    [ "$#" -eq 1 ] || { fail "usage: $0 --self-test"; exit 2; }
    run_self_test
    ;;
  *)
    fail "usage: $0 --validate <fixture> <source-repo> <deploy-repo> | --self-test"
    exit 2
    ;;
esac
