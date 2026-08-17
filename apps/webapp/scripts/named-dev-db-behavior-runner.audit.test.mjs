import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNamedDevEnv } from './named-dev-db-behavior-runner.mjs';

const localApiEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
INTEGRATOR_DB_URL=postgresql://integrator:redacted@127.0.0.1:5432/bcb_webapp_dev
`;

const localWebappEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
DATABASE_URL_STAFF=postgresql://staff:redacted@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_PATIENT=postgresql://patient:redacted@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_GLOBAL_ADMIN=postgresql://admin:redacted@127.0.0.1:5432/bcb_webapp_dev
`;

describe('independent named-DEV target refusal audit', () => {
  it('refuses a remote host even when the remote database reuses the DEV database name', () => {
    const remoteWebappEnv = localWebappEnv.replaceAll('127.0.0.1', '135.106.162.170');
    assert.throws(
      () => assertNamedDevEnv(localApiEnv, remoteWebappEnv),
      /127\.0\.0\.1|loopback|canonical named DEV/i,
    );
  });

  it('refuses a non-port-context integrator even when webapp remains port-context', () => {
    const legacyApiEnv = localApiEnv.replace('port-context', 'legacy-guc');
    assert.throws(
      () => assertNamedDevEnv(legacyApiEnv, localWebappEnv),
      /INTEGRATOR.*port-context|port-context.*INTEGRATOR/i,
    );
  });
});
