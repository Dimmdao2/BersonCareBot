#!/bin/bash
set -euo pipefail

# Test-host deploy = exactly the production deploy flow, but for the `test` branch.
# Single source of truth: this is a thin wrapper over deploy-prod.sh so the test
# host and the prod host never drift. The only difference is the branch pulled.
export DEPLOY_BRANCH=test
exec bash "$(dirname "$0")/deploy-prod.sh"
