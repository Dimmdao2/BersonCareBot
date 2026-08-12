#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHba, validateManagedHba } from './render-host-mtls-hba.mjs';

const args = {
  database: 'bcb_host_test',
  'staff-login': 'bcb_test_webapp_staff',
  'patient-login': 'bcb_test_webapp_patient',
  'integrator-login': 'bcb_test_integrator',
};
const rendered = renderHba(args);
assert.match(rendered, /hostssl bcb_host_test bcb_test_webapp_staff 0\.0\.0\.0\/0 scram-sha-256 clientcert=verify-full clientname=CN/);
assert.doesNotMatch(rendered, /map=/);
assert.equal(validateManagedHba(`${rendered}local all postgres peer\nhost all all 127.0.0.1\/32 scram-sha-256\n`, args), true);
assert.throws(() => validateManagedHba(`${rendered}hostssl bcb_host_test bcb_test_webapp_staff 127.0.0.1\/32 trust\n`, args), /reachable outside/);
assert.throws(() => validateManagedHba(rendered.replace('clientname=CN', 'map=wrong'), args), /differs/);
assert.throws(() => renderHba({ ...args, 'patient-login': args['staff-login'] }), /distinct/);

const directory = mkdtempSync(join(tmpdir(), 'bcb-hba-render-'));
try {
  const input = join(directory, 'pg_hba.conf');
  writeFileSync(input, `${rendered}host all all 0.0.0.0/0 reject\n`);
  const output = join(directory, 'out.conf');
  // The CLI merge path is covered by the disposable PG16 host acceptance.
  validateManagedHba(readFileSync(input, 'utf8'), args);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
process.stdout.write('render-host-mtls-hba: PASS\n');
