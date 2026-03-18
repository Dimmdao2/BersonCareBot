#!/bin/bash
set -euo pipefail
export CI=true
pnpm install --frozen-lockfile
pnpm --dir apps/webapp build
