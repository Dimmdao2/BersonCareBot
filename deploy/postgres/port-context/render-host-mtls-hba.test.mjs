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
  'integrator-login': 'bcb_dev_integrator',
  'secondary-database': 'bersoncarebot_test',
  'secondary-staff-login': 'bcb_test_webapp_staff',
  'secondary-patient-login': 'bcb_test_webapp_patient',
  'secondary-integrator-login': 'bcb_test_integrator',
};
const singleArgs = {
  database: 'bcb_host_test',
  'staff-login': 'bcb_test_webapp_staff',
  'patient-login': 'bcb_test_webapp_patient',
  'integrator-login': 'bcb_test_integrator',
};
const rendered = renderHba(args);
assert.match(rendered, /hostssl bcb_webapp_dev bcb_dev_webapp_staff 0\.0\.0\.0\/0 scram-sha-256 clientcert=verify-full clientname=CN/);
assert.match(rendered, /hostssl bersoncarebot_test bcb_test_webapp_staff 0\.0\.0\.0\/0 scram-sha-256 clientcert=verify-full clientname=CN/);
assert.match(rendered, /hostssl bcb_webapp_dev bcb_test_webapp_staff 0\.0\.0\.0\/0 reject/);
assert.match(rendered, /hostssl bersoncarebot_test bcb_dev_webapp_staff 0\.0\.0\.0\/0 reject/);
assert.ok(rendered.indexOf('hostssl bcb_webapp_dev bcb_test_webapp_staff 0.0.0.0/0 reject') < rendered.indexOf('hostssl bcb_webapp_dev bcb_dev_webapp_staff 0.0.0.0/0 scram-sha-256'));
assert.ok(rendered.indexOf('hostssl bersoncarebot_test bcb_dev_webapp_staff 0.0.0.0/0 reject') < rendered.indexOf('hostssl bersoncarebot_test bcb_test_webapp_staff 0.0.0.0/0 scram-sha-256'));
assert.match(rendered, /hostssl all bcb_dev_webapp_staff,bcb_dev_webapp_patient,bcb_dev_integrator,bcb_test_webapp_staff,bcb_test_webapp_patient,bcb_test_integrator 0\.0\.0\.0\/0 reject/);
assert.ok(rendered.indexOf('hostssl all bcb_dev_webapp_staff') > rendered.indexOf('hostssl bersoncarebot_test bcb_test_integrator ::0/0 scram-sha-256'));
assert.equal((rendered.match(/# BEGIN BCB MANAGED MTLS HBA/g) ?? []).length, 1);
assert.doesNotMatch(rendered, /map=/);
assert.equal(validateManagedHba(`${rendered}local all postgres peer\nhost all all 127.0.0.1/32 scram-sha-256\n`, args), true);
assert.throws(() => validateManagedHba(`${rendered}hostssl bcb_webapp_dev bcb_dev_webapp_staff 127.0.0.1/32 trust\n`, args), /reachable outside/);
assert.throws(() => validateManagedHba(`${rendered}hostssl bersoncarebot_test bcb_test_integrator 127.0.0.1/32 trust\n`, args), /reachable outside/);
assert.throws(() => validateManagedHba(`${rendered}hostssl all all 127.0.0.1/32 trust\n`, args), /special database\/login form/);
assert.throws(() => validateManagedHba(`${rendered}${rendered}`, args), /duplicate or nested/);
assert.throws(() => validateManagedHba(`${rendered}# END BCB MANAGED MTLS HBA\n`, args), /end marker without begin/);
assert.throws(() => validateManagedHba(`${rendered}# BEGIN BCB MANAGED MTLS HBA\n`, args), /duplicate or nested/);
assert.throws(() => validateManagedHba(rendered.replace('# END BCB MANAGED MTLS HBA', '# BEGIN BCB MANAGED MTLS HBA\n# END BCB MANAGED MTLS HBA'), args));
for (const specialIdentifier of ['all', 'sameuser', 'samerole', 'replication']) {
  assert.throws(() => renderHba({ ...singleArgs, database: specialIdentifier }), /special identifier/);
  assert.throws(() => renderHba({ ...args, 'staff-login': specialIdentifier }), /special identifier/);
}
assert.throws(() => validateManagedHba(rendered.replace('clientname=CN', 'map=wrong'), args), /differs/);
assert.throws(() => renderHba({ ...args, 'patient-login': args['staff-login'] }), /distinct/);
assert.throws(() => renderHba({ ...args, 'secondary-database': args.database }), /databases must be distinct/);
assert.throws(() => renderHba({ ...args, 'secondary-staff-login': args['staff-login'] }), /globally distinct/);
assert.throws(() => renderHba({ ...singleArgs, 'secondary-database': 'bersoncarebot_test' }), /requires secondary database/);
assert.match(renderHba(singleArgs), /hostssl bcb_host_test bcb_test_webapp_staff/);

const directory = mkdtempSync(join(tmpdir(), 'bcb-hba-render-'));
try {
  const input = join(directory, 'pg_hba.conf');
  writeFileSync(input, `${rendered}host all all 0.0.0.0/0 reject\n`);
  // The CLI merge path is covered by the disposable PG16 host acceptance.
  validateManagedHba(readFileSync(input, 'utf8'), args);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
process.stdout.write('render-host-mtls-hba: PASS\n');
