#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm --dir webapp build
