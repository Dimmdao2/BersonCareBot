#!/usr/bin/env node
/**
 * Compatibility wrapper for the compiled projection health CLI.
 * Runtime SQL lives in src/infra/scripts/projection-health.ts.
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
