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

// The live 42501 of 17.08 was "permission denied for table user_reminder_occurrences" raised inside
// the snapshot root: its body read the whole occurrence row while the seam owner holds only the
// narrow per-column grants declared below. The tempting repair is to widen this surface until the
// error goes away, which hands the reminder seam the delivery-outcome columns it never reads.
// Delivery outcome belongs to the delivery seams, not to materialization. The proof that the
// narrowed bodies actually work is the named DEV base itself: after migration 0020 the wake route
// answers 200 on the live scheduler ticks.
const DELIVERY_OUTCOME_COLUMNS = ['sent_at', 'failed_at', 'delivery_channel', 'delivery_job_id', 'error_code'];

test('materialization seam never reads occurrence delivery outcome and never takes the whole table', () => {
  for (const signature of CURRENT_MATERIALIZATION_ROOTS) {
    const surface = (functions[signature].relationSurfaces ?? [])
      .find((entry) => entry.relation === 'integrator.user_reminder_occurrences');
    if (!surface) continue;
    assert(
      Array.isArray(surface.columns) && surface.columns.length > 0,
      `${signature} must keep a column-narrowed occurrence surface, not a table-wide one`,
    );
    for (const column of DELIVERY_OUTCOME_COLUMNS) {
      assert(
        !surface.columns.includes(column),
        `${signature} must not read occurrence delivery outcome column ${column}`,
      );
    }
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
