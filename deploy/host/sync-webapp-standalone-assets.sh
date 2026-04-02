#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
WEBAPP_DIR="${PROJECT_ROOT}/apps/webapp"
STANDALONE_DIR="${WEBAPP_DIR}/.next/standalone/apps/webapp"
STATIC_SRC="${WEBAPP_DIR}/.next/static"
PUBLIC_SRC="${WEBAPP_DIR}/public"
STATIC_DST="${STANDALONE_DIR}/.next/static"
PUBLIC_DST="${STANDALONE_DIR}/public"
CHUNKS_DIR="${STATIC_DST}/chunks"

fail() {
  echo "sync-webapp-standalone-assets: $*" >&2
  exit 1
}

[ -d "${STATIC_SRC}" ] || fail "Missing build static dir: ${STATIC_SRC}. Run webapp build first."
[ -d "${PUBLIC_SRC}" ] || fail "Missing public dir: ${PUBLIC_SRC}."

mkdir -p "${STANDALONE_DIR}/.next"
rm -rf "${STATIC_DST}" "${PUBLIC_DST}"
cp -r "${STATIC_SRC}" "${STATIC_DST}"
cp -r "${PUBLIC_SRC}" "${PUBLIC_DST}"

chunk_file="$(find "${CHUNKS_DIR}" -maxdepth 1 -type f -name "*.js" | sort | sed -n '1p')"
[ -n "${chunk_file}" ] || fail "No JS chunks in ${CHUNKS_DIR} after sync."

echo "Synced standalone assets. sample_chunk=$(basename "${chunk_file}")"
