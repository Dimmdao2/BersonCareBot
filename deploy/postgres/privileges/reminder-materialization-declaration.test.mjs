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

test('materialization seam keeps column-narrowed access to the canonical occurrence table', () => {
  for (const signature of CURRENT_MATERIALIZATION_ROOTS) {
    const surface = (functions[signature].relationSurfaces ?? [])
      .find((entry) => entry.relation === 'public.reminder_occurrence_history');
    if (!surface) continue;
    assert(
      Array.isArray(surface.columns) && surface.columns.length > 0,
      `${signature} must keep a column-narrowed occurrence surface, not a table-wide one`,
    );
  }
});

test('runtime roles cannot bypass materialization writes or the queue root', () => {
  const occurrence = database.tables['public.reminder_occurrence_history']?.grants ?? {};
  assert.deepEqual(occurrence.app_tenant_service?.privs ?? [], []);
  assert.deepEqual(occurrence.app_patient?.privs ?? [], ['SELECT']);
  assert.deepEqual(occurrence.PUBLIC?.privs ?? [], []);

  const queue = database.tables['public.outgoing_delivery_queue']?.grants ?? {};
  for (const role of ['app_staff', 'app_tenant_service', 'app_patient', 'PUBLIC']) {
    assert.deepEqual(queue[role]?.privs ?? [], [], `${role} must not have a direct queue grant`);
  }
});
