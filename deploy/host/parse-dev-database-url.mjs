#!/usr/bin/env node

import { closeSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openCanonicalRegularFile } from './stream-canonical-sql.mjs';

function fail(code) {
  throw new Error(code);
}

export function parseDatabaseUrlKeyFromDotenv(text, requestedKey) {
  if (requestedKey !== 'DATABASE_URL' && requestedKey !== 'DATABASE_URL_NONSTAFF') {
    fail('unsupported_database_url_key');
  }
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

function parseExactScalarFromDotenv(text, requestedKey) {
  let value;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) fail('invalid_dotenv_line');
    if (match[1] !== requestedKey) continue;
    if (value !== undefined) fail(`duplicate_${requestedKey.toLowerCase()}`);

    const encoded = match[2].trim();
    if (!encoded) fail(`missing_${requestedKey.toLowerCase()}`);
    const quote = encoded[0];
    if (quote === '"' || quote === "'") {
      if (encoded.length < 2 || encoded.at(-1) !== quote) fail('invalid_scalar_quoting');
      value = encoded.slice(1, -1);
    } else {
      if (/\s|["']/u.test(encoded)) fail('invalid_scalar_value');
      value = encoded;
    }
  }
  if (value === undefined) fail(`missing_${requestedKey.toLowerCase()}`);
  return value;
}

export function parseDevPrincipalContextModeFromDotenv(text) {
  const value = parseExactScalarFromDotenv(text, 'DB_PRINCIPAL_CONTEXT_MODE');
  if (value !== 'shadow' && value !== 'locked') fail('invalid_db_principal_context_mode');
  return value;
}

export function parseDevPrincipalSigningSecretFromDotenv(text) {
  const value = parseExactScalarFromDotenv(text, 'DB_PRINCIPAL_SIGNING_SECRET');
  if (
    Buffer.byteLength(value, 'utf8') < 32 ||
    Buffer.byteLength(value, 'utf8') > 4096 ||
    !/^[A-Za-z0-9._~+/=-]+$/u.test(value)
  ) {
    fail('unsafe_db_principal_signing_secret');
  }
  return value;
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

export function assertExactLocalDevNonstaffDatabaseUrl(value) {
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
  if (decodeURIComponent(parsed.username) !== 'bcb_dev_runtime_nonstaff_login')
    fail('invalid_database_user');
  return value;
}

export function parseDevRuntimeSnapshot(text) {
  return {
    ownerDatabaseUrl: assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(text)),
    runtimeDatabaseUrl: assertExactLocalDevNonstaffDatabaseUrl(
      parseDatabaseUrlKeyFromDotenv(text, 'DATABASE_URL_NONSTAFF'),
    ),
    contextMode: parseDevPrincipalContextModeFromDotenv(text),
    signingSecret: parseDevPrincipalSigningSecretFromDotenv(text),
  };
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

async function waitForSecretRelease() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16) fail('invalid_snapshot_release');
  }
  if (input === 'GO\n') return true;
  if (input === 'ABORT\n') return false;
  fail('invalid_snapshot_release');
}

async function streamDevRuntimeSnapshot(path) {
  const snapshot = parseDevRuntimeSnapshot(readCanonicalEnvSnapshot(path));
  process.stdout.write(
    `${snapshot.ownerDatabaseUrl}\n${snapshot.runtimeDatabaseUrl}\n${snapshot.contextMode}\n`,
  );
  if (!(await waitForSecretRelease())) return;
  process.stdout.write(`${snapshot.signingSecret}\n`);
}

function selfTest() {
  const valid = 'postgresql://bcb_webapp_dev_user:secret@127.0.0.1:5432/bcb_webapp_dev';
  const validNonstaff =
    'postgresql://bcb_dev_runtime_nonstaff_login:secret@127.0.0.1:5432/bcb_webapp_dev';
  const validSigningSecret = 'dev-signing-secret-at-least-32-bytes-123456';
  if (
    assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(`A=1\nDATABASE_URL='${valid}'\n`)) !==
    valid
  ) {
    fail('self_test_valid_failed');
  }
  if (
    assertExactLocalDevNonstaffDatabaseUrl(
      parseDatabaseUrlKeyFromDotenv(
        `DATABASE_URL_NONSTAFF='${validNonstaff}'\n`,
        'DATABASE_URL_NONSTAFF',
      ),
    ) !== validNonstaff
  ) {
    fail('self_test_valid_nonstaff_failed');
  }
  if (parseDevPrincipalContextModeFromDotenv('DB_PRINCIPAL_CONTEXT_MODE=shadow\n') !== 'shadow') {
    fail('self_test_valid_context_mode_failed');
  }
  if (
    parseDevPrincipalSigningSecretFromDotenv(
      `DB_PRINCIPAL_SIGNING_SECRET='${validSigningSecret}'\n`,
    ) !== validSigningSecret
  ) {
    fail('self_test_valid_signing_secret_failed');
  }
  for (const forbiddenNonstaff of [
    valid,
    'postgresql://app_runtime_nonstaff_login:secret@127.0.0.1:5432/bcb_webapp_dev',
    'postgresql://bcb_test_operational_nonstaff:secret@127.0.0.1:5432/bcb_webapp_dev',
  ]) {
    let rejected = false;
    try {
      assertExactLocalDevNonstaffDatabaseUrl(forbiddenNonstaff);
    } catch {
      rejected = true;
    }
    if (!rejected) fail('self_test_expected_nonstaff_rejection');
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
  for (const sample of [
    'DB_PRINCIPAL_CONTEXT_MODE=legacy-guc\n',
    'DB_PRINCIPAL_CONTEXT_MODE=shadow\nDB_PRINCIPAL_CONTEXT_MODE=locked\n',
  ]) {
    let rejected = false;
    try {
      parseDevPrincipalContextModeFromDotenv(sample);
    } catch {
      rejected = true;
    }
    if (!rejected) fail('self_test_expected_context_mode_rejection');
  }
  for (const sample of [
    'DB_PRINCIPAL_SIGNING_SECRET=short\n',
    `DB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}\\suffix\n`,
    `DB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}\nDB_PRINCIPAL_SIGNING_SECRET=${validSigningSecret}\n`,
  ]) {
    let rejected = false;
    try {
      parseDevPrincipalSigningSecretFromDotenv(sample);
    } catch {
      rejected = true;
    }
    if (!rejected) fail('self_test_expected_signing_secret_rejection');
  }
}

if (process.argv[1]?.endsWith('parse-dev-database-url.mjs')) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--self-test') {
      selfTest();
      console.log('parse-dev-database-url self-test: OK');
    } else if (process.argv.length === 4 && process.argv[2] === '--snapshot-stream') {
      await streamDevRuntimeSnapshot(process.argv[3]);
    } else if (
      process.argv.length === 3 ||
      (process.argv.length === 4 &&
        ['--nonstaff', '--context-mode', '--signing-secret'].includes(process.argv[2]))
    ) {
      const mode = process.argv.length === 4 ? process.argv[2] : '--owner';
      const path = process.argv[mode === '--owner' ? 2 : 3];
      const text = readCanonicalEnvSnapshot(path);
      process.stdout.write(
        mode === '--nonstaff'
          ? assertExactLocalDevNonstaffDatabaseUrl(
              parseDatabaseUrlKeyFromDotenv(text, 'DATABASE_URL_NONSTAFF'),
            )
          : mode === '--context-mode'
            ? parseDevPrincipalContextModeFromDotenv(text)
            : mode === '--signing-secret'
              ? parseDevPrincipalSigningSecretFromDotenv(text)
              : assertExactLocalDevDatabaseUrl(parseDatabaseUrlFromDotenv(text)),
      );
    } else {
      fail('invalid_arguments');
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown_error';
    console.error(`parse-dev-database-url: ${code}`);
    process.exit(1);
  }
}
