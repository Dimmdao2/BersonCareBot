#!/usr/bin/env bash

# Shared producer of the SaaS isolation coverage record (E1 post-runtime gate).
#
# This file is a sourced library, not an operator entrypoint. The caller must have DEPLOY_REPO and
# WEBAPP_ENV set, must call mark_e1_runtime_coverage_start() BEFORE it restarts the TEST units, and
# must call run_e1_post_runtime_coverage_gate() AFTER those units answer healthy.
#
# Why a library: `app.record_saas_isolation_coverage` is the only writer of
# public.saas_isolation_coverage_runs, and Global Admin → «Здоровье системы» reports the isolation
# monitor as blind (`coverage_missing`, all six services listed as missing) whenever nothing has
# written it inside the 24h freshness window. Both TEST entry points must feed the same record
# through the same call, so the closure lives in one place with the check count as its parameter
# instead of being copied per entry point (AGENTS.md §5).

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "FATAL: saas-isolation-coverage-gate-lib.sh is a sourced library" >&2
  exit 2
fi

E1_RUNTIME_COVERAGE_STARTED_AT="${E1_RUNTIME_COVERAGE_STARTED_AT:-}"

mark_e1_runtime_coverage_start(){
  E1_RUNTIME_COVERAGE_STARTED_AT="$(node -e 'process.stdout.write(new Date().toISOString())')"
}

# $1 — number of isolation checks this deploy performed; the CLI refuses anything below the six
# required service families, so each caller states its own honest count next to its own gate list.
run_e1_post_runtime_coverage_gate(){
  local checks="${1:-}"
  [ -n "$checks" ] || {
    echo "FATAL: run_e1_post_runtime_coverage_gate needs the performed check count" >&2
    exit 1
  }
  [ -n "$E1_RUNTIME_COVERAGE_STARTED_AT" ] || {
    echo "FATAL: E1 runtime coverage start was not recorded before TEST restart" >&2
    exit 1
  }
  # Runtime reporters have a 250 ms bounded write; allow restart- and smoke-triggered writes to
  # settle before the authoritative pre-coverage read.
  sleep 1
  # TEST-only softening (owner 2026-07-18, var B): this is a DIAGNOSTIC/observability gate, NOT the
  # wall enforcement — FORCE-RLS is asserted separately by the caller and stays hard. On TEST a single
  # benign transient must NOT fail-closed and take down the demo env; warn loudly and continue. Prod
  # deploy scripts never source this library, so prod strictness is unaffected.
  # The reporter opens the same three mTLS pools as the TEST webapp. Their private keys are owned by
  # bcb-web-test and deliberately unreadable to deploy, so load the protected env as root and execute
  # the TypeScript entrypoint under the actual webapp runtime identity. Calling tsx directly also
  # avoids making the nologin service account initialise a Corepack cache in its absent home dir.
  if sudo bash -lc "set -a && . '$WEBAPP_ENV' && set +a && \
    cd '$DEPLOY_REPO/apps/webapp' && \
    exec sudo -E -u bcb-web-test node_modules/.bin/tsx \
      scripts/report-saas-isolation-diagnostics.ts post-runtime-gate \
      --started-at '$E1_RUNTIME_COVERAGE_STARTED_AT' --checks $checks"; then
    echo "   E1 post-runtime coverage/read gate: OK"
  else
    echo "   ⚠️  WARN [TEST]: E1 isolation post-runtime gate did NOT pass — TEST deploy CONTINUES (env stays up)." >&2
    echo "   ⚠️  FORCE-RLS wall assertion stays hard; this gate is diagnostic-only on TEST." >&2
    echo "   ⚠️  Triage: run the reporter as bcb-web-test with the protected webapp.test env loaded by root." >&2
    echo "   ⚠️  Resolve once triaged benign:  ... diagnostics:saas-isolation -- coverage --id <uuid> --status complete --started-at <after last_seen> --finished-at <now> --services cron,integrator,media_worker,scheduler,webapp,worker --checks $checks --unexpected 0" >&2
  fi
}
