import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCanonicalArgs,
  assertNamedDevEnv,
  databaseNameFromUrl,
  fetchWithTimeout,
  LIVE_COVERAGE,
  proveReminderRuleLifecycle,
  proveTenantClinicalWalls,
  reminderRuleIdFromRunKey,
  selfTestRegistry,
} from './named-dev-db-behavior-runner.mjs';

const canonicalApiEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
INTEGRATOR_DB_URL=postgresql://integrator:secret@127.0.0.1:5432/bcb_webapp_dev
`;

const canonicalWebappEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
DATABASE_URL_STAFF=postgresql://staff:secret@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_PATIENT=postgresql://patient:secret@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_GLOBAL_ADMIN=postgresql://admin:secret@127.0.0.1:5432/bcb_webapp_dev
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
        'postgresql://patient:secret@127.0.0.1:5432/bcb_webapp_dev',
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
        /exact canonical named DEV/,
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
    assert.throws(
      () => assertNamedDevEnv(canonicalApiEnv, canonicalWebappEnv.replaceAll(':5432/', ':5433/')),
      /exact canonical named DEV/,
    );
    assert.throws(
      () => assertNamedDevEnv(canonicalApiEnv.replace('127.0.0.1', 'localhost'), canonicalWebappEnv),
      /exact canonical named DEV/,
    );
  });
});

describe('named DEV behavior evidence registry', () => {
  it('keeps only explicitly mapped same-consequence product-path claims', () => {
    assert.doesNotThrow(() => selfTestRegistry());
  });

  it('fails if a covered class is removed or its count is inflated', () => {
    const missing = { ...LIVE_COVERAGE };
    delete missing.pgSupportCommunication;
    assert.throws(() => selfTestRegistry(missing), /registry keys changed/);

    const inflated = { ...LIVE_COVERAGE, pgPatientBookings: 2 };
    assert.throws(() => selfTestRegistry(inflated), /count changed/);
  });
});

describe('bounded requests and mutation recovery', () => {
  it('aborts a stalled fetch at the per-request deadline', async () => {
    const originalFetch = globalThis.fetch;
    let hold;
    globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        hold = setTimeout(() => reject(new Error('test hold expired')), 1_000);
        init.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(hold);
            reject(init.signal.reason);
          },
          { once: true },
        );
      });
    try {
      await assert.rejects(() => fetchWithTimeout('http://127.0.0.1/never', {}, 5));
    } finally {
      clearTimeout(hold);
      globalThis.fetch = originalFetch;
    }
  });

  it('knows the reminder cleanup id before a lost create response', async () => {
    const calls = [];
    const platformUserId = '11111111-1111-4111-8111-111111111111';
    const runTag = '22222222-2222-4222-8222-222222222222';
    const expectedId = reminderRuleIdFromRunKey(platformUserId, `named-dev-reminder-${runTag}`);
    let createAttempts = 0;
    const sessions = {
      patient: {
        me: { userId: platformUserId },
        async request(path, options = {}) {
          calls.push({ path, options });
          if (path === '/api/patient/treatment-program-instances') {
            return {
              status: 200,
              body: { ok: true, items: [{ id: 'program-1', status: 'active', updatedAt: '2026-08-17' }] },
            };
          }
          if (path === '/api/patient/reminders/create') {
            createAttempts += 1;
            if (createAttempts === 1) throw new Error('response lost');
            return { status: 201, body: { ok: true, reminder: { id: expectedId } } };
          }
          if (path === `/api/patient/reminders/${expectedId}` && options.method === 'DELETE') {
            return { status: 404, body: { ok: false, error: 'not_found' } };
          }
          throw new Error(`unexpected request ${path}`);
        },
      },
      isolatedPatient: { request: async () => ({ status: 404, body: { error: 'not_found' } }) },
    };
    await assert.rejects(() => proveReminderRuleLifecycle(sessions, runTag), /response lost/);
    assert.equal(calls.at(-1).path, `/api/patient/reminders/${expectedId}`);
    assert.equal(calls.at(-1).options.recovery, true);
    assert.equal(createAttempts, 2);
  });
});

describe('tenant clinical behavior mapping', () => {
  it('reads own enrollment/visit paths and observes both cross-organization walls', async () => {
    const ownId = '11111111-1111-4111-8111-111111111111';
    const isolatedId = '22222222-2222-4222-8222-222222222222';
    const calls = [];
    const session = (label, ownPatient, foreignPatient) => ({
      async request(path) {
        calls.push(`${label}:${path}`);
        if (path === '/api/doctor/patients') {
          return { status: 200, body: { clients: [{ userId: ownPatient }] } };
        }
        if (path.includes(ownPatient)) return { status: 200, body: { ok: true, items: [] } };
        if (path.includes(foreignPatient)) {
          return { status: 404, body: { error: 'not_found' } };
        }
        throw new Error(`unexpected request ${path}`);
      },
    });
    const result = await proveTenantClinicalWalls({
      doctor: session('doctor', ownId, isolatedId),
      isolatedDoctor: session('isolated', isolatedId, ownId),
    });
    assert.deepEqual(result, { enrollmentWall: true, clinicalVisitWall: true });
    assert.equal(calls.length, 10);
  });
});
