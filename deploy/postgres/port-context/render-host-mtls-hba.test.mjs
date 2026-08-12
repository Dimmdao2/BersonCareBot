#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHba, validateManagedHba } from './render-host-mtls-hba.mjs';

const args = {
  database: 'bcb_webapp_dev',
  'staff-login': 'bcb_dev_webapp_staff',
  'patient-login': 'bcb_dev_webapp_patient',
  'global-admin-login': 'bcb_dev_webapp_global_admin',
  'integrator-login': 'bcb_dev_integrator',
};
const testArgs = {
  database: 'bersoncarebot_test',
  'staff-login': 'bcb_test_webapp_staff',
  'patient-login': 'bcb_test_webapp_patient',
  'global-admin-login': 'bcb_test_webapp_global_admin',
  'integrator-login': 'bcb_test_integrator',
};

const rendered = renderHba(args);
assert.match(rendered, /# BEGIN BCB MANAGED MTLS HBA bcb_webapp_dev/);
for (const login of [
  'bcb_dev_webapp_staff',
  'bcb_dev_webapp_patient',
  'bcb_dev_webapp_global_admin',
  'bcb_dev_integrator',
]) {
  assert.match(rendered, new RegExp(`hostssl bcb_webapp_dev ${login} 0\\.0\\.0\\.0/0 scram-sha-256 clientcert=verify-full clientname=CN`));
}
assert.equal((rendered.match(/hostssl bcb_webapp_dev .*clientname=CN/g) ?? []).length, 8);
assert.doesNotMatch(rendered, /bersoncarebot_test|secondary/);
assert.doesNotMatch(rendered, /map=/);
assert.equal(validateManagedHba(`${rendered}local all postgres peer\nhost all all 127.0.0.1/32 scram-sha-256\n`, args), true);
assert.throws(() => validateManagedHba(`${rendered}hostssl bcb_webapp_dev bcb_dev_webapp_global_admin 127.0.0.1/32 trust\n`, args), /reachable outside/);
assert.throws(() => validateManagedHba(`${rendered}hostssl all all 127.0.0.1/32 trust\n`, args), /special database\/login form/);
assert.throws(() => validateManagedHba(`${rendered}${rendered}`, args), /duplicate or nested/);
assert.throws(() => validateManagedHba(rendered.replace('clientname=CN', 'map=wrong'), args), /differs/);
assert.throws(() => renderHba({ ...args, 'global-admin-login': args['staff-login'] }), /distinct/);
for (const key of ['database', 'staff-login', 'patient-login', 'global-admin-login', 'integrator-login']) {
  assert.throws(() => renderHba({ ...args, [key]: 'all' }), /special identifier/);
}

const adjacentTarget = renderHba(testArgs);
const combined = `${adjacentTarget}${rendered}host all all 0.0.0.0/0 reject\n`;
assert.equal(validateManagedHba(combined, args), true);
assert.equal(validateManagedHba(combined, testArgs), true);

const sharedArgs = {
  ...args,
  'secondary-database': testArgs.database,
  'secondary-staff-login': testArgs['staff-login'],
  'secondary-patient-login': testArgs['patient-login'],
  'secondary-global-admin-login': testArgs['global-admin-login'],
  'secondary-integrator-login': testArgs['integrator-login'],
};
assert.equal(renderHba(sharedArgs), `${rendered}${adjacentTarget}`);
assert.equal(validateManagedHba(`${renderHba(sharedArgs)}host all all 0.0.0.0/0 reject\n`, sharedArgs), true);
assert.throws(
  () => renderHba({ ...args, 'secondary-database': testArgs.database }),
  /secondary target requires/,
);
assert.throws(
  () => renderHba({ ...sharedArgs, 'secondary-database': args.database }),
  /must be distinct/,
);

const directory = mkdtempSync(join(tmpdir(), 'bcb-hba-render-'));
try {
  const input = join(directory, 'pg_hba.conf');
  writeFileSync(input, combined);
  validateManagedHba(readFileSync(input, 'utf8'), args);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
process.stdout.write('render-host-mtls-hba: PASS\n');
