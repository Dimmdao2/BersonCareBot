#!/bin/bash
set -euo pipefail
pnpm --dir apps/webapp start -- --hostname 127.0.0.1 --port "${PORT:-6200}"
