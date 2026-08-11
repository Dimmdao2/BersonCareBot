#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const REQUIRED_PROCESS_NAMES = new Set(['webapp', 'integrator', 'media-worker']);
const REQUIRED_SHARED_KEYS = ['DB_PRINCIPAL_CONTEXT_MODE', 'DB_PRINCIPAL_SIGNING_SECRET'];
const MEDIA_CONTROL_KEYS = ['MEDIA_WORKER_CONTROL_URL', 'INTERNAL_JOB_SECRET'];
const LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL|PG(?:PASSWORD|SERVICE|SERVICEFILE|SSLCERT|SSLKEY|SSLROOTCERT)|(?:MEDIA(?:_WORKER)?|MEDIA_WORKER)_(?:(?:DATABASE|DB|POSTGRES)_?(?:URL|PASSWORD|PASS|CERT(?:IFICATE)?|KEY|SSL(?:CERT|KEY|ROOTCERT))|URL|PASSWORD|PASS|CERT(?:IFICATE)?|KEY|SSL(?:CERT|KEY|ROOTCERT)))$/;
const WEBAPP_DATABASE_URL_KEYS = [
  'DATABASE_URL_STAFF',
  'DATABASE_URL_NONSTAFF',
  'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
];
const INTEGRATOR_OPERATIONAL_URL_KEYS = [
  'DATABASE_URL_DIAGNOSTIC',
  'DATABASE_URL_DELIVERY_WORKER',
  'DATABASE_URL_SCHEDULER',
];
const MIN_SECRET_BYTES = 32;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    envFiles: [],
    selfTest: false,
  };
  for (const arg of argv) {
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    // `--env-file` is a Node.js runtime flag, including when it appears after the script path.
    // Keep this application option distinct so Node does not consume it before this parser runs.
    if (arg.startsWith('--process-env-file=')) {
      options.envFiles.push(arg.slice('--process-env-file='.length));
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return options;
}

function parseEnvFileSpec(spec) {
  const separator = spec.indexOf(':');
  if (separator <= 0 || separator === spec.length - 1) {
    fail(`invalid --process-env-file spec, expected process:/path: ${spec}`);
  }
  const processName = spec.slice(0, separator);
  const path = spec.slice(separator + 1);
  if (!REQUIRED_PROCESS_NAMES.has(processName)) {
    fail(`unsupported process in --process-env-file: ${processName}`);
  }
  if (!path.startsWith('/')) {
    fail(`env file path must be absolute for ${processName}`);
  }
  return { processName, path };
}

function parseEnvText(text) {
  const values = new Map();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    values.set(key, unquoteEnvValue(rawValue.trim()));
  }
  return values;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function loadEnvFile(spec) {
  const { processName, path } = parseEnvFileSpec(spec);
  const text = readFileSync(path, 'utf8');
  return {
    basename: basename(path),
    path,
    processName,
    values: parseEnvText(text),
  };
}

function fingerprintSecret(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function fingerprintUrlHost(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || defaultPortForProtocol(url.protocol)}/${url.pathname.replace(/^\/+/, '')}`;
  } catch {
    return '<invalid-url>';
  }
}

function databaseUrlUsername(value, label) {
  try {
    const username = decodeURIComponent(new URL(value).username);
    if (!username) fail(`${label} must include a PostgreSQL username`);
    return username;
  } catch {
    fail(`${label} must be a valid PostgreSQL URL`);
  }
}

function defaultPortForProtocol(protocol) {
  if (protocol === 'postgresql:' || protocol === 'postgres:') return '5432';
  return '';
}

function assertNoSecretLeak(output, loadedFiles) {
  for (const file of loadedFiles) {
    for (const key of [
      'DB_PRINCIPAL_SIGNING_SECRET',
      'DATABASE_URL',
      'INTERNAL_JOB_SECRET',
      ...WEBAPP_DATABASE_URL_KEYS,
      ...INTEGRATOR_OPERATIONAL_URL_KEYS,
    ]) {
      const value = file.values.get(key);
      if (value && output.includes(value)) {
        fail(`preflight output leaked ${key} from ${file.processName}`);
      }
    }
  }
}

function validateLoadedFiles(loadedFiles) {
  const seen = new Map();
  for (const file of loadedFiles) {
    if (seen.has(file.processName)) {
      fail(`duplicate env file for ${file.processName}`);
    }
    seen.set(file.processName, file);
  }

  for (const processName of REQUIRED_PROCESS_NAMES) {
    if (!seen.has(processName)) {
      fail(`missing --env-file for ${processName}`);
    }
  }

  const signingFingerprints = new Map();
  for (const file of loadedFiles.filter((file) => file.processName !== 'media-worker')) {
    for (const key of REQUIRED_SHARED_KEYS) {
      if (!file.values.has(key) || !file.values.get(key)?.trim()) {
        fail(`${file.processName} missing ${key}`);
      }
    }
    const mode = file.values.get('DB_PRINCIPAL_CONTEXT_MODE');
    if (mode !== 'shadow' && mode !== 'locked') {
      fail(
        `${file.processName} DB_PRINCIPAL_CONTEXT_MODE must be shadow or locked for C2 preflight`,
      );
    }
    const secret = file.values.get('DB_PRINCIPAL_SIGNING_SECRET') ?? '';
    if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
      fail(
        `${file.processName} DB_PRINCIPAL_SIGNING_SECRET must be at least ${MIN_SECRET_BYTES} bytes`,
      );
    }
    signingFingerprints.set(file.processName, fingerprintSecret(secret));
  }

  const uniqueSigningFingerprints = new Set(signingFingerprints.values());
  if (uniqueSigningFingerprints.size !== 1) {
    fail('DB_PRINCIPAL_SIGNING_SECRET fingerprint mismatch across signing processes');
  }

  const webapp = seen.get('webapp');
  const mediaWorker = seen.get('media-worker');
  for (const key of mediaWorker?.values.keys() ?? []) {
    if (LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY.test(key)) {
      fail(`media-worker must not receive legacy database credential ${key}`);
    }
  }
  for (const key of MEDIA_CONTROL_KEYS) {
    if (!mediaWorker?.values.get(key)?.trim()) fail(`media-worker missing ${key}`);
  }
  if (
    mediaWorker?.values.get('DB_PRINCIPAL_CONTEXT_MODE')?.trim() ||
    mediaWorker?.values.get('DB_PRINCIPAL_SIGNING_SECRET')?.trim()
  ) {
    fail('media-worker must not receive DB principal configuration');
  }
  try {
    new URL(mediaWorker?.values.get('MEDIA_WORKER_CONTROL_URL') ?? '');
  } catch {
    fail('media-worker MEDIA_WORKER_CONTROL_URL must be an HTTP URL');
  }
  if (
    mediaWorker?.values.get('INTERNAL_JOB_SECRET') !== webapp?.values.get('INTERNAL_JOB_SECRET')
  ) {
    fail('media-worker INTERNAL_JOB_SECRET must match webapp internal control secret');
  }
  for (const key of WEBAPP_DATABASE_URL_KEYS) {
    const value = webapp?.values.get(key)?.trim() ?? '';
    if (!value) {
      fail(`webapp missing ${key}`);
    }
    if (value.includes('://') && !/^postgres(?:ql)?:\/\//.test(value)) {
      fail(`webapp ${key} must be a PostgreSQL URL`);
    }
  }
  if (webapp?.values.get('DATABASE_URL_STAFF') === webapp?.values.get('DATABASE_URL_NONSTAFF')) {
    fail(
      'webapp DATABASE_URL_STAFF and DATABASE_URL_NONSTAFF must not be identical for C2 dual-login preflight',
    );
  }
  const operatorUrl = webapp?.values.get('SAAS_ISOLATION_OPERATOR_DATABASE_URL');
  if (
    operatorUrl === webapp?.values.get('DATABASE_URL_STAFF') ||
    operatorUrl === webapp?.values.get('DATABASE_URL_NONSTAFF')
  ) {
    fail('webapp SAAS_ISOLATION_OPERATOR_DATABASE_URL must use a separate operator login');
  }

  const integrator = seen.get('integrator');
  const operationalUrls = INTEGRATOR_OPERATIONAL_URL_KEYS.map((key) => {
    const value = integrator?.values.get(key)?.trim() ?? '';
    if (!value) fail(`integrator missing ${key}`);
    if (!/^postgres(?:ql)?:\/\//.test(value)) fail(`integrator ${key} must be a PostgreSQL URL`);
    return [key, value];
  });
  const integratorBaseUrl = integrator?.values.get('DATABASE_URL')?.trim() ?? '';
  if (!/^postgres(?:ql)?:\/\//.test(integratorBaseUrl))
    fail('integrator DATABASE_URL must be a PostgreSQL URL');
  const runtimeUrls = [integratorBaseUrl, ...operationalUrls.map(([, value]) => value)];
  if (new Set(runtimeUrls).size !== runtimeUrls.length) {
    fail('integrator operational DATABASE_URL values must use distinct login credentials');
  }
  const runtimeUsernames = [
    databaseUrlUsername(integratorBaseUrl, 'integrator DATABASE_URL'),
    ...operationalUrls.map(([key, value]) => databaseUrlUsername(value, `integrator ${key}`)),
  ];
  if (new Set(runtimeUsernames).size !== runtimeUsernames.length) {
    fail('integrator operational DATABASE_URL values must use distinct PostgreSQL login roles');
  }
  const allRuntimeUsernames = [
    ...WEBAPP_DATABASE_URL_KEYS.map((key) =>
      databaseUrlUsername(webapp?.values.get(key) ?? '', `webapp ${key}`),
    ),
    ...runtimeUsernames,
  ];
  if (new Set(allRuntimeUsernames).size !== allRuntimeUsernames.length) {
    fail(
      'all webapp, integrator, and operator runtime URLs must use distinct PostgreSQL login roles',
    );
  }

  return {
    signingFingerprint: [...uniqueSigningFingerprints][0],
    webappStaffUrlShape: fingerprintUrlHost(webapp?.values.get('DATABASE_URL_STAFF') ?? ''),
    webappNonstaffUrlShape: fingerprintUrlHost(webapp?.values.get('DATABASE_URL_NONSTAFF') ?? ''),
    webappOperatorUrlShape: fingerprintUrlHost(
      webapp?.values.get('SAAS_ISOLATION_OPERATOR_DATABASE_URL') ?? '',
    ),
    integratorOperationalUrlShapes: Object.fromEntries(
      operationalUrls.map(([key, value]) => [key, fingerprintUrlHost(value)]),
    ),
    mediaWorkerControlUrlShape: fingerprintUrlHost(
      mediaWorker?.values.get('MEDIA_WORKER_CONTROL_URL') ?? '',
    ),
  };
}

function renderReport(loadedFiles, summary) {
  const lines = [
    'saas-c2-secret-preflight: OK',
    `signing_secret_sha256_16=${summary.signingFingerprint}`,
    `webapp_DATABASE_URL_STAFF_shape=${summary.webappStaffUrlShape}`,
    `webapp_DATABASE_URL_NONSTAFF_shape=${summary.webappNonstaffUrlShape}`,
    `webapp_SAAS_ISOLATION_OPERATOR_DATABASE_URL_shape=${summary.webappOperatorUrlShape}`,
    ...Object.entries(summary.integratorOperationalUrlShapes).map(
      ([key, value]) => `integrator_${key}_shape=${value}`,
    ),
    `media-worker_CONTROL_URL_shape=${summary.mediaWorkerControlUrlShape}`,
    'restart_order=webapp integrator worker scheduler media-worker',
    'rollback_order=restore previous root-managed env files, restart same units, rerun this preflight',
  ];
  for (const file of loadedFiles) {
    lines.push(
      `process=${file.processName} env_file=${file.basename} mode=${file.values.get('DB_PRINCIPAL_CONTEXT_MODE')}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function runPreflightFromSpecs(specs) {
  const loadedFiles = specs.map(loadEnvFile);
  const summary = validateLoadedFiles(loadedFiles);
  const output = renderReport(loadedFiles, summary);
  assertNoSecretLeak(output, loadedFiles);
  return output;
}

function runSelfTest() {
  const sharedSecret = randomBytes(40).toString('base64url');
  const fixtureFiles = [
    {
      basename: 'webapp.fixture',
      path: '/tmp/webapp.fixture',
      processName: 'webapp',
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=shadow
DB_PRINCIPAL_SIGNING_SECRET='${sharedSecret}'
DATABASE_URL_STAFF=postgres://staff:staff-secret@127.0.0.1:5432/bersoncarebot_test
DATABASE_URL_NONSTAFF=postgres://nonstaff:nonstaff-secret@127.0.0.1:5432/bersoncarebot_test
SAAS_ISOLATION_OPERATOR_DATABASE_URL=postgres://saas_operator:operator-secret@127.0.0.1:5432/bersoncarebot_test
INTERNAL_JOB_SECRET=control-secret
`),
    },
    {
      basename: 'api.fixture',
      path: '/tmp/api.fixture',
      processName: 'integrator',
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=shadow
DB_PRINCIPAL_SIGNING_SECRET=${sharedSecret}
DATABASE_URL=postgres://integrator:secret@127.0.0.1:5432/bersoncarebot_test
DATABASE_URL_DIAGNOSTIC=postgres://diagnostic:secret@127.0.0.1:5432/bersoncarebot_test
DATABASE_URL_DELIVERY_WORKER=postgres://delivery:secret@127.0.0.1:5432/bersoncarebot_test
DATABASE_URL_SCHEDULER=postgres://scheduler:secret@127.0.0.1:5432/bersoncarebot_test
`),
    },
    {
      basename: 'media.fixture',
      path: '/tmp/media.fixture',
      processName: 'media-worker',
      values: parseEnvText(`
MEDIA_WORKER_CONTROL_URL=http://127.0.0.1:6200
INTERNAL_JOB_SECRET=control-secret
`),
    },
  ];
  const summary = validateLoadedFiles(fixtureFiles);
  const output = renderReport(fixtureFiles, summary);
  assertNoSecretLeak(output, fixtureFiles);

  const brokenSecret = fixtureFiles.map((file) =>
    file.processName === 'integrator'
      ? {
          ...file,
          values: new Map(file.values).set(
            'DB_PRINCIPAL_SIGNING_SECRET',
            randomBytes(40).toString('base64url'),
          ),
        }
      : file,
  );
  const brokenCrossProcessUsername = fixtureFiles.map((file) =>
    file.processName === 'integrator'
      ? {
          ...file,
          values: new Map(file.values).set(
            'DATABASE_URL_DIAGNOSTIC',
            'postgres://staff:different-secret@127.0.0.1:5432/bersoncarebot_test',
          ),
        }
      : file,
  );
  const brokenOperationalUsername = fixtureFiles.map((file) =>
    file.processName === 'integrator'
      ? {
          ...file,
          values: new Map(file.values).set(
            'DATABASE_URL_SCHEDULER',
            'postgres://delivery:different-secret@127.0.0.1:5432/bersoncarebot_test',
          ),
        }
      : file,
  );
  let detected = 0;
  const brokenMediaSecret = fixtureFiles.map((file) =>
    file.processName === 'media-worker'
      ? { ...file, values: new Map(file.values).set('INTERNAL_JOB_SECRET', 'wrong-control-secret') }
      : file,
  );
  const brokenLegacyMediaDatabaseUrl = fixtureFiles.map((file) =>
    file.processName === 'media-worker'
      ? { ...file, values: new Map(file.values).set('DATABASE_URL', '') }
      : file,
  );
  const brokenLegacyMediaCertificate = fixtureFiles.map((file) =>
    file.processName === 'media-worker'
      ? { ...file, values: new Map(file.values).set('MEDIA_WORKER_CERT', 'legacy-cert') }
      : file,
  );
  for (const broken of [
    brokenSecret,
    brokenCrossProcessUsername,
    brokenOperationalUsername,
    brokenMediaSecret,
    brokenLegacyMediaDatabaseUrl,
    brokenLegacyMediaCertificate,
  ]) {
    try {
      validateLoadedFiles(broken);
    } catch {
      detected += 1;
    }
  }
  if (detected !== 6) fail('self-test did not detect all secret/login collision regressions');
  console.log('saas-c2-secret-preflight self-test: OK');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
  } else {
    process.stdout.write(runPreflightFromSpecs(options.envFiles));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`saas-c2-secret-preflight: ${message}`);
  process.exit(1);
}
