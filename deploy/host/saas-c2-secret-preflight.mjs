#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const REQUIRED_PROCESS_NAMES = new Set(['webapp', 'integrator', 'media-worker']);
const SIGNING_PROCESS_NAMES = ['webapp', 'integrator'];
const MEDIA_CONTROL_KEYS = ['MEDIA_WORKER_CONTROL_URL', 'INTERNAL_JOB_SECRET'];

/**
 * Deploy phases are NAMED, not merged into one global list of tolerated modes (W1, 27.08 audit).
 *
 * `final-runtime` is the env the shipped processes actually start from. `apps/webapp/src/config/env.ts`
 * refuses to boot outside `port-context` — the legacy principal-to-role mapping is not a fallback — so a
 * deploy that restarts the final webapp must require exactly that mode and exactly the pools it opens
 * (staff/patient/global-admin logins, one integrator login), not the retired signed-context credentials.
 *
 * `pre-cutover-source` is the entry state of the destructive TEST full reset: `locked` is a legitimate
 * SOURCE state that exists only until `deploy/host/cutover-postgres-port-context.sh` runs, so it is not
 * banned — but it is also not a runtime the final webapp may start in. The two phases therefore keep
 * disjoint mode and key contracts, and every caller names the phase it is in.
 */
const FINAL_RUNTIME_PHASE = 'final-runtime';
const PRE_CUTOVER_SOURCE_PHASE = 'pre-cutover-source';
const RUNTIME_PHASES = [FINAL_RUNTIME_PHASE, PRE_CUTOVER_SOURCE_PHASE];
const PHASE_MODE = {
  [FINAL_RUNTIME_PHASE]: 'port-context',
  [PRE_CUTOVER_SOURCE_PHASE]: 'locked',
};
/** Pools the port-context webapp/integrator runtimes actually open (`webappPoolProvider`, `config/env`). */
const FINAL_RUNTIME_WEBAPP_URL_KEYS = [
  'DATABASE_URL_STAFF',
  'DATABASE_URL_PATIENT',
  'DATABASE_URL_GLOBAL_ADMIN',
];
const FINAL_RUNTIME_INTEGRATOR_URL_KEYS = ['INTEGRATOR_DB_URL'];
/**
 * Credentials the port-context cutover removes from the final env files
 * (`PORT_CONTEXT_WEBAPP_REMOVALS` / `PORT_CONTEXT_API_REMOVALS` in `deploy/host/bootstrap-c4-test-env.mjs`).
 * Leaving them live would keep a retired signed-context login usable next to the narrow port-context ones.
 */
const FINAL_RUNTIME_RETIRED_KEYS = {
  webapp: [
    'DATABASE_URL',
    'DATABASE_URL_NONSTAFF',
    'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
    'DB_PRINCIPAL_SIGNING_SECRET',
  ],
  integrator: [
    'DATABASE_URL',
    'DATABASE_URL_DIAGNOSTIC',
    'DATABASE_URL_DELIVERY_WORKER',
    'DATABASE_URL_SCHEDULER',
    'DB_PRINCIPAL_SIGNING_SECRET',
  ],
};
const LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL(?:_[A-Z0-9_]+)?|DB_PRINCIPAL_[A-Z0-9_]+|PG[A-Z0-9_]*|(?:DATABASE|DB|POSTGRES|POSTGRESQL)_(?:URL|PASSWORD|PASS|CONNECTION_STRING)|MEDIA(?:_WORKER)?_(?:(?:[A-Z0-9]+_)*(?:DATABASE|DB|POSTGRES|POSTGRESQL|PG)(?:_[A-Z0-9]+)*|(?:[A-Z0-9]+_)*(?:CONNECTION_STRING|PASSWORD|PASS|SSL[A-Z0-9]*|CERT(?:IFICATE)?|CA|KEY)(?:_[A-Z0-9]+)*))$/;
const CROSS_PROCESS_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL_MEDIA_WORKER|MEDIA(?:_WORKER)?_(?:(?:[A-Z0-9]+_)*(?:DATABASE|DB|POSTGRES|POSTGRESQL|PG)(?:_[A-Z0-9]+)*|(?:[A-Z0-9]+_)*(?:CONNECTION_STRING|PASSWORD|PASS|SSL[A-Z0-9]*|CERT(?:IFICATE)?|CA|KEY)(?:_[A-Z0-9]+)*))$/;
/** Pre-cutover (`locked`) source env: dual webapp login plus the separate isolation-operator login. */
const WEBAPP_DATABASE_URL_KEYS = [
  'DATABASE_URL_STAFF',
  'DATABASE_URL_NONSTAFF',
  'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
];
/** Pre-cutover (`locked`) source env: three separate integrator operational contours. */
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
    runtimePhase: '',
  };
  for (const arg of argv) {
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (arg.startsWith('--runtime-phase=')) {
      const phase = arg.slice('--runtime-phase='.length);
      if (!RUNTIME_PHASES.includes(phase)) {
        fail(`--runtime-phase must be one of ${RUNTIME_PHASES.join(', ')}, got ${phase || '<empty>'}`);
      }
      if (options.runtimePhase) fail('--runtime-phase may be given only once');
      options.runtimePhase = phase;
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
  if (!options.selfTest && !options.runtimePhase) {
    fail(`--runtime-phase is required and must be one of ${RUNTIME_PHASES.join(', ')}`);
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
      ...FINAL_RUNTIME_WEBAPP_URL_KEYS,
      ...FINAL_RUNTIME_INTEGRATOR_URL_KEYS,
    ]) {
      const value = file.values.get(key);
      if (value && output.includes(value)) {
        fail(`preflight output leaked ${key} from ${file.processName}`);
      }
    }
  }
}

/** Pre-cutover signed-context runtime: one shared secret, proven equal by fingerprint only. */
function validatePreCutoverSigningSecrets(seen) {
  const fingerprints = new Set();
  for (const processName of SIGNING_PROCESS_NAMES) {
    const secret = seen.get(processName)?.values.get('DB_PRINCIPAL_SIGNING_SECRET') ?? '';
    if (!secret.trim()) fail(`${processName} missing DB_PRINCIPAL_SIGNING_SECRET`);
    if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
      fail(`${processName} DB_PRINCIPAL_SIGNING_SECRET must be at least ${MIN_SECRET_BYTES} bytes`);
    }
    fingerprints.add(fingerprintSecret(secret));
  }
  if (fingerprints.size !== 1) {
    fail('DB_PRINCIPAL_SIGNING_SECRET fingerprint mismatch across signing processes');
  }
  return [...fingerprints][0];
}

function requirePostgresUrl(file, processName, key) {
  const value = file?.values.get(key)?.trim() ?? '';
  if (!value) fail(`${processName} missing ${key}`);
  if (!/^postgres(?:ql)?:\/\//.test(value)) fail(`${processName} ${key} must be a PostgreSQL URL`);
  return value;
}

/**
 * Final port-context runtime: the narrow logins the processes actually open, and nothing retired
 * left usable beside them.
 */
function validateFinalRuntimeCredentials(seen) {
  for (const [processName, keys] of Object.entries(FINAL_RUNTIME_RETIRED_KEYS)) {
    for (const key of keys) {
      if (seen.get(processName)?.values.get(key)?.trim()) {
        fail(
          `${processName} must not declare retired pre-port-context credential ${key} in the ${FINAL_RUNTIME_PHASE} phase`,
        );
      }
    }
  }
  const urlEntries = [
    ...FINAL_RUNTIME_WEBAPP_URL_KEYS.map((key) => [
      `webapp_${key}`,
      requirePostgresUrl(seen.get('webapp'), 'webapp', key),
    ]),
    ...FINAL_RUNTIME_INTEGRATOR_URL_KEYS.map((key) => [
      `integrator_${key}`,
      requirePostgresUrl(seen.get('integrator'), 'integrator', key),
    ]),
  ];
  const values = urlEntries.map(([, value]) => value);
  if (new Set(values).size !== values.length) {
    fail('port-context runtime URLs must use distinct login credentials');
  }
  const usernames = urlEntries.map(([label, value]) => databaseUrlUsername(value, label));
  if (new Set(usernames).size !== usernames.length) {
    fail('port-context runtime URLs must use distinct PostgreSQL login roles');
  }
  return urlEntries;
}

function validateLoadedFiles(loadedFiles, runtimePhase) {
  if (!RUNTIME_PHASES.includes(runtimePhase)) {
    fail(`unknown runtime phase: ${runtimePhase || '<unset>'}`);
  }
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

  const expectedMode = PHASE_MODE[runtimePhase];
  for (const processName of SIGNING_PROCESS_NAMES) {
    const mode = seen.get(processName)?.values.get('DB_PRINCIPAL_CONTEXT_MODE')?.trim() ?? '';
    if (mode !== expectedMode) {
      fail(
        `${processName} DB_PRINCIPAL_CONTEXT_MODE must be ${expectedMode} in the ${runtimePhase} phase, got ${mode || '<unset>'}`,
      );
    }
  }

  const webapp = seen.get('webapp');
  const mediaWorker = seen.get('media-worker');
  for (const file of loadedFiles) {
    for (const key of file.values.keys()) {
      if (CROSS_PROCESS_MEDIA_DATABASE_CREDENTIAL_KEY.test(key)) {
        fail(`${file.processName} must not declare media-worker database credential ${key}`);
      }
      if (file.processName === 'media-worker' && LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY.test(key)) {
        fail(`media-worker must not receive legacy database credential ${key}`);
      }
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
    const controlUrl = new URL(mediaWorker?.values.get('MEDIA_WORKER_CONTROL_URL') ?? '');
    if (controlUrl.protocol !== 'http:' && controlUrl.protocol !== 'https:') throw new Error();
  } catch {
    fail('media-worker MEDIA_WORKER_CONTROL_URL must be an HTTP URL');
  }
  if (
    mediaWorker?.values.get('INTERNAL_JOB_SECRET') !== webapp?.values.get('INTERNAL_JOB_SECRET')
  ) {
    fail('media-worker INTERNAL_JOB_SECRET must match webapp internal control secret');
  }
  if (runtimePhase === FINAL_RUNTIME_PHASE) {
    return {
      runtimePhase,
      signingFingerprint: null,
      urlShapes: validateFinalRuntimeCredentials(seen).map(([label, value]) => [
        label,
        fingerprintUrlHost(value),
      ]),
    };
  }

  const signingFingerprint = validatePreCutoverSigningSecrets(seen);
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
    runtimePhase,
    signingFingerprint,
    urlShapes: [
      ...WEBAPP_DATABASE_URL_KEYS.map((key) => [
        `webapp_${key}`,
        fingerprintUrlHost(webapp?.values.get(key) ?? ''),
      ]),
      ...operationalUrls.map(([key, value]) => [`integrator_${key}`, fingerprintUrlHost(value)]),
    ],
  };
}

function renderReport(loadedFiles, summary) {
  const mediaWorker = loadedFiles.find((file) => file.processName === 'media-worker');
  const lines = [
    'saas-c2-secret-preflight: OK',
    `runtime_phase=${summary.runtimePhase}`,
    ...(summary.signingFingerprint
      ? [`signing_secret_sha256_16=${summary.signingFingerprint}`]
      : ['signing_secret=retired-in-port-context']),
    ...summary.urlShapes.map(([label, value]) => `${label}_shape=${value}`),
    `media-worker_CONTROL_URL_shape=${fingerprintUrlHost(mediaWorker?.values.get('MEDIA_WORKER_CONTROL_URL') ?? '')}`,
    'restart_order=webapp integrator worker scheduler media-worker',
    'rollback_order=restore previous root-managed env files, restart same units, rerun this preflight',
  ];
  for (const file of loadedFiles) {
    lines.push(
      `process=${file.processName} env_file=${file.basename} mode=${file.processName === 'media-worker' ? 'control-only' : file.values.get('DB_PRINCIPAL_CONTEXT_MODE')}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function runPreflightFromSpecs(specs, runtimePhase) {
  const loadedFiles = specs.map(loadEnvFile);
  const summary = validateLoadedFiles(loadedFiles, runtimePhase);
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
DB_PRINCIPAL_CONTEXT_MODE=locked
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
DB_PRINCIPAL_CONTEXT_MODE=locked
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
  const summary = validateLoadedFiles(fixtureFiles, PRE_CUTOVER_SOURCE_PHASE);
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
  const legacyMediaCredentialKeys = [
    'DATABASE_URL',
    'DB_PRINCIPAL_CONTEXT_MODE',
    'DB_PRINCIPAL_SIGNING_SECRET',
    'PGSSLMODE',
    'PGSSLCRL',
    'PGSSLCRLDIR',
    'PGSSLMINPROTOCOLVERSION',
    'MEDIA_WORKER_CA',
    'MEDIA_DATABASE_CA',
    'MEDIA_POSTGRESQL_URL',
    'POSTGRESQL_URL',
    'POSTGRES_URL',
    'POSTGRES_PASSWORD',
    'MEDIA_WORKER_CONNECTION_STRING',
    'MEDIA_CONNECTION_STRING',
    'DB_URL',
  ];
  const brokenLegacyMediaCredentials = legacyMediaCredentialKeys.map((key) =>
    fixtureFiles.map((file) =>
      file.processName === 'media-worker'
        ? { ...file, values: new Map(file.values).set(key, '') }
        : file,
    ),
  );
  const brokenFixtures = [
    brokenSecret,
    brokenCrossProcessUsername,
    brokenOperationalUsername,
    brokenMediaSecret,
    ...brokenLegacyMediaCredentials,
    ...['webapp', 'integrator', 'media-worker'].map((processName) =>
      fixtureFiles.map((file) =>
        file.processName === processName
          ? { ...file, values: new Map(file.values).set('DATABASE_URL_MEDIA_WORKER', '') }
          : file,
      ),
    ),
  ];
  for (const broken of brokenFixtures) {
    try {
      validateLoadedFiles(broken, PRE_CUTOVER_SOURCE_PHASE);
    } catch {
      detected += 1;
    }
  }
  if (detected !== brokenFixtures.length) {
    fail('self-test did not detect all secret/login collision regressions');
  }

  runFinalRuntimeSelfTest(fixtureFiles);
  console.log('saas-c2-secret-preflight self-test: OK');
}

/**
 * The phase the shipped processes start in. The two phases must reject each other's env shape: a
 * `locked` source env may not pass as final runtime, and the final port-context env may not be
 * judged by the retired signed-context contract.
 */
function runFinalRuntimeSelfTest(preCutoverFixtureFiles) {
  const finalRuntimeFixtures = [
    {
      basename: 'webapp.fixture',
      path: '/tmp/webapp.fixture',
      processName: 'webapp',
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=port-context
DATABASE_URL_STAFF=postgres://bcb_webapp_staff:staff-secret@127.0.0.1:5432/bersoncarebot
DATABASE_URL_PATIENT=postgres://bcb_webapp_patient:patient-secret@127.0.0.1:5432/bersoncarebot
DATABASE_URL_GLOBAL_ADMIN=postgres://bcb_webapp_global_admin:admin-secret@127.0.0.1:5432/bersoncarebot
INTERNAL_JOB_SECRET=control-secret
`),
    },
    {
      basename: 'api.fixture',
      path: '/tmp/api.fixture',
      processName: 'integrator',
      values: parseEnvText(`
DB_PRINCIPAL_CONTEXT_MODE=port-context
INTEGRATOR_DB_URL=postgres://bcb_integrator:integrator-secret@127.0.0.1:5432/bersoncarebot
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
  const summary = validateLoadedFiles(finalRuntimeFixtures, FINAL_RUNTIME_PHASE);
  assertNoSecretLeak(renderReport(finalRuntimeFixtures, summary), finalRuntimeFixtures);

  const withValue = (processName, key, value) =>
    finalRuntimeFixtures.map((file) =>
      file.processName === processName
        ? { ...file, values: new Map(file.values).set(key, value) }
        : file,
    );
  const withoutKey = (processName, key) =>
    finalRuntimeFixtures.map((file) => {
      if (file.processName !== processName) return file;
      const values = new Map(file.values);
      values.delete(key);
      return { ...file, values };
    });
  const brokenFinalRuntime = [
    // The runtime/deploy contradiction this phase exists to remove, both directions.
    withValue('webapp', 'DB_PRINCIPAL_CONTEXT_MODE', 'locked'),
    withValue('integrator', 'DB_PRINCIPAL_CONTEXT_MODE', 'shadow'),
    // Pools the final webapp/integrator actually open.
    withoutKey('webapp', 'DATABASE_URL_PATIENT'),
    withoutKey('webapp', 'DATABASE_URL_GLOBAL_ADMIN'),
    withoutKey('integrator', 'INTEGRATOR_DB_URL'),
    withValue(
      'webapp',
      'DATABASE_URL_PATIENT',
      'postgres://bcb_webapp_staff:staff-secret@127.0.0.1:5432/bersoncarebot',
    ),
    // Retired signed-context credentials must not stay live beside the narrow logins.
    ...FINAL_RUNTIME_RETIRED_KEYS.webapp.map((key) => withValue('webapp', key, 'still-here')),
    ...FINAL_RUNTIME_RETIRED_KEYS.integrator.map((key) =>
      withValue('integrator', key, 'still-here'),
    ),
  ];
  let detected = 0;
  for (const broken of brokenFinalRuntime) {
    try {
      validateLoadedFiles(broken, FINAL_RUNTIME_PHASE);
    } catch {
      detected += 1;
    }
  }
  if (detected !== brokenFinalRuntime.length) {
    fail('self-test did not detect all final-runtime port-context regressions');
  }
  try {
    validateLoadedFiles(preCutoverFixtureFiles, FINAL_RUNTIME_PHASE);
    fail('self-test accepted a pre-cutover source env as the final runtime');
  } catch (error) {
    if (/^self-test/.test(error instanceof Error ? error.message : '')) throw error;
  }
  try {
    validateLoadedFiles(finalRuntimeFixtures, PRE_CUTOVER_SOURCE_PHASE);
    fail('self-test accepted the final runtime env as a pre-cutover source');
  } catch (error) {
    if (/^self-test/.test(error instanceof Error ? error.message : '')) throw error;
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
  } else {
    process.stdout.write(runPreflightFromSpecs(options.envFiles, options.runtimePhase));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`saas-c2-secret-preflight: ${message}`);
  process.exit(1);
}
