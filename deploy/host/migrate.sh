#!/bin/bash
set -euo pipefail
node dist/infra/db/migrate.js
