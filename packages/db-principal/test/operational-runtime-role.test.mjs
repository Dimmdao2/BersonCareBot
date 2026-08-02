import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDbPrincipalToTransaction,
  applyDbOperationalOrganizationContextToConnection,
  clearDbPrincipalFromTransaction,
  clearDbOperationalOrganizationContextFromConnection,
  createDbClinicBillingPrincipal,
  createDbPlatformPrincipal,
  resetDbOperationalRuntimeRole,
  setDbOperationalRuntimeRole,
} from '../dist/index.js';

test('sets each supported operational runtime role with fixed SQL', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
    },
  };

  for (const role of [
    'app_operational_diagnostic',
    'app_operational_delivery_worker',
    'app_operational_media_worker',
    'app_operational_scheduler',
    'app_config_reader',
  ]) {
    await setDbOperationalRuntimeRole(client, role);
  }

  assert.deepEqual(queries, [
    'SET ROLE app_operational_diagnostic',
    'SET ROLE app_operational_delivery_worker',
    'SET ROLE app_operational_media_worker',
    'SET ROLE app_operational_scheduler',
    'SET ROLE app_config_reader',
  ]);
});

test('installs and clears legacy operational organization context without changing role', async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push([sql, values]);
    },
  };
  await applyDbOperationalOrganizationContextToConnection(
    client,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  await clearDbOperationalOrganizationContextFromConnection(client);
  assert.deepEqual(queries, [
    ["SELECT set_config('app.org', $1, false)", ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
    ["SELECT set_config('app.patient_user_id', $1, false)", ['']],
    ["SELECT set_config('app.integrator_user_id', $1, false)", ['']],
    ["SELECT set_config('app.org', $1, false)", ['']],
    ["SELECT set_config('app.patient_user_id', $1, false)", ['']],
    ["SELECT set_config('app.integrator_user_id', $1, false)", ['']],
  ]);
});

test('clears a missing locked operational organization context through the protected helper', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
    },
  };
  const options = { mode: 'locked', signer: { secret: 'unit-test-secret' } };
  await applyDbOperationalOrganizationContextToConnection(client, undefined, options);
  await clearDbOperationalOrganizationContextFromConnection(client, options);
  assert.deepEqual(queries, [
    'SELECT app.release_principal_context()',
    'SELECT app.release_principal_context()',
  ]);
});

test('rejects an unsupported role before querying', async () => {
  let queried = false;
  const client = {
    async query() {
      queried = true;
    },
  };

  await assert.rejects(
    setDbOperationalRuntimeRole(client, 'app_owner'),
    /Unsupported DB operational runtime role/,
  );
  assert.equal(queried, false);
});

test('resets an operational runtime role with fixed SQL', async () => {
  const queries = [];
  await resetDbOperationalRuntimeRole({
    async query(sql) {
      queries.push(sql);
    },
  });
  assert.deepEqual(queries, ['RESET ROLE']);
});

test('applies and clears the platform settings role in transaction scope', async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push([sql, values]);
    },
  };
  const principal = createDbPlatformPrincipal({
    platformUserId: '77777777-7777-4777-8777-777777777777',
  });
  const options = { mode: 'locked', signer: { secret: 'unit-test-secret' } };

  assert.equal(await applyDbPrincipalToTransaction(client, principal, options), true);
  await clearDbPrincipalFromTransaction(client, options, principal);

  assert.deepEqual(queries, [
    ['SET ROLE app_platform_settings', undefined],
    ["SELECT set_config('app.org', $1, true)", ['']],
    ["SELECT set_config('app.patient_user_id', $1, true)", ['']],
    ["SELECT set_config('app.integrator_user_id', $1, true)", ['']],
    ["SELECT set_config('app.org', $1, true)", ['']],
    ["SELECT set_config('app.patient_user_id', $1, true)", ['']],
    ["SELECT set_config('app.integrator_user_id', $1, true)", ['']],
    ['RESET ROLE', undefined],
  ]);
});

test('applies and clears the signed clinic billing role in transaction scope', async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push([sql, values]);
      if (sql === 'SELECT pg_backend_pid() AS backend_pid') {
        return { rows: [{ backend_pid: 1234 }] };
      }
    },
  };
  const principal = createDbClinicBillingPrincipal({
    organizationId: '11111111-1111-4111-8111-111111111111',
    platformUserId: '77777777-7777-4777-8777-777777777777',
  });
  const options = {
    mode: 'locked',
    signer: {
      secret: 'unit-test-secret-that-is-long-enough',
      now: () => new Date('2026-07-28T00:00:00.000Z'),
      nonce: () => 'clinic-billing-test-nonce',
    },
  };

  assert.equal(await applyDbPrincipalToTransaction(client, principal, options), true);
  await clearDbPrincipalFromTransaction(client, options, principal);

  assert.deepEqual(
    queries.map(([sql]) => sql),
    [
      'RESET ROLE',
      'SET ROLE app_clinic_billing',
      'SELECT pg_backend_pid() AS backend_pid',
      'SELECT app.install_signed_context( $1::text, $2::integer, $3::bigint, $4::uuid, $5::uuid, $6::bigint, $7::text )',
      'SELECT app.release_principal_context()',
      'RESET ROLE',
    ],
  );
  assert.equal(queries[3][1][3], '11111111-1111-4111-8111-111111111111');
});

test('resets the platform role even when transaction-context cleanup fails', async () => {
  const queries = [];
  const cleanupError = new Error('context cleanup failed');
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT set_config')) throw cleanupError;
    },
  };
  const principal = createDbPlatformPrincipal({
    platformUserId: '77777777-7777-4777-8777-777777777777',
  });

  await assert.rejects(clearDbPrincipalFromTransaction(client, {}, principal), cleanupError);
  assert.deepEqual(queries, ["SELECT set_config('app.org', $1, true)", 'RESET ROLE']);
});
