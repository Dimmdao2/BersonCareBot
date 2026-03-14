#!/bin/bash
set -euo pipefail
export CI=true
pnpm install --frozen-lockfile
pnpm --dir webapp build
