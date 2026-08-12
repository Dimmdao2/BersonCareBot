#!/usr/bin/env node
/** Root-owned live readiness probe for one exact DEV or TEST HBA target. */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fixedFiles = {
  devApi: '/home/dev/dev-projects/BersonCareBot/.env',
  devWebapp: '/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev',
  testApi: '/opt/env/bersoncarebot/api.test',
  testWebapp: '/opt/env/bersoncarebot/webapp.test',
};
const databaseByEnvironment = { dev: 'bcb_webapp_dev', test: 'bersoncarebot_test' };
const accounts = {
  dev: { staff: 'dev', patient: 'dev', globalAdmin: 'dev', integrator: 'dev' },
  test: {
    staff: 'bcb-web-test',
    patient: 'bcb-web-test',
    globalAdmin: 'bcb-web-test',
    integrator: 'bcb-api-test',
  },
};
const logins = {
  dev: {
    staff: 'bcb_dev_webapp_staff',
    patient: 'bcb_dev_webapp_patient',
    globalAdmin: 'bcb_dev_webapp_global_admin',
    integrator: 'bcb_dev_integrator',
  },
  test: {
    staff: 'bcb_test_webapp_staff',
    patient: 'bcb_test_webapp_patient',
    globalAdmin: 'bcb_test_webapp_global_admin',
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

function loadEnvironmentRecords(environment) {
  const api = parseEnv(fixedFiles[`${environment}Api`]);
  const webapp = parseEnv(fixedFiles[`${environment}Webapp`]);
  for (const [label, values] of [
    [`${environment.toUpperCase()} integrator`, api],
    [`${environment.toUpperCase()} webapp`, webapp],
  ]) {
    if (values.get('DB_PRINCIPAL_CONTEXT_MODE') !== 'port-context') {
      fail(`${label} is not in port-context mode`);
    }
  }
  return [
    record({ environment, kind: 'staff', values: webapp, urlKey: 'DATABASE_URL_STAFF', certKey: 'WEBAPP_DB_STAFF_CERT_FILE', keyKey: 'WEBAPP_DB_STAFF_KEY_FILE', account: accounts[environment].staff }),
    record({ environment, kind: 'patient', values: webapp, urlKey: 'DATABASE_URL_PATIENT', certKey: 'WEBAPP_DB_PATIENT_CERT_FILE', keyKey: 'WEBAPP_DB_PATIENT_KEY_FILE', account: accounts[environment].patient }),
    record({ environment, kind: 'globalAdmin', values: webapp, urlKey: 'DATABASE_URL_GLOBAL_ADMIN', certKey: 'WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE', keyKey: 'WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE', account: accounts[environment].globalAdmin }),
    record({ environment, kind: 'integrator', values: api, urlKey: 'INTEGRATOR_DB_URL', certKey: 'INTEGRATOR_DB_TLS_CERT_FILE', keyKey: 'INTEGRATOR_DB_TLS_KEY_FILE', account: accounts[environment].integrator }),
  ];
}

function environmentFor(database, quartet) {
  for (const environment of ['dev', 'test']) {
    if (
      database === databaseByEnvironment[environment]
      && quartet.staff === logins[environment].staff
      && quartet.patient === logins[environment].patient
      && quartet.globalAdmin === logins[environment].globalAdmin
      && quartet.integrator === logins[environment].integrator
    ) return environment;
  }
  fail('database/login quartet is not an exact declared DEV or TEST target');
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

const [mode, targetDatabase, targetStaff, targetPatient, targetGlobalAdmin, targetIntegrator, foreignStaff, foreignPatient, foreignGlobalAdmin, foreignIntegrator] = process.argv.slice(2);
if (mode === '--validate') {
  const selection = targetDatabase;
  if (!['dev', 'test', 'all'].includes(selection)) fail('--validate requires dev, test, or all');
  const records = (selection === 'all' ? ['dev', 'test'] : [selection]).flatMap(loadEnvironmentRecords);
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
if (!mode || !targetDatabase || !targetStaff || !targetPatient || !targetGlobalAdmin || !targetIntegrator) fail('incomplete probe arguments');
const targetNames = {
  staff: targetStaff,
  patient: targetPatient,
  globalAdmin: targetGlobalAdmin,
  integrator: targetIntegrator,
};
const targetEnvironment = environmentFor(targetDatabase, targetNames);
const foreignValues = [foreignStaff, foreignPatient, foreignGlobalAdmin, foreignIntegrator];
const foreignCount = foreignValues.filter(Boolean).length;
if (foreignCount !== 0 && foreignCount !== 4) fail('foreign environment requires all four login names');
const foreignEnvironment = foreignCount === 4
  ? environmentFor(databaseByEnvironment[targetEnvironment === 'dev' ? 'test' : 'dev'], {
      staff: foreignStaff,
      patient: foreignPatient,
      globalAdmin: foreignGlobalAdmin,
      integrator: foreignIntegrator,
    })
  : undefined;
if (foreignEnvironment === targetEnvironment) fail('foreign login quartet must belong to the other environment');
const records = [
  ...loadEnvironmentRecords(targetEnvironment),
  ...(foreignEnvironment ? loadEnvironmentRecords(foreignEnvironment) : []),
];
const byLogin = new Map(records.map((value) => [value.login, value]));
const targetRecords = {
  staff: byLogin.get(targetStaff),
  patient: byLogin.get(targetPatient),
  globalAdmin: byLogin.get(targetGlobalAdmin),
  integrator: byLogin.get(targetIntegrator),
};
if (Object.values(targetRecords).some((value) => !value)) fail('undeclared target login');
if (new Set(Object.values(targetRecords).map(({ database }) => database)).size !== 1 || targetRecords.staff.database !== targetDatabase) {
  fail('target database/login quartet mismatch');
}

let success;
switch (mode) {
  case 'positive-staff': success = connect(targetRecords.staff, targetDatabase); break;
  case 'positive-patient': success = connect(targetRecords.patient, targetDatabase); break;
  case 'positive-global-admin': success = connect(targetRecords.globalAdmin, targetDatabase); break;
  case 'positive-integrator': success = connect(targetRecords.integrator, targetDatabase); break;
  case 'password-only': success = connect(targetRecords.staff, targetDatabase, { noClientCertificate: true }); break;
  case 'wrong-cn': success = connect(targetRecords.staff, targetDatabase, { cert: targetRecords.patient.cert, key: targetRecords.patient.key }); break;
  case 'non-tls': success = connect(targetRecords.staff, targetDatabase, { sslmode: 'disable', noClientCertificate: true }); break;
  case 'socket': success = connect(targetRecords.staff, targetDatabase, { socket: true, sslmode: 'disable', noClientCertificate: true }); break;
  case 'server-impersonation': success = connect(targetRecords.staff, targetDatabase, { ca: '/etc/ssl/certs/ca-certificates.crt' }); break;
  case 'cross-environment-staff': if (!foreignEnvironment) fail('cross-environment probe lacks foreign quartet'); success = connect(byLogin.get(foreignStaff), targetDatabase); break;
  case 'cross-environment-patient': if (!foreignEnvironment) fail('cross-environment probe lacks foreign quartet'); success = connect(byLogin.get(foreignPatient), targetDatabase); break;
  case 'cross-environment-global-admin': if (!foreignEnvironment) fail('cross-environment probe lacks foreign quartet'); success = connect(byLogin.get(foreignGlobalAdmin), targetDatabase); break;
  case 'cross-environment-integrator': if (!foreignEnvironment) fail('cross-environment probe lacks foreign quartet'); success = connect(byLogin.get(foreignIntegrator), targetDatabase); break;
  default: fail(`unknown mode ${mode}`);
}
process.exit(success ? 0 : 1);
