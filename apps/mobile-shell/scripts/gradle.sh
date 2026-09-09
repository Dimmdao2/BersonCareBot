#!/usr/bin/env bash
set -euo pipefail

shell_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f /home/dev/.local/share/bcb-android/env.sh ]]; then
  # The user-owned DEV toolchain is deliberately outside this repository.
  source /home/dev/.local/share/bcb-android/env.sh
fi

if [[ -z "${ANDROID_HOME:-}" || -z "${JAVA_HOME:-}" ]]; then
  echo "ANDROID_HOME and JAVA_HOME must be set; source /home/dev/.local/share/bcb-android/env.sh" >&2
  exit 1
fi

cd "$shell_root/android"
exec ./gradlew "$@"
