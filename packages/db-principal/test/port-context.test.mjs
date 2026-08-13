import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashPortTypedArgs,
  portTypedArg,
  startPortContextTransaction,
  withPortContextTransaction,
} from '../dist/portContext.js';
import { EventEmitter } from 'node:events';

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

test('accepts an exact named root for a staff context and installs its canonical typed-argument hash', async () => {
  const { client, queries } = recordingClient();
  await withPortContextTransaction(
    client,
    {
      ...STAFF_PRINCIPAL,
      purpose: 'staff.save_profile',
      functionIdentity: 'app.save_staff_profile(uuid,text)',
      typedArgs: [
        portTypedArg('uuid', '00000000-0000-0000-0000-000000000010'),
        portTypedArg('text', 'Иван'),
      ],
    },
    async () => undefined,
  );
  const install = queries.find(([sql]) => sql.includes('app.install_port_context'));
  assert.ok(install);
  assert.equal(install[1][4], 'app.save_staff_profile(uuid,text)');
  assert.deepEqual(
    install[1][5],
    hashPortTypedArgs([
      portTypedArg('uuid', '00000000-0000-0000-0000-000000000010'),
      portTypedArg('text', 'Иван'),
    ]),
  );
});

test('allows only the exact patient organization resolver before organization selection', async () => {
  const { client, queries } = recordingClient();
  await withPortContextTransaction(
    client,
    {
      capabilityId: '00000000-0000-0000-0000-000000000104',
      contextClass: 'patient',
      targetRole: 'app_patient',
      purpose: 'patient.organization.resolve',
      functionIdentity: 'app.read_current_patient_active_organizations()',
      actorRef: '00000000-0000-0000-0000-000000000010',
      subjectRef: '00000000-0000-0000-0000-000000000010',
    },
    async () => undefined,
  );
  assert.ok(queries.some(([sql]) => sql.includes('app.install_port_context')));

  const rejected = recordingClient();
  await assert.rejects(
    withPortContextTransaction(
      rejected.client,
      {
        capabilityId: '00000000-0000-0000-0000-000000000105',
        contextClass: 'patient',
        targetRole: 'app_patient',
        purpose: 'relation',
        actorRef: '00000000-0000-0000-0000-000000000010',
        subjectRef: '00000000-0000-0000-0000-000000000010',
      },
      async () => undefined,
    ),
    /patient has an invalid claims matrix/,
  );
  assert.deepEqual(rejected.queries, []);
});

test('destroys a checked-out client when principal validation fails before BEGIN', async () => {
  const failure = recordingClient();
  await assert.rejects(
    withPortContextTransaction(
      failure.client,
      { ...STAFF_PRINCIPAL, capabilityId: 'not-a-uuid' },
      async () => undefined,
    ),
    /capabilityId must be a UUID/,
  );
  assert.deepEqual(failure.queries, []);
  assert.equal(failure.releases.length, 1);
  assert.match(failure.releases[0].message, /capabilityId must be a UUID/);
});

test('manual handle preserves the physical client event surface', async () => {
  const emitter = new EventEmitter();
  const raw = Object.assign(emitter, {
    async query() {
      return undefined;
    },
    release() {
      /* test checkout */
    },
  });
  const handle = await startPortContextTransaction(raw, STAFF_PRINCIPAL);
  let seen = false;
  handle.client.on('physical-error', () => {
    seen = true;
  });
  raw.emit('physical-error');
  assert.equal(seen, true);
  await handle.rollback();
  handle.release();
});
