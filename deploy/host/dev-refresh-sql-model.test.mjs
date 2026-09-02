import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { main } from './dev-refresh-sql-model.mjs';

/**
 * The refresh suite trusts this model to decide whether the real capture/restore SQL did its job.
 * An oracle nobody checks is not an oracle, so these tests pin the behaviours the verdicts rest on:
 * rows really change, constraints really fire, a failed transaction really rolls back, and SQL the
 * model does not understand is a loud failure rather than a silent pass.
 */

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ABSENT_ORG = '00000000-0000-4000-8000-0000000000b2';

function newState() {
  return {
    events: [],
    databases: {
      postgres: { connectionLimit: -1, allowConnections: true, owner: 'postgres', objects: [], tables: {} },
      bcb_webapp_dev: {
        connectionLimit: -1,
        allowConnections: true,
        owner: 'postgres',
        objects: ['public.system_settings.system_settings_test_lock'],
        tables: {
          'public.system_settings': {
            columns: [
              { name: 'key', type: 'text', notNull: true },
              { name: 'organization_id', type: 'uuid' },
              { name: 'value_json', type: 'jsonb', notNull: true },
            ],
            foreignKeys: [{
              name: 'system_settings_organization_id_fkey',
              column: 'organization_id',
              references: 'public.be_organizations',
              referencedColumn: 'id',
            }],
            rows: [
              { key: 'kept', organization_id: null, value_json: '{"value":"one"}' },
              { key: 'dropped', organization_id: null, value_json: '{"value":"two"}' },
            ],
          },
          'public.be_organizations': {
            columns: [{ name: 'id', type: 'uuid', notNull: true }],
            rows: [{ id: ORG }],
          },
        },
      },
    },
  };
}

function run(script, { database = 'bcb_webapp_dev', variables = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-sql-model-'));
  const statePath = join(root, 'cluster.json');
  writeFileSync(statePath, JSON.stringify(newState()));
  const scriptPath = join(root, 'script.sql');
  writeFileSync(scriptPath, script);
  let stderr = '';
  const argv = ['psql', '-d', database, '-c', script];
  for (const [name, value] of Object.entries(variables)) argv.push('-v', `${name}=${value}`);
  const status = main(argv, { BCB_REFRESH_MODEL_STATE: statePath }, {
    stdout: () => {},
    stderr: (text) => { stderr += text; },
  });
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  return { status, stderr, state, root };
}

function settings(state) {
  return state.databases.bcb_webapp_dev.tables['public.system_settings'].rows;
}

test('a DELETE with a real predicate removes exactly the matching rows', () => {
  const { status, state } = run("DELETE FROM public.system_settings WHERE key = 'dropped';");
  assert.equal(status, 0);
  assert.deepEqual(settings(state).map((row) => row.key), ['kept']);
});

test('an INSERT that violates the organization foreign key fails the script', () => {
  const { status, stderr } = run(
    `INSERT INTO public.system_settings (key, organization_id, value_json)
     SELECT 'orphan', '${ABSENT_ORG}', '{"value":"x"}';`,
  );
  assert.notEqual(status, 0);
  assert.match(stderr, /violates foreign key constraint "system_settings_organization_id_fkey"/u);
});

test('an INSERT for an organization that exists is accepted', () => {
  const { status, state } = run(
    `INSERT INTO public.system_settings (key, organization_id, value_json)
     SELECT 'per-org', '${ORG}', '{"value":"x"}';`,
  );
  assert.equal(status, 0);
  assert.equal(settings(state).length, 3);
});

test('a failure inside a transaction rolls the whole transaction back', () => {
  const { status, state } = run(
    `BEGIN;
     DELETE FROM public.system_settings WHERE key = 'kept';
     INSERT INTO public.system_settings (key, organization_id, value_json)
     SELECT 'orphan', '${ABSENT_ORG}', '{"value":"x"}';
     COMMIT;`,
  );
  assert.notEqual(status, 0);
  assert.deepEqual(settings(state).map((row) => row.key), ['kept', 'dropped']);
});

test('the division-by-zero assertion idiom the SQL uses really fails', () => {
  const green = run("SELECT 1 / (count(*) > 0)::int AS not_empty FROM public.system_settings;");
  assert.equal(green.status, 0);
  const red = run("SELECT 1 / (count(*) > 5)::int AS not_empty FROM public.system_settings;");
  assert.notEqual(red.status, 0);
  assert.match(red.stderr, /division by zero/u);
});

test('correlated NOT EXISTS is evaluated against rows, not assumed true', () => {
  const satisfied = run(`SELECT 1 / (NOT EXISTS (
    SELECT 1 FROM public.system_settings AS s WHERE s.key = 'absent'
  ))::int AS none;`);
  assert.equal(satisfied.status, 0);
  const violated = run(`SELECT 1 / (NOT EXISTS (
    SELECT 1 FROM public.system_settings AS s WHERE s.key = 'kept'
  ))::int AS none;`);
  assert.notEqual(violated.status, 0);
});

test('DROP TRIGGER removes the object the wrapper then probes for', () => {
  const { status, state } = run('DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;');
  assert.equal(status, 0);
  assert.deepEqual(state.databases.bcb_webapp_dev.objects, []);
});

test('SQL the model does not understand is a loud failure, never a silent pass', () => {
  const { status, stderr } = run("UPDATE public.system_settings SET key = 'silent';");
  assert.notEqual(status, 0, 'an unmodelled statement was treated as a successful no-op');
  assert.match(stderr, /unsupported statement/u);
});

test('a script that quits early executes nothing after the quit', () => {
  const { status, state } = run("\\quit 0\nDELETE FROM public.system_settings;");
  assert.equal(status, 0);
  assert.equal(settings(state).length, 2, 'statements after \\quit were executed');
});
