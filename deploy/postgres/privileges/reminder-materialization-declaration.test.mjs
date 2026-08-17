import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';

const functions = declaration.portContext.functions;
const database = declaration.databases.bcb_webapp_dev;

const CURRENT_MATERIALIZATION_ROOTS = [
  'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)',
  'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)',
  'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)',
];

test('current reminder materialization roots have one owner and no PUBLIC execution', () => {
  for (const signature of CURRENT_MATERIALIZATION_ROOTS) {
    const fn = functions[signature];
    assert(fn, `missing declaration: ${signature}`);
    assert.equal(fn.owner, 'app_seam_reminder_materialization_owner');
    assert.equal(fn.security, 'DEFINER');
    assert.deepEqual(fn.execute, ['app_tenant_service']);
    assert(!fn.execute.includes('PUBLIC'));
  }
});

test('runtime roles cannot bypass materialization writes or the queue root', () => {
  const occurrence = database.tables['integrator.user_reminder_occurrences']?.grants ?? {};
  assert.deepEqual(occurrence.app_staff?.privs ?? [], ['SELECT']);
  assert.deepEqual(occurrence.app_tenant_service?.privs ?? [], [
    { kind: 'columns', priv: 'SELECT', columns: ['rule_id', 'status'] },
    'DELETE',
  ]);
  assert.deepEqual(occurrence.app_patient?.privs ?? [], []);
  assert.deepEqual(occurrence.PUBLIC?.privs ?? [], []);

  const queue = database.tables['public.outgoing_delivery_queue']?.grants ?? {};
  for (const role of ['app_staff', 'app_tenant_service', 'app_patient', 'PUBLIC']) {
    assert.deepEqual(queue[role]?.privs ?? [], [], `${role} must not have a direct queue grant`);
  }
});
