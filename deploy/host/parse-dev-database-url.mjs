#!/usr/bin/env node

import { closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openCanonicalRegularFile } from './stream-canonical-sql.mjs';

function fail(code) {
  throw new Error(code);
}

export function parseDatabaseUrlKeyFromDotenv(text, requestedKey) {
  if (requestedKey !== 'DATABASE_URL') fail('unsupported_database_url_key');
  let databaseUrl;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) fail('invalid_dotenv_line');
    if (match[1] !== requestedKey) continue;
    if (databaseUrl !== undefined) fail('duplicate_database_url');

    const encoded = match[2].trim();
    if (!encoded) fail('missing_database_url');
    const quote = encoded[0];
    if (quote === '"' || quote === "'") {
      if (encoded.length < 2 || encoded.at(-1) !== quote) fail('invalid_database_url_quoting');
      databaseUrl = encoded.slice(1, -1);
    } else {
      if (/\s|["']/u.test(encoded)) fail('invalid_database_url_value');
      databaseUrl = encoded;
    }
    if (
      databaseUrl.includes('$') ||
      databaseUrl.includes('`') ||
      [...databaseUrl].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
      })
    ) {
      fail('unsafe_database_url_value');
    }
  }
  if (!databaseUrl) fail('missing_database_url');
  return databaseUrl;
}

export function parseDatabaseUrlFromDotenv(text) {
  return parseDatabaseUrlKeyFromDotenv(text, 'DATABASE_URL');
}

export function assertExactLocalDevDatabaseUrl(value) {
  if (value.includes('?') || value.includes('#')) fail('database_url_query_or_fragment_forbidden');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid_database_url');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:')
    fail('invalid_database_protocol');
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
    fail('non_local_database_host');
  if (parsed.port && parsed.port !== '5432') fail('invalid_database_port');
  if (parsed.pathname !== '/bcb_webapp_dev') fail('invalid_database_name');
  if (decodeURIComponent(parsed.username) !== 'bcb_webapp_dev_user') fail('invalid_database_user');
  return value;
}

export function renderExactLocalDevPgpass(value) {
  const parsed = new URL(assertExactLocalDevDatabaseUrl(value));
  const password = decodeURIComponent(parsed.password)
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:');
  return `*:*:bcb_webapp_dev:bcb_webapp_dev_user:${password}\n`;
}

function parseDotenv(text) {
  const values = new Map();
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match || values.has(match[1])) fail('invalid_or_duplicate_dotenv_entry');
    const encoded = match[2].trim();
    let value = encoded;
    if (encoded.startsWith('"') || encoded.startsWith("'")) {
      if (encoded.length < 2 || encoded.at(-1) !== encoded[0]) fail('invalid_dotenv_quoting');
      value = encoded.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function runtimePassword(values, key, expectedLogin) {
  const raw = values.get(key);
  if (!raw) fail(`missing_${key.toLowerCase()}`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`invalid_${key.toLowerCase()}`);
  }
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') ||
    (parsed.port && parsed.port !== '5432') ||
    parsed.pathname !== '/bcb_webapp_dev' ||
    decodeURIComponent(parsed.username) !== expectedLogin ||
    !parsed.password
  ) {
    fail(`${key.toLowerCase()}_identity_mismatch`);
  }
  const password = decodeURIComponent(parsed.password);
  if (
    [...password].some((character) => {
      const point = character.codePointAt(0);
      return point === undefined || point <= 0x1f || point === 0x7f;
    })
  ) {
    fail(`${key.toLowerCase()}_unsafe_password`);
  }
  return password;
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function renderDevReconcileEnv(apiText, webappText) {
  const api = parseDotenv(apiText);
  const webapp = parseDotenv(webappText);
  const entries = [
    [
      'BCB_DEV_INTEGRATOR_PASSWORD',
      runtimePassword(api, 'INTEGRATOR_DB_URL', 'bcb_dev_integrator'),
    ],
    [
      'BCB_DEV_WEBAPP_STAFF_PASSWORD',
      runtimePassword(webapp, 'DATABASE_URL_STAFF', 'bcb_dev_webapp_staff'),
    ],
    [
      'BCB_DEV_WEBAPP_PATIENT_PASSWORD',
      runtimePassword(webapp, 'DATABASE_URL_PATIENT', 'bcb_dev_webapp_patient'),
    ],
    [
      'BCB_DEV_WEBAPP_GLOBAL_ADMIN_PASSWORD',
      runtimePassword(webapp, 'DATABASE_URL_GLOBAL_ADMIN', 'bcb_dev_webapp_global_admin'),
    ],
  ];
  return `${entries.map(([key, value]) => `${key}=${shellSingleQuote(value)}`).join('\n')}\n`;
}

function readCanonicalEnvSnapshot(path) {
  const expectedPath = resolve(path);
  const descriptor = openCanonicalRegularFile(path, expectedPath);
  try {
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function selfTest() {
  const valid = 'postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev';
  if (
    assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(`A=1\nDATABASE_URL='${valid}'\n`)) !==
    valid
  ) {
    fail('self_test_valid_failed');
  }
  for (const sample of [
    'DATABASE_URL=x\nDATABASE_URL=y\n',
    'DATABASE_URL=$(cat /opt/env/secret)\n',
    'DATABASE_URL=postgresql://dev:x@127.0.0.1:5432/bcb_webapp_prod\n',
    'DATABASE_URL=postgresql://dev:x@example.test:5432/bcb_webapp_dev\n',
    'DATABASE_URL=postgresql://bcb_webapp_dev_user:x@127.0.0.1:5432/bcb_webapp_dev?host=example.test\n',
    'DATABASE_URL=postgresql://bcb_webapp_dev_user:x@127.0.0.1:5432/bcb_webapp_dev#fragment\n',
    'not dotenv\n',
  ]) {
    let rejected = false;
    try {
      assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(sample));
    } catch {
      rejected = true;
    }
    if (!rejected) fail('self_test_expected_rejection');
  }
}

if (process.argv[1]?.endsWith('parse-dev-database-url.mjs')) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--self-test') {
      selfTest();
      console.log('parse-dev-database-url self-test: OK');
    } else if (process.argv.length === 6 && process.argv[2] === '--write-reconcile-env') {
      const api = readCanonicalEnvSnapshot(process.argv[3]);
      const webapp = readCanonicalEnvSnapshot(process.argv[4]);
      writeFileSync(process.argv[5], renderDevReconcileEnv(api, webapp), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    } else if (process.argv.length === 5 && process.argv[2] === '--write-pgpass') {
      const databaseUrl = parseDatabaseUrlFromDotenv(readCanonicalEnvSnapshot(process.argv[3]));
      writeFileSync(process.argv[4], renderExactLocalDevPgpass(databaseUrl), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    } else if (process.argv.length === 3) {
      const text = readCanonicalEnvSnapshot(process.argv[2]);
      process.stdout.write(assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(text)));
    } else {
      fail('invalid_arguments');
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown_error';
    console.error(`parse-dev-database-url: ${code}`);
    process.exit(1);
  }
}
