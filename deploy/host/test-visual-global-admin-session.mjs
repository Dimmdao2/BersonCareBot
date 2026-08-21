#!/usr/bin/env node
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readSmokeLoginPacket } from './smoke-login-packet.mjs';

const sessionCookieName = 'bersoncare_webapp_session';
const purpose = 'test_global_admin_visual';
const testBaseUrl = 'https://test.bersoncare.ru';
const publicCookieHost = 'test.bersoncare.ru';
const smokeLoginPacketPath = '/opt/env/bersoncarebot/saas-smoke-login.env';
const webappEnvPath = '/opt/env/bersoncarebot/webapp.test';
const outputDirectory = '/run/bersoncarebot-visual';
const outputPath = path.join(outputDirectory, 'global-admin.cookies');
const defaultTtlSeconds = 30 * 60;
const minTtlSeconds = 5 * 60;
const maxTtlSeconds = 60 * 60;

function resolveDeployGroupId(groupFile = '/etc/group') {
  const line = readFileSync(groupFile, 'utf8').split(/\r?\n/).find((candidate) => candidate.startsWith('deploy:'));
  const groupId = Number((line?.split(':') ?? [])[2]);
  if (!Number.isSafeInteger(groupId) || groupId < 0) fail('deploy_group_not_found');
  return groupId;
}

function fail(code) {
  throw new Error(code);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function decodeSignedSession(raw, secret) {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret)))
    fail('invalid_session_signature');
  let session;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    fail('invalid_session_payload');
  }
  return session;
}

function boundAdminSession(raw, secret, ttlSeconds, nowSec = Math.floor(Date.now() / 1000)) {
  const session = decodeSignedSession(raw, secret);
  if (session?.user?.role !== 'admin') fail('global_admin_role_required');
  const expiresAt = nowSec + ttlSeconds;
  const bounded = {
    ...session,
    issuedAt: nowSec,
    expiresAt,
    staffSecurity: { assurance: 'factor_verified', verifiedAt: nowSec },
    operatorSession: { purpose, expiresAt },
  };
  const payload = Buffer.from(JSON.stringify(bounded)).toString('base64url');
  return { cookie: `${payload}.${sign(payload, secret)}`, expiresAt };
}

function parseEnvFile(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) fail('malformed_env_line');
    const key = match[1];
    if (values.has(key)) fail(`duplicate_env_key:${key}`);
    const encoded = match[2].trim();
    let value;
    if (
      (encoded.startsWith('"') && encoded.endsWith('"')) ||
      (encoded.startsWith("'") && encoded.endsWith("'"))
    ) {
      value = encoded.slice(1, -1);
    } else {
      value = encoded.replace(/\s+#.*$/, '').trim();
    }
    values.set(key, value);
  }
  return values;
}

function parseTestWebappConfigText(text) {
  const values = parseEnvFile(text);
  const databaseUrl = values.get('DATABASE_URL_GLOBAL_ADMIN');
  const secret = values.get('SESSION_COOKIE_SECRET');
  if (!databaseUrl) fail('missing_env_key:DATABASE_URL_GLOBAL_ADMIN');
  if (!secret) fail('missing_env_key:SESSION_COOKIE_SECRET');
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    fail('invalid_test_database_url');
  }
  if (parsedDatabaseUrl.protocol !== 'postgresql:' && parsedDatabaseUrl.protocol !== 'postgres:') {
    fail('test_database_must_use_postgresql');
  }
  if (parsedDatabaseUrl.hostname !== '127.0.0.1' || (parsedDatabaseUrl.port || '5432') !== '5432') {
    fail('test_database_must_be_local_127_0_0_1_5432');
  }
  if (!parsedDatabaseUrl.username) fail('test_database_username_required');
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ''));
  if (databaseName !== 'bersoncarebot_test') fail('refusing_non_test_database');
  if (secret.length < 16) fail('session_secret_too_short');
  return { secret };
}

function readTestWebappConfig(filePath = webappEnvPath, expectedGroupId = resolveDeployGroupId()) {
  const metadata = lstatSync(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) fail('webapp_test_env_must_be_regular_file');
  if (metadata.uid !== 0 || metadata.gid !== expectedGroupId || (metadata.mode & 0o777) !== 0o640) {
    fail('webapp_test_env_metadata_must_be_root_deploy_0640');
  }
  return parseTestWebappConfigText(readFileSync(filePath, 'utf8'));
}

function parseSystemdProperties(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function parseSsListenerRecords(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(/\s+/);
      if (fields.length < 6 || fields[0] !== 'LISTEN') fail('invalid_ss_listener_record');
      return {
        localAddress: fields[3],
        process: fields.slice(5).join(' '),
      };
    });
}

function assertTestWebappListenerIdentity() {
  const unit = 'bersoncarebot-webapp-test.service';
  const output = execFileSync(
    '/usr/bin/systemctl',
    [
      'show',
      unit,
      '--no-pager',
      '--property=ActiveState,SubState,MainPID,User,Group,WorkingDirectory',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const properties = parseSystemdProperties(output);
  if (
    properties.get('ActiveState') !== 'active' ||
    properties.get('SubState') !== 'running' ||
    properties.get('User') !== 'bcb-web-test' ||
    properties.get('Group') !== 'bcb-web-test' ||
    properties.get('WorkingDirectory') !==
      '/opt/projects/bersoncarebot-test/apps/webapp/.next/standalone/apps/webapp'
  ) {
    fail('test_webapp_systemd_identity_mismatch');
  }
  const pid = Number(properties.get('MainPID'));
  if (!Number.isSafeInteger(pid) || pid <= 1) fail('test_webapp_main_pid_invalid');
  const listenerProof = execFileSync('/usr/bin/ss', ['-H', '-ltnp', 'sport', '=', ':6300'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const listeners = parseSsListenerRecords(listenerProof);
  const expectedPid = new RegExp(`(?:^|[,(])pid=${pid}(?:,|\\))`);
  if (
    !listeners.some(
      (listener) =>
        listener.localAddress === '127.0.0.1:6300' && expectedPid.test(listener.process),
    )
  ) {
    fail('test_webapp_loopback_listener_identity_mismatch');
  }
}

function extractSessionCookie(headers) {
  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const match = new RegExp(`(?:^|,\\s*)${sessionCookieName}=([^;,\\s]+)`).exec(value);
    if (match?.[1]) return match[1];
  }
  fail('session_cookie_missing');
}

async function postJson(url, body, cookie) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://${publicCookieHost}`,
      'Sec-Fetch-Site': 'same-origin',
      ...(cookie ? { Cookie: `${sessionCookieName}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) fail(`ordinary_auth_http_${response.status}`);
  return response;
}

function writeJar({ filePath, cookie, expiresAt, uid, gid }) {
  const directory = path.dirname(filePath);
  if (existsSync(directory)) {
    const directoryMetadata = lstatSync(directory);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink())
      fail('handoff_directory_must_be_real');
  } else {
    mkdirSync(directory, { recursive: true, mode: 0o750 });
  }
  chownSync(directory, uid, gid);
  chmodSync(directory, 0o750);
  const securedDirectoryMetadata = lstatSync(directory);
  if (
    !securedDirectoryMetadata.isDirectory() ||
    securedDirectoryMetadata.isSymbolicLink() ||
    securedDirectoryMetadata.uid !== uid ||
    securedDirectoryMetadata.gid !== gid ||
    (securedDirectoryMetadata.mode & 0o777) !== 0o750
  ) {
    fail('handoff_directory_metadata_postcondition_failed');
  }
  if (existsSync(filePath)) fail('active_handoff_exists_revoke_first');
  const temporary = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const contents = [
    '# Netscape HTTP Cookie File',
    '# BersonCare TEST visual handoff; never commit or copy to chat.',
    `${publicCookieHost}\tFALSE\t/\tTRUE\t${expiresAt}\t${sessionCookieName}\t${cookie}`,
    '',
  ].join('\n');
  writeFileSync(temporary, contents, { mode: 0o640, flag: 'wx' });
  chownSync(temporary, uid, gid);
  chmodSync(temporary, 0o640);
  renameSync(temporary, filePath);
  const metadata = lstatSync(filePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== uid ||
    metadata.gid !== gid ||
    (metadata.mode & 0o777) !== 0o640
  ) {
    rmSync(filePath, { force: true });
    fail('handoff_metadata_postcondition_failed');
  }
}

function readJarExpiry(filePath) {
  const line = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(`\t${sessionCookieName}\t`));
  const expiresAt = Number(line?.split('\t')[4]);
  if (!Number.isSafeInteger(expiresAt)) fail('invalid_handoff_cookie_jar');
  return expiresAt;
}

function resolveDevIdentity() {
  const passwd = readFileSync('/etc/passwd', 'utf8')
    .split(/\r?\n/)
    .find((line) => line.startsWith('dev:'));
  const fields = passwd?.split(':') ?? [];
  const uid = Number(fields[2]);
  const gid = Number(fields[3]);
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid)) fail('dev_identity_missing');
  return { uid, gid };
}

async function issue(ttlSeconds) {
  if (process.getuid?.() !== 0) fail('issue_requires_root');
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < minTtlSeconds ||
    ttlSeconds > maxTtlSeconds
  ) {
    fail('ttl_out_of_range_300_3600');
  }
  const { secret } = readTestWebappConfig();
  assertTestWebappListenerIdentity();
  const packet = readSmokeLoginPacket(smokeLoginPacketPath);
  const loginResponse = await postJson(`${testBaseUrl}/api/auth/email-password/login`, {
    email: packet.SAAS_SMOKE_GLOBAL_ADMIN_EMAIL,
    password: packet.SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD,
  });
  const loginCookie = extractSessionCookie(loginResponse.headers);
  const bounded = boundAdminSession(loginCookie, secret, ttlSeconds);
  const dev = resolveDevIdentity();
  writeJar({
    filePath: outputPath,
    cookie: bounded.cookie,
    expiresAt: bounded.expiresAt,
    uid: 0,
    gid: dev.gid,
  });
  process.stdout.write(
    `TEST visual global-admin handoff issued\npath=${outputPath}\nexpires_at=${new Date(bounded.expiresAt * 1000).toISOString()}\n`,
  );
}

function status(filePath = outputPath) {
  if (!existsSync(filePath)) {
    process.stdout.write('TEST visual global-admin handoff: absent\n');
    return;
  }
  const expiresAt = readJarExpiry(filePath);
  const state = expiresAt > Math.floor(Date.now() / 1000) ? 'active' : 'expired';
  process.stdout.write(
    `TEST visual global-admin handoff: ${state}\nexpires_at=${new Date(expiresAt * 1000).toISOString()}\n`,
  );
}

function revoke(filePath = outputPath) {
  if (process.getuid?.() !== 0) fail('revoke_requires_root');
  if (existsSync(filePath)) {
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail('refusing_non_regular_handoff');
    rmSync(filePath);
  }
  process.stdout.write('TEST visual global-admin handoff: revoked\n');
}

function selfTest() {
  const root = mkdtempSync(path.join(tmpdir(), 'bcb-test-visual-session-'));
  try {
    const secret = 'self-test-secret-at-least-16-bytes';
    const now = Math.floor(Date.now() / 1000);
    const session = {
      user: { userId: 'self-test', role: 'admin', displayName: 'Self Test', bindings: {} },
      issuedAt: now,
      expiresAt: now + 90 * 86400,
    };
    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    const raw = `${payload}.${sign(payload, secret)}`;
    const bounded = boundAdminSession(raw, secret, 600, now);
    const decoded = decodeSignedSession(bounded.cookie, secret);
    if (
      decoded.expiresAt !== now + 600 ||
      decoded.operatorSession?.purpose !== purpose ||
      decoded.staffSecurity?.assurance !== 'factor_verified'
    )
      fail('self_test_bound_failed');
    const jar = path.join(root, 'global-admin.cookies');
    writeJar({
      filePath: jar,
      cookie: bounded.cookie,
      expiresAt: bounded.expiresAt,
      uid: process.getuid?.() ?? 0,
      gid: process.getgid?.() ?? 0,
    });
    if (readJarExpiry(jar) !== now + 600) fail('self_test_jar_failed');
    let overwriteRejected = false;
    try {
      writeJar({
        filePath: jar,
        cookie: bounded.cookie,
        expiresAt: bounded.expiresAt,
        uid: process.getuid?.() ?? 0,
        gid: process.getgid?.() ?? 0,
      });
    } catch {
      overwriteRejected = true;
    }
    if (!overwriteRejected) fail('self_test_overwrite_accepted');
    const realDirectory = path.join(root, 'real-directory');
    const linkedDirectory = path.join(root, 'linked-directory');
    mkdirSync(realDirectory, { mode: 0o750 });
    symlinkSync(realDirectory, linkedDirectory);
    let symlinkRejected = false;
    try {
      writeJar({
        filePath: path.join(linkedDirectory, 'global-admin.cookies'),
        cookie: bounded.cookie,
        expiresAt: bounded.expiresAt,
        uid: process.getuid?.() ?? 0,
        gid: process.getgid?.() ?? 0,
      });
    } catch {
      symlinkRejected = true;
    }
    if (!symlinkRejected) fail('self_test_symlink_directory_accepted');
    const envSecret = 'redacted-self-test-session-secret';
    const validEnv = `DATABASE_URL_GLOBAL_ADMIN=postgresql://test_user:test-password@127.0.0.1:5432/bersoncarebot_test\nSESSION_COOKIE_SECRET=${envSecret}\n`;
    if (parseTestWebappConfigText(validEnv).secret !== envSecret)
      fail('self_test_env_parse_failed');
    for (const invalidEnv of [
      `${validEnv}DATABASE_URL_GLOBAL_ADMIN=postgresql://test_user:test-password@127.0.0.1:5432/bersoncarebot_test\n`,
      validEnv.replace('127.0.0.1', 'db.example.test'),
      validEnv.replace(':5432/', ':5433/'),
      validEnv.replace('bersoncarebot_test', 'bersoncarebot_other'),
      `${validEnv}this is not an env assignment\n`,
    ]) {
      let rejected = false;
      try {
        parseTestWebappConfigText(invalidEnv);
      } catch (error) {
        rejected = true;
        if (String(error).includes(envSecret)) fail('self_test_secret_leaked_in_error');
      }
      if (!rejected) fail('self_test_unsafe_env_accepted');
    }
    const serviceProperties = parseSystemdProperties(
      [
        'ActiveState=active',
        'SubState=running',
        'MainPID=1234',
        'User=bcb-web-test',
        'Group=bcb-web-test',
        'WorkingDirectory=/opt/projects/bersoncarebot-test/apps/webapp/.next/standalone/apps/webapp',
      ].join('\n'),
    );
    if (serviceProperties.get('MainPID') !== '1234') fail('self_test_systemd_parse_failed');
    const listeners = parseSsListenerRecords(
      [
        'LISTEN 0 511 127.0.0.1:6300 0.0.0.0:* users:(("node",pid=1234,fd=20))',
        'LISTEN 0 511 127.0.0.1:6400 0.0.0.0:* users:(("node",pid=9999,fd=21))',
      ].join('\n'),
    );
    const matchingListener = listeners.find(
      (listener) =>
        listener.localAddress === '127.0.0.1:6300' &&
        /(?:^|[,(])pid=1234(?:,|\))/.test(listener.process),
    );
    if (!matchingListener) fail('self_test_structured_listener_parse_failed');
    const crossRecordAccepted = listeners.some(
      (listener) =>
        listener.localAddress === '127.0.0.1:6300' &&
        /(?:^|[,(])pid=9999(?:,|\))/.test(listener.process),
    );
    if (crossRecordAccepted) fail('self_test_cross_record_listener_identity_accepted');
    rmSync(jar);
    if (existsSync(jar)) fail('self_test_revoke_failed');
    process.stdout.write('test-visual-global-admin-session self-test: OK\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'issue') {
    const ttlIndex = args.indexOf('--ttl-seconds');
    const ttl = ttlIndex >= 0 ? Number(args[ttlIndex + 1]) : defaultTtlSeconds;
    await issue(ttl);
  } else if (command === 'status') {
    status();
  } else if (command === 'revoke') {
    revoke();
  } else if (command === '--self-test') {
    selfTest();
  } else {
    fail(
      'usage: test-visual-global-admin-session.mjs issue [--ttl-seconds 300..3600] | status | revoke | --self-test',
    );
  }
} catch (error) {
  process.stderr.write(
    `TEST visual global-admin handoff failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
  );
  process.exitCode = 1;
}
