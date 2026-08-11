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

const TEST_PATHS = {
  api: '/opt/env/bersoncarebot/api.test',
  webapp: '/opt/env/bersoncarebot/webapp.test',
  media: '/opt/env/bersoncarebot/media-worker.test',
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
const LEGACY_MEDIA_DATABASE_CREDENTIAL_KEY =
  /^(?:DATABASE_URL(?:_[A-Z0-9_]+)?|DB_PRINCIPAL_[A-Z0-9_]+|PG[A-Z0-9_]*|MEDIA(?:_WORKER)?_(?:(?:[A-Z0-9]+_)*(?:DATABASE|DB|POSTGRES|POSTGRESQL|PG|SSL[A-Z0-9]*|CERT(?:IFICATE)?|CA|PASSWORD|PASS|KEY)(?:_[A-Z0-9]+)*))$/;

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

function assertRegular(path, allowMissing = false) {
  try {
    if (!lstatSync(path).isFile()) fail(`${path} must be a regular file`);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return false;
    throw error;
  }
  return true;
}

function writeProtected(path, content, ownerUid, deployGid) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  chownSync(temporary, ownerUid, deployGid);
  chmodSync(temporary, 0o640);
  renameSync(temporary, path);
}

function bootstrap({ apiPath, webappPath, mediaPath, ownerUid = 0, deployGid, write = true }) {
  assertRegular(apiPath);
  assertRegular(webappPath);
  const mediaExists = assertRegular(mediaPath, true);
  const apiText = readFileSync(apiPath, 'utf8');
  const webappText = readFileSync(webappPath, 'utf8');
  const api = parseEnv(apiText, 'api.test');
  const webapp = parseEnv(webappText, 'webapp.test');
  const baseUrl = api.get('DATABASE_URL');
  if (!baseUrl) fail('api.test is missing DATABASE_URL');
  validateBaseUrl(baseUrl);

  for (const key of ['DB_PRINCIPAL_CONTEXT_MODE', 'DB_PRINCIPAL_SIGNING_SECRET']) {
    if (!api.get(key) || api.get(key) !== webapp.get(key))
      fail(`${key} must be present and equal in api.test/webapp.test`);
  }
  if (!['shadow', 'locked'].includes(api.get('DB_PRINCIPAL_CONTEXT_MODE'))) {
    fail('TEST principal mode must be shadow or locked');
  }

  const apiAdditions = new Map();
  for (const [key, role] of OPERATIONAL_KEYS) {
    apiAdditions.set(key, api.get(key) || makeUrl(baseUrl, role));
  }
  const webappAdditions = new Map([['ALLOW_DEV_AUTH_BYPASS', 'false']]);

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
    const media = new Map([
      ['NODE_ENV', 'production'],
      ...mediaAdditions,
    ]);
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
    writeProtected(mediaPath, mediaText, ownerUid, deployGid);
    writeProtected(apiPath, upsertEnv(apiText, apiAdditions), ownerUid, deployGid);
    writeProtected(webappPath, upsertEnv(webappText, webappAdditions), ownerUid, deployGid);
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
    writeFileSync(webapp, "NODE_ENV='production'\nALLOW_DEV_AUTH_BYPASS='true'\nAPP_BASE_URL='http://127.0.0.1:6200'\nINTERNAL_JOB_SECRET='control-secret'\n" + common);
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
    writeFileSync(
      media,
      `${readFileSync(media, 'utf8')}PGSSLMODE='verify-full'\nPGSSLCRL='/tmp/crl'\nPGSSLCRLDIR='/tmp/crl.d'\nPGSSLMINPROTOCOLVERSION='TLSv1.3'\nMEDIA_WORKER_CA='ca'\nMEDIA_DATABASE_CA='ca'\nMEDIA_POSTGRESQL_URL='postgresql://legacy:secret@127.0.0.1/db'\n`,
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
    console.log('bootstrap-c4-test-env self-test: OK');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  if (process.getuid() !== 0) fail('run as root');
  if (process.argv.length !== 3 || !['--check', '--execute'].includes(process.argv[2])) {
    fail('usage: bootstrap-c4-test-env.mjs --check|--execute');
  }
  const deployGid = Number(execFileSync('id', ['-g', 'deploy'], { encoding: 'utf8' }).trim());
  const write = process.argv[2] === '--execute';
  bootstrap({
    apiPath: TEST_PATHS.api,
    webappPath: TEST_PATHS.webapp,
    mediaPath: TEST_PATHS.media,
    deployGid,
    write,
  });
  console.log(
    write
      ? 'C4 TEST env bootstrap: OK (api.test, webapp.test, media-worker.test; root:deploy 0640; secrets redacted)'
      : 'C4 TEST env bootstrap preflight: OK (no files written; secrets redacted)',
  );
}
