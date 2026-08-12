#!/usr/bin/env node
/**
 * Compatibility wrapper for the compiled projection health CLI.
 * Runtime metrics come from the live integrator GET /health/projection endpoint.
 */
const { runProjectionHealthCli } = await import('../dist/infra/scripts/projection-health.js');

runProjectionHealthCli()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
