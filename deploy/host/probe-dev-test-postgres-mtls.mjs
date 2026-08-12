#!/usr/bin/env node
/** Root-owned live readiness probe for the exact shared DEV+TEST HBA block. */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fixedFiles = {
  devApi: '/home/dev/dev-projects/BersonCareBot/.env',
  devWebapp: '/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev',
  testApi: '/opt/env/bersoncarebot/api.test',
  testWebapp: '/opt/env/bersoncarebot/webapp.test',
};
const databaseByEnvironment = { dev: 'bcb_webapp_dev', test: 'bersoncarebot_test' };
const logins = {
  dev: {
    staff: 'bcb_dev_webapp_staff',
    patient: 'bcb_dev_webapp_patient',
    integrator: 'bcb_dev_integrator',
  },
  test: {
    staff: 'bcb_test_webapp_staff',
    patient: 'bcb_test_webapp_patient',
    integrator: 'bcb_test_integrator',
  },
};

function fail(message) {
  process.stderr.write(`port-context host probe: ${message}\n`);
  process.exit(64);
}

function parseEnv(path) {
  const result = new Map();
  for (const [index, line] of readFileSync(path, 'utf8').split(/\r?\n/u).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) fail(`${path}:${index + 1}: unsupported env syntax`);
    if (result.has(match[1])) fail(`${path}:${index + 1}: duplicate key ${match[1]}`);
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replaceAll(`'"'"'`, "'");
    }
    result.set(match[1], value);
  }
  return result;
}

function required(values, key, label) {
  const value = values.get(key);
  if (!value) fail(`${label} is missing ${key}`);
  return value;
}

function identity(name) {
  return {
    uid: Number(execFileSync('/usr/bin/id', ['-u', name], { encoding: 'utf8' }).trim()),
    gid: Number(execFileSync('/usr/bin/id', ['-g', name], { encoding: 'utf8' }).trim()),
  };
}

function record({ environment, kind, values, urlKey, certKey, keyKey, account }) {
  const login = logins[environment][kind];
  const rawUrl = required(values, urlKey, `${environment}/${kind}`);
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname).replace(/^\//u, '');
  if (
    decodeURIComponent(url.username) !== login ||
    !url.password ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5432' ||
    database !== databaseByEnvironment[environment]
  ) {
    fail(`${environment}/${kind} URL is not the exact declared endpoint`);
  }
  for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    if (url.searchParams.has(parameter)) fail(`${environment}/${kind} URL overrides ${parameter}`);
  }
  return {
    environment,
    kind,
    database,
    login,
    password: decodeURIComponent(url.password),
    ca: required(values, kind === 'integrator' ? 'INTEGRATOR_DB_TLS_CA_FILE' : 'WEBAPP_DB_TLS_CA_FILE', `${environment}/${kind}`),
    cert: required(values, certKey, `${environment}/${kind}`),
    key: required(values, keyKey, `${environment}/${kind}`),
    ...identity(account),
  };
}

const devApi = parseEnv(fixedFiles.devApi);
const devWebapp = parseEnv(fixedFiles.devWebapp);
const testApi = parseEnv(fixedFiles.testApi);
const testWebapp = parseEnv(fixedFiles.testWebapp);
for (const [label, values] of [
  ['DEV integrator', devApi],
  ['DEV webapp', devWebapp],
  ['TEST integrator', testApi],
  ['TEST webapp', testWebapp],
]) {
  if (values.get('DB_PRINCIPAL_CONTEXT_MODE') !== 'port-context') {
    fail(`${label} is not in port-context mode`);
  }
}
const records = [
  record({ environment: 'dev', kind: 'staff', values: devWebapp, urlKey: 'DATABASE_URL_STAFF', certKey: 'WEBAPP_DB_STAFF_CERT_FILE', keyKey: 'WEBAPP_DB_STAFF_KEY_FILE', account: 'dev' }),
  record({ environment: 'dev', kind: 'patient', values: devWebapp, urlKey: 'DATABASE_URL_PATIENT', certKey: 'WEBAPP_DB_PATIENT_CERT_FILE', keyKey: 'WEBAPP_DB_PATIENT_KEY_FILE', account: 'dev' }),
  record({ environment: 'dev', kind: 'integrator', values: devApi, urlKey: 'INTEGRATOR_DB_URL', certKey: 'INTEGRATOR_DB_TLS_CERT_FILE', keyKey: 'INTEGRATOR_DB_TLS_KEY_FILE', account: 'dev' }),
  record({ environment: 'test', kind: 'staff', values: testWebapp, urlKey: 'DATABASE_URL_STAFF', certKey: 'WEBAPP_DB_STAFF_CERT_FILE', keyKey: 'WEBAPP_DB_STAFF_KEY_FILE', account: 'bcb-web-test' }),
  record({ environment: 'test', kind: 'patient', values: testWebapp, urlKey: 'DATABASE_URL_PATIENT', certKey: 'WEBAPP_DB_PATIENT_CERT_FILE', keyKey: 'WEBAPP_DB_PATIENT_KEY_FILE', account: 'bcb-web-test' }),
  record({ environment: 'test', kind: 'integrator', values: testApi, urlKey: 'INTEGRATOR_DB_URL', certKey: 'INTEGRATOR_DB_TLS_CERT_FILE', keyKey: 'INTEGRATOR_DB_TLS_KEY_FILE', account: 'bcb-api-test' }),
];
const byLogin = new Map(records.map((value) => [value.login, value]));

function runInstaller() {
  if (process.getuid() !== 0) fail('--run-installer requires root');
  const postgres = identity('postgres');
  const passwordByLogin = Object.fromEntries(records.map((value) => [value.login, value.password]));
  const result = spawnSync(
    '/usr/bin/setpriv',
    [
      '--reuid', String(postgres.uid),
      '--regid', String(postgres.gid),
      '--clear-groups',
      '--',
      '/usr/bin/node',
      '--experimental-strip-types',
      '/opt/projects/bersoncarebot-test/deploy/postgres/privileges/install-dev-test-shared-cluster.mjs',
      '--admin-socket', '/var/run/postgresql',
      '--admin-port', '5432',
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        LANG: 'C',
        BCB_DEV_WEBAPP_STAFF_PASSWORD: passwordByLogin.bcb_dev_webapp_staff,
        BCB_DEV_WEBAPP_PATIENT_PASSWORD: passwordByLogin.bcb_dev_webapp_patient,
        BCB_DEV_INTEGRATOR_PASSWORD: passwordByLogin.bcb_dev_integrator,
        BCB_TEST_WEBAPP_STAFF_PASSWORD: passwordByLogin.bcb_test_webapp_staff,
        BCB_TEST_WEBAPP_PATIENT_PASSWORD: passwordByLogin.bcb_test_webapp_patient,
        BCB_TEST_INTEGRATOR_PASSWORD: passwordByLogin.bcb_test_integrator,
      },
      stdio: 'inherit',
    },
  );
  process.exit(result.status ?? 1);
}

function connect(selected, database, overrides = {}) {
  const env = {
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    PGPASSWORD: selected.password,
    PGSSLMODE: overrides.sslmode ?? 'verify-full',
    PGSSLROOTCERT: overrides.ca ?? selected.ca,
    ...(overrides.noClientCertificate ? {} : {
      PGSSLCERT: overrides.cert ?? selected.cert,
      PGSSLKEY: overrides.key ?? selected.key,
    }),
  };
  const host = overrides.socket ? '/var/run/postgresql' : '127.0.0.1';
  const result = spawnSync(
    '/usr/bin/setpriv',
    [
      '--reuid', String(selected.uid),
      '--regid', String(selected.gid),
      '--clear-groups',
      '--',
      '/usr/bin/psql',
      '-X',
      '-h', host,
      '-p', '5432',
      '-U', selected.login,
      '-d', database,
      '-Atqc', 'SELECT 1',
    ],
    { env, stdio: 'ignore' },
  );
  return result.status === 0;
}

const [mode, targetDatabase, targetStaff, targetPatient, targetIntegrator, foreignStaff, foreignPatient, foreignIntegrator] = process.argv.slice(2);
if (mode === '--validate') {
  for (const selected of records) {
    for (const path of [selected.ca, selected.cert, selected.key]) {
      const result = spawnSync('/usr/bin/setpriv', [
        '--reuid', String(selected.uid),
        '--regid', String(selected.gid),
        '--clear-groups',
        '--',
        '/usr/bin/test', '-r', path,
      ], { stdio: 'ignore' });
      if (result.status !== 0) fail(`${selected.environment}/${selected.kind} cannot read declared TLS material`);
    }
  }
  process.exit(0);
}
if (mode === '--run-installer') runInstaller();
if (!mode || !targetDatabase || !targetStaff || !targetPatient || !targetIntegrator) fail('incomplete probe arguments');
const targetRecords = {
  staff: byLogin.get(targetStaff),
  patient: byLogin.get(targetPatient),
  integrator: byLogin.get(targetIntegrator),
};
if (Object.values(targetRecords).some((value) => !value)) fail('undeclared target login');
if (new Set(Object.values(targetRecords).map(({ database }) => database)).size !== 1 || targetRecords.staff.database !== targetDatabase) {
  fail('target database/login triplet mismatch');
}

let success;
switch (mode) {
  case 'positive-staff': success = connect(targetRecords.staff, targetDatabase); break;
  case 'positive-patient': success = connect(targetRecords.patient, targetDatabase); break;
  case 'positive-integrator': success = connect(targetRecords.integrator, targetDatabase); break;
  case 'password-only': success = connect(targetRecords.staff, targetDatabase, { noClientCertificate: true }); break;
  case 'wrong-cn': success = connect(targetRecords.staff, targetDatabase, { cert: targetRecords.patient.cert, key: targetRecords.patient.key }); break;
  case 'non-tls': success = connect(targetRecords.staff, targetDatabase, { sslmode: 'disable', noClientCertificate: true }); break;
  case 'socket': success = connect(targetRecords.staff, targetDatabase, { socket: true, sslmode: 'disable', noClientCertificate: true }); break;
  case 'server-impersonation': success = connect(targetRecords.staff, targetDatabase, { ca: '/etc/ssl/certs/ca-certificates.crt' }); break;
  case 'cross-environment-staff': success = connect(byLogin.get(foreignStaff), targetDatabase); break;
  case 'cross-environment-patient': success = connect(byLogin.get(foreignPatient), targetDatabase); break;
  case 'cross-environment-integrator': success = connect(byLogin.get(foreignIntegrator), targetDatabase); break;
  default: fail(`unknown mode ${mode}`);
}
process.exit(success ? 0 : 1);
