import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCanonicalArgs,
  assertNamedDevEnv,
  databaseNameFromUrl,
  LIVE_COVERAGE,
  selfTestRegistry,
} from './named-dev-db-behavior-runner.mjs';

const canonicalApiEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
INTEGRATOR_DB_URL=postgresql://integrator:secret@db.dev.internal:5432/bcb_webapp_dev
`;

const canonicalWebappEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
DATABASE_URL_STAFF=postgresql://staff:secret@db.dev.internal:5432/bcb_webapp_dev
DATABASE_URL_PATIENT=postgresql://patient:secret@db.dev.internal:5432/bcb_webapp_dev
DATABASE_URL_GLOBAL_ADMIN=postgresql://admin:secret@db.dev.internal:5432/bcb_webapp_dev
`;

describe('named DEV database behavior runner refusal gate', () => {
  it('accepts only the fixed run and self-test modes', () => {
    assert.doesNotThrow(() => assertCanonicalArgs(['--run']));
    assert.doesNotThrow(() => assertCanonicalArgs(['--self-test']));
    assert.throws(() => assertCanonicalArgs([]), /Usage/);
    assert.throws(
      () => assertCanonicalArgs(['--run', '--database-url=postgresql:\/\/test']),
      /Usage/,
    );
    assert.throws(() => assertCanonicalArgs(['--target=test']), /Usage/);
  });

  it('accepts all four canonical port URLs only when they name bcb_webapp_dev', () => {
    assert.doesNotThrow(() => assertNamedDevEnv(canonicalApiEnv, canonicalWebappEnv));
    assert.equal(
      databaseNameFromUrl(
        'postgresql://patient:secret@db.dev.internal:5432/bcb_webapp_dev',
        'patient',
      ),
      'bcb_webapp_dev',
    );
  });

  it('kills a TEST, PROD, generic-database or legacy-context mutation', () => {
    for (const forbiddenDatabase of ['bersoncarebot_test', 'bersoncarebot', 'postgres']) {
      const mutated = canonicalWebappEnv.replaceAll('bcb_webapp_dev', forbiddenDatabase);
      assert.throws(
        () => assertNamedDevEnv(canonicalApiEnv, mutated),
        /only bcb_webapp_dev is allowed/,
      );
    }
    assert.throws(
      () =>
        assertNamedDevEnv(
          canonicalApiEnv,
          canonicalWebappEnv.replace('port-context', 'legacy-guc'),
        ),
      /must be port-context/,
    );
    assert.throws(
      () =>
        assertNamedDevEnv(
          canonicalApiEnv,
          canonicalWebappEnv.replace(/DATABASE_URL_PATIENT=.*\n/, ''),
        ),
      /DATABASE_URL_PATIENT is required/,
    );
  });
});

describe('named DEV behavior evidence registry', () => {
  it('keeps the exact conservative 33-call product-path claim', () => {
    assert.doesNotThrow(() => selfTestRegistry());
  });

  it('fails if a covered class is removed or its count is inflated', () => {
    const missing = { ...LIVE_COVERAGE };
    delete missing.pgSupportCommunication;
    assert.throws(() => selfTestRegistry(missing), /registry keys changed/);

    const inflated = { ...LIVE_COVERAGE, tenantIsolationMatrix: 11 };
    assert.throws(() => selfTestRegistry(inflated), /count changed/);
  });
});
