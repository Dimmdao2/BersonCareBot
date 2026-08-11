import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPortTypedArgs, startPortContextTransaction, withPortContextTransaction } from '../dist/portContext.js';

const STAFF_PRINCIPAL = {
  capabilityId: '00000000-0000-0000-0000-000000000101',
  contextClass: 'staff',
  targetRole: 'app_staff',
  purpose: 'relation',
  actorRef: '00000000-0000-0000-0000-000000000010',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

function recordingClient(queryImpl = async () => undefined) {
  const queries = [];
  const releases = [];
  return {
    queries,
    releases,
    client: {
      async query(sql, values) {
        queries.push([sql, values]);
        return queryImpl(sql, values, queries);
      },
      release(error) {
        releases.push(error);
      },
    },
  };
}

test('runs the operation against the exact checked-out client', async () => {
  const { client } = recordingClient();

  await withPortContextTransaction(client, STAFF_PRINCIPAL, async (transactionClient) => {
    assert.equal(transactionClient, client);
  });
});

test('sends no request id for a staff context', async () => {
  const { client, queries } = recordingClient();

  await withPortContextTransaction(client, STAFF_PRINCIPAL, async () => undefined);

  const install = queries.find(([sql]) => sql.includes('app.install_port_context'));
  assert.ok(install, 'install_port_context was not called');
  assert.equal(install[1][10], null);
});

test('destroys the checkout when success-path cleanup fails', async () => {
  let clearCalls = 0;
  const cleanupFailure = new Error('injected cleanup failure');
  const { client, releases } = recordingClient(async (sql) => {
    if (sql === 'SELECT app.clear_port_context()') {
      clearCalls += 1;
      if (clearCalls === 2) throw cleanupFailure;
    }
  });

  await assert.rejects(
    withPortContextTransaction(client, STAFF_PRINCIPAL, async () => undefined),
    cleanupFailure,
  );
  assert.deepEqual(releases, [cleanupFailure]);
});

test('rejects a typed-argument tag outside the ten declared PostgreSQL 16 types', () => {
  assert.throws(
    () => hashPortTypedArgs([{ typeTag: 'unknown@1', value: Buffer.alloc(0) }]),
    /unsupported port typed arg tag/i,
  );
});

test('rejects an unsafe JavaScript number before serializing an integrator bigint identity', async () => {
  const { client, queries } = recordingClient();

  await assert.rejects(
    withPortContextTransaction(
      client,
      {
        capabilityId: '00000000-0000-0000-0000-000000000103',
        contextClass: 'integrator',
        targetRole: 'app_operational_delivery_worker',
        purpose: 'relation',
        integratorUserId: Number.MAX_SAFE_INTEGER + 1,
      },
      async () => undefined,
    ),
    /safe integer/i,
  );
  assert.deepEqual(queries, []);
});

test('manual transaction handle destroys its exact checkout after a business query fault', async () => {
  const queryFailure = new Error('injected business query failure');
  const { client, releases } = recordingClient(async (sql) => {
    if (sql === 'SELECT business_fault') throw queryFailure;
  });
  const handle = await startPortContextTransaction(client, STAFF_PRINCIPAL);
  await assert.rejects(handle.client.query('SELECT business_fault'), queryFailure);
  await handle.rollback();
  handle.release();
  assert.deepEqual(releases, [queryFailure]);
});
