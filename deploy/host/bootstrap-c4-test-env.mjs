#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  chownSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { declaration } from '../postgres/privileges/declaration.ts';
import { renderPortContextRuntimeEnv } from '../postgres/privileges/generate.mjs';

const TEST_PATHS = {
  api: '/opt/env/bersoncarebot/api.test',
  webapp: '/opt/env/bersoncarebot/webapp.test',
  media: '/opt/env/bersoncarebot/media-worker.test',
};
const DEV_PATHS = {
  api: '/home/dev/dev-projects/BersonCareBot/.env',
  webapp: '/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev',
};

const OPERATIONAL_KEYS = [
  ['DATABASE_URL_DIAGNOSTIC', 'bcb_test_operational_diagnostic_login'],
  ['DATABASE_URL_DELIVERY_WORKER', 'bcb_test_operational_delivery_login'],
  ['DATABASE_URL_SCHEDULER', 'bcb_test_operational_scheduler_login'],
];
const MEDIA_COPY_KEYS = [
  'LOG_LEVEL',
  'FFMPEG_PATH',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_PRIVATE_BUCKET',
  'S3_REGION',
  'S3_FORCE_PATH_STYLE',
];
const MEDIA_REQUIRED_KEYS = [
  'MEDIA_WORKER_CONTROL_URL',
  'INTERNAL_JOB_SECRET',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_PRIVATE_BUCKET',
];
const TEST_PORT_CONTEXT = {
  api: renderPortContextRuntimeEnv(declaration, 'test', 'bersoncarebot_test', 'integrator'),
  webapp: renderPortContextRuntimeEnv(declaration, 'test', 'bersoncarebot_test', 'webapp'),
};
const TEST_PORT_CONTEXT_LOGINS = {
  integrator: 'bcb_test_integrator',
  webappStaff: 'bcb_test_webapp_staff',
  webappPatient: 'bcb_test_webapp_patient',
};
const TEST_PORT_CONTEXT_TLS = {
  ca: '/etc/bersoncarebot/postgres-mtls/test/ca.crt',
  integratorCert: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_integrator.crt',
  integratorKey: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_integrator.key',
  webappStaffCert: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_webapp_staff.crt',
  webappStaffKey: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_webapp_staff.key',
  webappPatientCert: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_webapp_patient.crt',
  webappPatientKey: '/etc/bersoncarebot/postgres-mtls/test/bcb_test_webapp_patient.key',
};
const DEV_PORT_CONTEXT = {
  api: renderPortContextRuntimeEnv(declaration, 'dev', 'bcb_webapp_dev', 'integrator'),
  webapp: renderPortContextRuntimeEnv(declaration, 'dev', 'bcb_webapp_dev', 'webapp'),
};
const DEV_PORT_CONTEXT_LOGINS = {
  integrator: 'bcb_dev_integrator',
  webappStaff: 'bcb_dev_webapp_staff',
  webappPatient: 'bcb_dev_webapp_patient',
};
const DEV_PORT_CONTEXT_TLS = {
  ca: '/etc/bersoncarebot/postgres-mtls/dev/ca.crt',
  integratorCert: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_integrator.crt',
  integratorKey: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_integrator.key',
  webappStaffCert: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_webapp_staff.crt',
  webappStaffKey: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_webapp_staff.key',
  webappPatientCert: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_webapp_patient.crt',
  webappPatientKey: '/etc/bersoncarebot/postgres-mtls/dev/bcb_dev_webapp_patient.key',
};
const LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL(?:_[A-Z0-9_]+)?|DB_PRINCIPAL_[A-Z0-9_]+|PG[A-Z0-9_]*|(?:DATABASE|DB|POSTGRES|POSTGRESQL)_(?:URL|PASSWORD|PASS|CONNECTION_STRING)|MEDIA(?:_WORKER)?_(?:(?:[A-Z0-9]+_)*(?:DATABASE|DB|POSTGRES|POSTGRESQL|PG)(?:_[A-Z0-9]+)*|(?:[A-Z0-9]+_)*(?:CONNECTION_STRING|PASSWORD|PASS|SSL[A-Z0-9]*|CERT(?:IFICATE)?|CA|KEY)(?:_[A-Z0-9]+)*))$/;
const CROSS_PROCESS_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL_MEDIA_WORKER|MEDIA(?:_WORKER)?_(?:(?:[A-Z0-9]+_)*(?:DATABASE|DB|POSTGRES|POSTGRESQL|PG)(?:_[A-Z0-9]+)*|(?:[A-Z0-9]+_)*(?:CONNECTION_STRING|PASSWORD|PASS|SSL[A-Z0-9]*|CERT(?:IFICATE)?|CA|KEY)(?:_[A-Z0-9]+)*))$/;
const PORT_CONTEXT_API_REMOVALS = new Set([
  'DATABASE_URL',
  'DATABASE_URL_DIAGNOSTIC',
  'DATABASE_URL_DELIVERY_WORKER',
  'DATABASE_URL_SCHEDULER',
  'DB_PRINCIPAL_SIGNING_SECRET',
]);
const PORT_CONTEXT_WEBAPP_REMOVALS = new Set([
  'DATABASE_URL',
  'DATABASE_URL_NONSTAFF',
  'DATABASE_URL_WEB_PUSH_REMINDER',
  'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
  'DB_PRINCIPAL_SIGNING_SECRET',
]);

function fail(message) {
  throw new Error(message);
}

function parseEnv(text, label) {
  const values = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) fail(`${label}:${index + 1}: unsupported env syntax`);
    if (values.has(match[1])) fail(`${label}:${index + 1}: duplicate key ${match[1]}`);
    let value = match[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function upsertEnv(text, additions) {
  const pending = new Map(additions);
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match || !pending.has(match[1])) return line;
      const value = pending.get(match[1]);
      pending.delete(match[1]);
      return `${match[1]}=${shellQuote(value)}`;
    });
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  if (pending.size > 0) {
    lines.push('', '# Dedicated C4 operational database contours (root-managed).');
    for (const [key, value] of pending) lines.push(`${key}=${shellQuote(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

function removeEnvKeys(text, removals) {
  return `${text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];
      return !key || !removals.has(key);
    })
    .join('\n')
    .replace(/\n+$/u, '')}\n`;
}

function makeUrl(base, role) {
  const url = new URL(base);
  url.username = role;
  url.password = randomBytes(32).toString('base64url');
  return url.toString();
}

function validateBaseUrl(raw) {
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (!url.username || !url.password)
    fail('api.test DATABASE_URL must contain a login and password');
  if (url.hostname !== '127.0.0.1' || url.port !== '5432') {
    fail('api.test DATABASE_URL must target exact local PostgreSQL endpoint 127.0.0.1:5432');
  }
  if (database !== 'bersoncarebot_test')
    fail('api.test DATABASE_URL must target bersoncarebot_test');
}

function validatePortContextUrl(raw, expectedLogin, label, expectedDatabase = 'bersoncarebot_test') {
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (decodeURIComponent(url.username) !== expectedLogin) {
    fail(`${label} username must be ${expectedLogin}`);
  }
  if (!url.password) fail(`${label} must contain a password for PostgreSQL SCRAM`);
  if (url.hostname !== '127.0.0.1' || url.port !== '5432') {
    fail(`${label} must target exact local PostgreSQL endpoint 127.0.0.1:5432`);
  }
  if (database !== expectedDatabase) fail(`${label} must target ${expectedDatabase}`);
  for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    if (url.searchParams.has(parameter)) {
      fail(`${label} must not override mTLS through URL parameter ${parameter}`);
    }
  }
}

function requireEnvPath(values, key, label) {
  const value = values.get(key);
  if (!value) fail(`${label} is missing ${key}`);
  return value;
}

function mergedValues(base, additions) {
  return new Map([...base, ...additions]);
}

function assertRegular(path, allowMissing = false) {
  try {
    if (!lstatSync(path).isFile()) fail(`${path} must be a regular file`);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return false;
    throw error;
  }
  return true;
}

function writeProtected(path, content, ownerUid, deployGid, mode = 0o640) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  chownSync(temporary, ownerUid, deployGid);
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

function bootstrapDev({ apiPath, webappPath, ownerUid, ownerGid, write = true, tls = DEV_PORT_CONTEXT_TLS }) {
  assertRegular(apiPath);
  assertRegular(webappPath);
  const apiText = readFileSync(apiPath, 'utf8');
  const webappText = readFileSync(webappPath, 'utf8');
  const api = parseEnv(apiText, 'integrator DEV env');
  const webapp = parseEnv(webappText, 'webapp DEV env');
  const legacyApiBase = api.get('DATABASE_URL');
  const legacyWebappBase = webapp.get('DATABASE_URL');
  const apiBase = legacyApiBase || requireEnvPath(api, 'INTEGRATOR_DB_URL', 'integrator DEV env');
  const webappBase = legacyWebappBase || requireEnvPath(webapp, 'DATABASE_URL_STAFF', 'webapp DEV env');
  for (const [raw, label] of [
    [apiBase, 'integrator DEV DATABASE_URL'],
    [webappBase, 'webapp DEV DATABASE_URL'],
  ]) {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (
      !url.username ||
      !url.password ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '5432' ||
      database !== 'bcb_webapp_dev'
    ) {
      fail(`${label} must contain credentials for exact 127.0.0.1:5432/bcb_webapp_dev`);
    }
  }
  const apiAdditions = new Map([
    ['DB_PRINCIPAL_CONTEXT_MODE', 'port-context'],
    ['INTEGRATOR_DB_URL', legacyApiBase ? makeUrl(apiBase, DEV_PORT_CONTEXT_LOGINS.integrator) : api.get('INTEGRATOR_DB_URL')],
    ['INTEGRATOR_DB_LOGIN', DEV_PORT_CONTEXT_LOGINS.integrator],
    ['INTEGRATOR_DB_TLS_CA_FILE', tls.ca],
    ['INTEGRATOR_DB_TLS_CERT_FILE', tls.integratorCert],
    ['INTEGRATOR_DB_TLS_KEY_FILE', tls.integratorKey],
    [DEV_PORT_CONTEXT.api.key, DEV_PORT_CONTEXT.api.value],
  ]);
  const webappAdditions = new Map([
    ['DB_PRINCIPAL_CONTEXT_MODE', 'port-context'],
    ['DATABASE_URL_STAFF', legacyWebappBase ? makeUrl(webappBase, DEV_PORT_CONTEXT_LOGINS.webappStaff) : webapp.get('DATABASE_URL_STAFF')],
    ['DATABASE_URL_PATIENT', legacyWebappBase ? makeUrl(webappBase, DEV_PORT_CONTEXT_LOGINS.webappPatient) : requireEnvPath(webapp, 'DATABASE_URL_PATIENT', 'webapp DEV env')],
    ['WEBAPP_DB_STAFF_LOGIN', DEV_PORT_CONTEXT_LOGINS.webappStaff],
    ['WEBAPP_DB_PATIENT_LOGIN', DEV_PORT_CONTEXT_LOGINS.webappPatient],
    ['WEBAPP_DB_TLS_CA_FILE', tls.ca],
    ['WEBAPP_DB_STAFF_CERT_FILE', tls.webappStaffCert],
    ['WEBAPP_DB_STAFF_KEY_FILE', tls.webappStaffKey],
    ['WEBAPP_DB_PATIENT_CERT_FILE', tls.webappPatientCert],
    ['WEBAPP_DB_PATIENT_KEY_FILE', tls.webappPatientKey],
    [DEV_PORT_CONTEXT.webapp.key, DEV_PORT_CONTEXT.webapp.value],
  ]);
  const targetApi = mergedValues(api, apiAdditions);
  const targetWebapp = mergedValues(webapp, webappAdditions);
  validatePortContextUrl(
    targetApi.get('INTEGRATOR_DB_URL'),
    DEV_PORT_CONTEXT_LOGINS.integrator,
    'DEV INTEGRATOR_DB_URL',
    'bcb_webapp_dev',
  );
  validatePortContextUrl(
    targetWebapp.get('DATABASE_URL_STAFF'),
    DEV_PORT_CONTEXT_LOGINS.webappStaff,
    'DEV DATABASE_URL_STAFF',
    'bcb_webapp_dev',
  );
  validatePortContextUrl(
    targetWebapp.get('DATABASE_URL_PATIENT'),
    DEV_PORT_CONTEXT_LOGINS.webappPatient,
    'DEV DATABASE_URL_PATIENT',
    'bcb_webapp_dev',
  );
  for (const path of Object.values(tls)) assertRegular(path);
  if (write) {
    writeProtected(
      apiPath,
      removeEnvKeys(upsertEnv(apiText, apiAdditions), PORT_CONTEXT_API_REMOVALS),
      ownerUid,
      ownerGid,
      0o600,
    );
    writeProtected(
      webappPath,
      removeEnvKeys(upsertEnv(webappText, webappAdditions), PORT_CONTEXT_WEBAPP_REMOVALS),
      ownerUid,
      ownerGid,
      0o600,
    );
  }
}

function bootstrap({
  apiPath,
  webappPath,
  mediaPath,
  ownerUid = 0,
  deployGid,
  write = true,
  targetPortContext = false,
}) {
  assertRegular(apiPath);
  assertRegular(webappPath);
  const mediaExists = assertRegular(mediaPath, true);
  const apiText = readFileSync(apiPath, 'utf8');
  const webappText = readFileSync(webappPath, 'utf8');
  const api = parseEnv(apiText, 'api.test');
  const webapp = parseEnv(webappText, 'webapp.test');
  for (const [label, values] of [
    ['api.test', api],
    ['webapp.test', webapp],
  ]) {
    for (const key of values.keys()) {
      if (CROSS_PROCESS_MEDIA_DATABASE_CREDENTIAL_KEY.test(key)) {
        fail(`${label} must not declare a fourth media-worker database credential ${key}`);
      }
    }
  }
  const legacyBaseUrl = api.get('DATABASE_URL');
  const baseUrl = legacyBaseUrl || (targetPortContext ? api.get('INTEGRATOR_DB_URL') : undefined);
  if (!baseUrl) fail('api.test is missing DATABASE_URL/INTEGRATOR_DB_URL');
  validateBaseUrl(baseUrl);

  for (const key of ['DB_PRINCIPAL_CONTEXT_MODE']) {
    if (!targetPortContext && (!api.get(key) || api.get(key) !== webapp.get(key)))
      fail(`${key} must be present and equal in api.test/webapp.test`);
  }
  const principalMode = targetPortContext ? 'port-context' : api.get('DB_PRINCIPAL_CONTEXT_MODE');
  if (!['shadow', 'locked', 'port-context'].includes(principalMode)) {
    fail('TEST principal mode must be shadow, locked or port-context');
  }
  if (['shadow', 'locked'].includes(principalMode)) {
    const key = 'DB_PRINCIPAL_SIGNING_SECRET';
    if (!api.get(key) || api.get(key) !== webapp.get(key))
      fail(`${key} must be present and equal in api.test/webapp.test`);
  }

  const apiAdditions = new Map();
  if (!targetPortContext) {
    for (const [key, role] of OPERATIONAL_KEYS) {
      apiAdditions.set(key, api.get(key) || makeUrl(baseUrl, role));
    }
  }
  apiAdditions.set('DB_PRINCIPAL_CONTEXT_MODE', principalMode);
  apiAdditions.set(TEST_PORT_CONTEXT.api.key, TEST_PORT_CONTEXT.api.value);
  const webappAdditions = new Map([
    ['ALLOW_DEV_AUTH_BYPASS', 'false'],
    ['DB_PRINCIPAL_CONTEXT_MODE', principalMode],
    [TEST_PORT_CONTEXT.webapp.key, TEST_PORT_CONTEXT.webapp.value],
  ]);
  if (principalMode === 'port-context') {
    apiAdditions.set(
      'INTEGRATOR_DB_URL',
      legacyBaseUrl ? makeUrl(baseUrl, TEST_PORT_CONTEXT_LOGINS.integrator) : api.get('INTEGRATOR_DB_URL'),
    );
    apiAdditions.set('INTEGRATOR_DB_LOGIN', TEST_PORT_CONTEXT_LOGINS.integrator);
    apiAdditions.set(
      'INTEGRATOR_DB_TLS_CA_FILE',
      TEST_PORT_CONTEXT_TLS.ca,
    );
    apiAdditions.set(
      'INTEGRATOR_DB_TLS_CERT_FILE',
      TEST_PORT_CONTEXT_TLS.integratorCert,
    );
    apiAdditions.set(
      'INTEGRATOR_DB_TLS_KEY_FILE',
      TEST_PORT_CONTEXT_TLS.integratorKey,
    );

    webappAdditions.set(
      'DATABASE_URL_STAFF',
      legacyBaseUrl ? makeUrl(baseUrl, TEST_PORT_CONTEXT_LOGINS.webappStaff) : webapp.get('DATABASE_URL_STAFF'),
    );
    webappAdditions.set(
      'DATABASE_URL_PATIENT',
      legacyBaseUrl ? makeUrl(baseUrl, TEST_PORT_CONTEXT_LOGINS.webappPatient) : requireEnvPath(webapp, 'DATABASE_URL_PATIENT', 'webapp.test port-context'),
    );
    webappAdditions.set('WEBAPP_DB_STAFF_LOGIN', TEST_PORT_CONTEXT_LOGINS.webappStaff);
    webappAdditions.set('WEBAPP_DB_PATIENT_LOGIN', TEST_PORT_CONTEXT_LOGINS.webappPatient);
    webappAdditions.set(
      'WEBAPP_DB_TLS_CA_FILE',
      TEST_PORT_CONTEXT_TLS.ca,
    );
    webappAdditions.set(
      'WEBAPP_DB_STAFF_CERT_FILE',
      TEST_PORT_CONTEXT_TLS.webappStaffCert,
    );
    webappAdditions.set(
      'WEBAPP_DB_STAFF_KEY_FILE',
      TEST_PORT_CONTEXT_TLS.webappStaffKey,
    );
    webappAdditions.set(
      'WEBAPP_DB_PATIENT_CERT_FILE',
      TEST_PORT_CONTEXT_TLS.webappPatientCert,
    );
    webappAdditions.set(
      'WEBAPP_DB_PATIENT_KEY_FILE',
      TEST_PORT_CONTEXT_TLS.webappPatientKey,
    );

    const targetApi = mergedValues(api, apiAdditions);
    const targetWebapp = mergedValues(webapp, webappAdditions);
    validatePortContextUrl(
      requireEnvPath(targetApi, 'INTEGRATOR_DB_URL', 'api.test port-context'),
      TEST_PORT_CONTEXT_LOGINS.integrator,
      'api.test INTEGRATOR_DB_URL',
    );
    validatePortContextUrl(
      requireEnvPath(targetWebapp, 'DATABASE_URL_STAFF', 'webapp.test port-context'),
      TEST_PORT_CONTEXT_LOGINS.webappStaff,
      'webapp.test DATABASE_URL_STAFF',
    );
    validatePortContextUrl(
      requireEnvPath(targetWebapp, 'DATABASE_URL_PATIENT', 'webapp.test port-context'),
      TEST_PORT_CONTEXT_LOGINS.webappPatient,
      'webapp.test DATABASE_URL_PATIENT',
    );
    for (const [values, label, keys] of [
      [targetApi, 'api.test port-context', [
        'INTEGRATOR_DB_TLS_CA_FILE',
        'INTEGRATOR_DB_TLS_CERT_FILE',
        'INTEGRATOR_DB_TLS_KEY_FILE',
      ]],
      [targetWebapp, 'webapp.test port-context', [
        'WEBAPP_DB_TLS_CA_FILE',
        'WEBAPP_DB_STAFF_CERT_FILE',
        'WEBAPP_DB_STAFF_KEY_FILE',
        'WEBAPP_DB_PATIENT_CERT_FILE',
        'WEBAPP_DB_PATIENT_KEY_FILE',
      ]],
    ]) {
      for (const key of keys) assertRegular(requireEnvPath(values, key, label));
    }
  }

  const mediaAdditions = new Map([
    ['MEDIA_WORKER_CONTROL_URL', webapp.get('APP_BASE_URL') ?? ''],
    ['INTERNAL_JOB_SECRET', webapp.get('INTERNAL_JOB_SECRET') ?? ''],
  ]);
  let mediaText;
  if (mediaExists) {
    mediaText = upsertEnv(readFileSync(mediaPath, 'utf8'), mediaAdditions)
      .split('\n')
      .filter((line) => {
        const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];
        return (
          !key ||
          (!LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY.test(key) && !key.startsWith('DB_PRINCIPAL_'))
        );
      })
      .join('\n');
  } else {
    const media = new Map([['NODE_ENV', 'production'], ...mediaAdditions]);
    for (const key of MEDIA_COPY_KEYS) {
      if (api.get(key)) media.set(key, api.get(key));
    }
    for (const key of MEDIA_REQUIRED_KEYS) {
      if (!media.get(key)) fail(`api.test is missing media-worker source key ${key}`);
    }
    mediaText = [...media].map(([key, value]) => `${key}=${shellQuote(value)}`).join('\n') + '\n';
  }

  const parsedMedia = parseEnv(mediaText, 'media-worker.test');
  for (const key of parsedMedia.keys()) {
    if (LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY.test(key) || key.startsWith('DB_PRINCIPAL_')) {
      fail(`media-worker.test retained prohibited database configuration ${key}`);
    }
  }
  for (const key of MEDIA_REQUIRED_KEYS) {
    if (!parsedMedia.get(key)) fail(`media-worker.test is missing ${key}`);
  }
  try {
    const controlUrl = new URL(parsedMedia.get('MEDIA_WORKER_CONTROL_URL'));
    if (controlUrl.protocol !== 'http:' && controlUrl.protocol !== 'https:') throw new Error();
  } catch {
    fail('media-worker.test has invalid MEDIA_WORKER_CONTROL_URL');
  }
  if (parsedMedia.get('INTERNAL_JOB_SECRET') !== webapp.get('INTERNAL_JOB_SECRET')) {
    fail('media-worker.test must use the webapp internal control secret');
  }

  if (write) {
    const targetApiText = upsertEnv(apiText, apiAdditions);
    const targetWebappText = upsertEnv(webappText, webappAdditions);
    writeProtected(mediaPath, mediaText, ownerUid, deployGid);
    writeProtected(
      apiPath,
      targetPortContext ? removeEnvKeys(targetApiText, PORT_CONTEXT_API_REMOVALS) : targetApiText,
      ownerUid,
      deployGid,
    );
    writeProtected(
      webappPath,
      targetPortContext
        ? removeEnvKeys(targetWebappText, PORT_CONTEXT_WEBAPP_REMOVALS)
        : targetWebappText,
      ownerUid,
      deployGid,
    );
  }
}

function selfTest() {
  for (const rejected of [
    'postgresql://base:secret@db.example.test:5432/bersoncarebot_test',
    'postgresql://base:secret@127.0.0.1:6432/bersoncarebot_test',
  ]) {
    let rejectedAsExpected = false;
    try {
      validateBaseUrl(rejected);
    } catch {
      rejectedAsExpected = true;
    }
    if (!rejectedAsExpected) fail('self-test accepted a non-canonical TEST PostgreSQL endpoint');
  }
  const root = mkdtempSync(join(tmpdir(), 'bcb-c4-bootstrap-'));
  try {
    const api = join(root, 'api.test');
    const webapp = join(root, 'webapp.test');
    const media = join(root, 'media-worker.test');
    const common =
      "DB_PRINCIPAL_CONTEXT_MODE='locked'\nDB_PRINCIPAL_SIGNING_SECRET='test-signing-secret-at-least-32-bytes'\n";
    const s3 =
      "S3_ENDPOINT='http://s3.test'\nS3_ACCESS_KEY='access'\nS3_SECRET_KEY='secret'\nS3_PRIVATE_BUCKET='private'\n";
    writeFileSync(
      api,
      "DATABASE_URL='postgresql://base:base-secret@127.0.0.1:5432/bersoncarebot_test'\n" +
        common +
        s3,
    );
    writeFileSync(
      webapp,
      "NODE_ENV='production'\nALLOW_DEV_AUTH_BYPASS='true'\nAPP_BASE_URL='http://127.0.0.1:6200'\nINTERNAL_JOB_SECRET='control-secret'\n" +
        common,
    );
    const apiBeforeCheck = readFileSync(api, 'utf8');
    const webappBeforeCheck = readFileSync(webapp, 'utf8');
    chmodSync(api, 0o000);
    let unreadableRejected = false;
    try {
      bootstrap({
        apiPath: api,
        webappPath: webapp,
        mediaPath: media,
        ownerUid: process.getuid(),
        deployGid: process.getgid(),
      });
    } catch {
      unreadableRejected = true;
    } finally {
      chmodSync(api, 0o600);
    }
    if (!unreadableRejected) fail('bootstrap accepted an unreadable source env');
    if (assertRegular(media, true)) fail('source validation failure created media-worker.test');
    if (
      readFileSync(api, 'utf8') !== apiBeforeCheck ||
      readFileSync(webapp, 'utf8') !== webappBeforeCheck
    ) {
      fail('source validation failure modified an existing env file');
    }
    for (const target of [api, webapp]) {
      const beforeMutation = readFileSync(target, 'utf8');
      writeFileSync(
        target,
        `${beforeMutation}DATABASE_URL_MEDIA_WORKER='postgresql://fourth:secret@127.0.0.1:5432/bersoncarebot_test'\n`,
      );
      let fourthOperationalKeyRejected = false;
      try {
        bootstrap({
          apiPath: api,
          webappPath: webapp,
          mediaPath: media,
          ownerUid: process.getuid(),
          deployGid: process.getgid(),
          write: false,
        });
      } catch {
        fourthOperationalKeyRejected = true;
      } finally {
        writeFileSync(target, beforeMutation);
      }
      if (!fourthOperationalKeyRejected) {
        fail('bootstrap accepted a fourth media-worker operational database key');
      }
    }
    bootstrap({
      apiPath: api,
      webappPath: webapp,
      mediaPath: media,
      ownerUid: process.getuid(),
      deployGid: process.getgid(),
      write: false,
    });
    if (assertRegular(media, true)) fail('--check created media-worker.test');
    if (
      readFileSync(api, 'utf8') !== apiBeforeCheck ||
      readFileSync(webapp, 'utf8') !== webappBeforeCheck
    ) {
      fail('--check modified an existing env file');
    }
    bootstrap({
      apiPath: api,
      webappPath: webapp,
      mediaPath: media,
      ownerUid: process.getuid(),
      deployGid: process.getgid(),
    });
    const firstApi = parseEnv(readFileSync(api, 'utf8'), 'api.test');
    const firstMedia = parseEnv(readFileSync(media, 'utf8'), 'media-worker.test');
    for (const [key, role] of OPERATIONAL_KEYS) {
      if (new URL(firstApi.get(key)).username !== role) fail(`self-test wrong role for ${key}`);
    }
    if (
      firstMedia.get('MEDIA_WORKER_CONTROL_URL') !== 'http://127.0.0.1:6200' ||
      firstMedia.get('DATABASE_URL') ||
      firstMedia.get('DB_PRINCIPAL_SIGNING_SECRET')
    ) {
      fail('self-test media env retained a database door or wrong control URL');
    }
    const firstWebapp = parseEnv(readFileSync(webapp, 'utf8'), 'webapp.test');
    if (firstWebapp.get('ALLOW_DEV_AUTH_BYPASS') !== 'false') {
      fail('self-test did not disable dev auth bypass in webapp.test');
    }
    if (firstApi.get(TEST_PORT_CONTEXT.api.key) !== TEST_PORT_CONTEXT.api.value) {
      fail('self-test did not render declaration-owned integrator capabilities');
    }
    if (firstWebapp.get(TEST_PORT_CONTEXT.webapp.key) !== TEST_PORT_CONTEXT.webapp.value) {
      fail('self-test did not render declaration-owned webapp capabilities');
    }
    writeFileSync(
      media,
      `${readFileSync(media, 'utf8')}PGSSLMODE='verify-full'\nPGSSLCRL='/tmp/crl'\nPGSSLCRLDIR='/tmp/crl.d'\nPGSSLMINPROTOCOLVERSION='TLSv1.3'\nMEDIA_WORKER_CA='ca'\nMEDIA_DATABASE_CA='ca'\nMEDIA_POSTGRESQL_URL='postgresql://legacy:secret@127.0.0.1/db'\nPOSTGRESQL_URL='postgresql://legacy:secret@127.0.0.1/db'\nPOSTGRES_URL='postgresql://legacy:secret@127.0.0.1/db'\nPOSTGRES_PASSWORD='secret'\nMEDIA_WORKER_CONNECTION_STRING='postgresql://legacy:secret@127.0.0.1/db'\nMEDIA_CONNECTION_STRING='postgresql://legacy:secret@127.0.0.1/db'\nDB_URL='postgresql://legacy:secret@127.0.0.1/db'\n`,
    );
    bootstrap({
      apiPath: api,
      webappPath: webapp,
      mediaPath: media,
      ownerUid: process.getuid(),
      deployGid: process.getgid(),
    });
    const secondApi = parseEnv(readFileSync(api, 'utf8'), 'api.test');
    const secondMedia = parseEnv(readFileSync(media, 'utf8'), 'media-worker.test');
    for (const key of secondMedia.keys()) {
      if (LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY.test(key)) {
        fail(`bootstrap retained prohibited media credential ${key}`);
      }
    }
    if (secondApi.get('DATABASE_URL_DIAGNOSTIC') !== firstApi.get('DATABASE_URL_DIAGNOSTIC'))
      fail('bootstrap is not idempotent');

    writeFileSync(
      api,
      "DATABASE_URL='postgresql://base:base-secret@127.0.0.1:5432/bersoncarebot_test'\n" +
        "DB_PRINCIPAL_CONTEXT_MODE='port-context'\n" +
        `INTEGRATOR_DB_TLS_CA_FILE='${join(root, 'ca.crt')}'\n` +
        `INTEGRATOR_DB_TLS_CERT_FILE='${join(root, 'integrator.crt')}'\n` +
        `INTEGRATOR_DB_TLS_KEY_FILE='${join(root, 'integrator.key')}'\n` +
        s3,
    );
    writeFileSync(
      webapp,
      "NODE_ENV='production'\nALLOW_DEV_AUTH_BYPASS='true'\nAPP_BASE_URL='http://127.0.0.1:6200'\nINTERNAL_JOB_SECRET='control-secret'\n" +
        "DB_PRINCIPAL_CONTEXT_MODE='port-context'\n",
    );
    for (const name of [
      'ca.crt',
      'integrator.crt',
      'integrator.key',
      'webapp-staff.crt',
      'webapp-staff.key',
      'webapp-patient.crt',
      'webapp-patient.key',
    ]) {
      writeFileSync(join(root, name), 'self-test pem placeholder\n');
    }
    writeFileSync(
      webapp,
      readFileSync(webapp, 'utf8') +
        `WEBAPP_DB_TLS_CA_FILE='${join(root, 'ca.crt')}'\n` +
        `WEBAPP_DB_STAFF_CERT_FILE='${join(root, 'webapp-staff.crt')}'\n` +
        `WEBAPP_DB_STAFF_KEY_FILE='${join(root, 'webapp-staff.key')}'\n` +
        `WEBAPP_DB_PATIENT_CERT_FILE='${join(root, 'webapp-patient.crt')}'\n` +
        `WEBAPP_DB_PATIENT_KEY_FILE='${join(root, 'webapp-patient.key')}'\n`,
    );
    bootstrap({
      apiPath: api,
      webappPath: webapp,
      mediaPath: media,
      ownerUid: process.getuid(),
      deployGid: process.getgid(),
      targetPortContext: true,
    });
    const portContextApi = parseEnv(readFileSync(api, 'utf8'), 'api.test');
    const portContextWebapp = parseEnv(readFileSync(webapp, 'utf8'), 'webapp.test');
    bootstrap({
      apiPath: api,
      webappPath: webapp,
      mediaPath: media,
      ownerUid: process.getuid(),
      deployGid: process.getgid(),
      targetPortContext: true,
      write: false,
    });
    if (new URL(portContextApi.get('INTEGRATOR_DB_URL')).username !== TEST_PORT_CONTEXT_LOGINS.integrator) {
      fail('self-test did not render integrator port-context URL');
    }
    if (new URL(portContextWebapp.get('DATABASE_URL_STAFF')).username !== TEST_PORT_CONTEXT_LOGINS.webappStaff) {
      fail('self-test did not render webapp staff port-context URL');
    }
    if (new URL(portContextWebapp.get('DATABASE_URL_PATIENT')).username !== TEST_PORT_CONTEXT_LOGINS.webappPatient) {
      fail('self-test did not render webapp patient port-context URL');
    }
    if (
      portContextApi.get('DB_PRINCIPAL_SIGNING_SECRET') ||
      portContextWebapp.get('DB_PRINCIPAL_SIGNING_SECRET') ||
      portContextApi.get('DATABASE_URL') ||
      portContextApi.get('DATABASE_URL_DIAGNOSTIC') ||
      portContextApi.get('DATABASE_URL_DELIVERY_WORKER') ||
      portContextApi.get('DATABASE_URL_SCHEDULER') ||
      portContextWebapp.get('DATABASE_URL') ||
      portContextWebapp.get('DATABASE_URL_NONSTAFF') ||
      portContextWebapp.get('SAAS_ISOLATION_OPERATOR_DATABASE_URL')
    ) {
      fail('self-test retained a legacy database door or signed-context secret in port-context mode');
    }

    const devApi = join(root, '.env');
    const devWebapp = join(root, '.env.dev');
    writeFileSync(devApi, "DATABASE_URL='postgresql://legacy-api:secret@127.0.0.1:5432/bcb_webapp_dev'\n");
    writeFileSync(
      devWebapp,
      "DATABASE_URL='postgresql://legacy-web:secret@127.0.0.1:5432/bcb_webapp_dev'\n" +
        "DATABASE_URL_NONSTAFF='postgresql://legacy-nonstaff:secret@127.0.0.1:5432/bcb_webapp_dev'\n" +
        "SAAS_ISOLATION_OPERATOR_DATABASE_URL='postgresql://legacy-operator:secret@127.0.0.1:5432/bcb_webapp_dev'\n" +
        "DB_PRINCIPAL_SIGNING_SECRET='legacy-signing-secret'\n",
    );
    const devTls = {
      ca: join(root, 'ca.crt'),
      integratorCert: join(root, 'integrator.crt'),
      integratorKey: join(root, 'integrator.key'),
      webappStaffCert: join(root, 'webapp-staff.crt'),
      webappStaffKey: join(root, 'webapp-staff.key'),
      webappPatientCert: join(root, 'webapp-patient.crt'),
      webappPatientKey: join(root, 'webapp-patient.key'),
    };
    bootstrapDev({
      apiPath: devApi,
      webappPath: devWebapp,
      ownerUid: process.getuid(),
      ownerGid: process.getgid(),
      tls: devTls,
    });
    const targetDevApi = parseEnv(readFileSync(devApi, 'utf8'), 'integrator DEV env');
    const targetDevWebapp = parseEnv(readFileSync(devWebapp, 'utf8'), 'webapp DEV env');
    bootstrapDev({
      apiPath: devApi,
      webappPath: devWebapp,
      ownerUid: process.getuid(),
      ownerGid: process.getgid(),
      tls: devTls,
      write: false,
    });
    if (
      targetDevApi.get('DB_PRINCIPAL_CONTEXT_MODE') !== 'port-context' ||
      new URL(targetDevApi.get('INTEGRATOR_DB_URL')).username !== DEV_PORT_CONTEXT_LOGINS.integrator ||
      new URL(targetDevWebapp.get('DATABASE_URL_STAFF')).username !== DEV_PORT_CONTEXT_LOGINS.webappStaff ||
      new URL(targetDevWebapp.get('DATABASE_URL_PATIENT')).username !== DEV_PORT_CONTEXT_LOGINS.webappPatient ||
      targetDevApi.get('DATABASE_URL') ||
      targetDevWebapp.get('DATABASE_URL') ||
      targetDevWebapp.get('DATABASE_URL_NONSTAFF') ||
      targetDevWebapp.get('SAAS_ISOLATION_OPERATOR_DATABASE_URL') ||
      targetDevWebapp.get('DB_PRINCIPAL_SIGNING_SECRET')
    ) {
      fail('self-test DEV bootstrap did not close legacy database doors');
    }
    console.log('bootstrap-c4-test-env self-test: OK');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  if (process.getuid() !== 0) fail('run as root');
  if (
    process.argv.length !== 3 ||
    ![
      '--check',
      '--execute',
      '--port-context-check',
      '--port-context-execute',
      '--dev-port-context-check',
      '--dev-port-context-execute',
    ].includes(process.argv[2])
  ) {
    fail('usage: bootstrap-c4-test-env.mjs --check|--execute|--port-context-check|--port-context-execute|--dev-port-context-check|--dev-port-context-execute');
  }
  const requestedMode = process.argv[2];
  const write = process.argv[2].endsWith('execute');
  const targetPortContext = requestedMode.startsWith('--port-context-');
  const devPortContext = requestedMode.startsWith('--dev-port-context-');
  if (devPortContext) {
    const devUid = Number(execFileSync('id', ['-u', 'dev'], { encoding: 'utf8' }).trim());
    const devGid = Number(execFileSync('id', ['-g', 'dev'], { encoding: 'utf8' }).trim());
    bootstrapDev({
      apiPath: DEV_PATHS.api,
      webappPath: DEV_PATHS.webapp,
      ownerUid: devUid,
      ownerGid: devGid,
      write,
    });
  } else {
    const deployGid = Number(execFileSync('id', ['-g', 'deploy'], { encoding: 'utf8' }).trim());
    bootstrap({
      apiPath: TEST_PATHS.api,
      webappPath: TEST_PATHS.webapp,
      mediaPath: TEST_PATHS.media,
      deployGid,
      write,
      targetPortContext,
    });
  }
  console.log(
    write
      ? `${devPortContext ? 'port-context DEV' : targetPortContext ? 'port-context TEST' : 'C4 TEST'} env bootstrap: OK (secrets redacted)`
      : `${devPortContext ? 'port-context DEV' : targetPortContext ? 'port-context TEST' : 'C4 TEST'} env bootstrap preflight: OK (no files written; secrets redacted)`,
  );
}
