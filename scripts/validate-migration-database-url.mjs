#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_TARGET_QUERY_KEYS = new Set([
  'host',
  'hostaddr',
  'port',
  'dbname',
  'database',
  'service',
  'options',
  'passfile',
  'sslcert',
  'sslkey',
]);

function fail(message) {
  throw new Error(message);
}

export function normalizeDatabaseHostname(value) {
  return value.trim().toLowerCase().replace(/\.+$/u, '');
}

function assertRawAuthorityPort(value) {
  const schemeEnd = value.indexOf('://');
  if (schemeEnd < 0) fail('invalid PostgreSQL URL authority');
  const authorityStart = schemeEnd + 3;
  const tail = value.slice(authorityStart);
  const authorityEndOffset = tail.search(/[/?#]/u);
  const authority =
    authorityEndOffset < 0 ? tail : tail.slice(0, authorityEndOffset);
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hostPort) fail('database authority is required');
  let rawPort = null;
  if (hostPort.startsWith('[')) {
    const bracketEnd = hostPort.indexOf(']');
    if (bracketEnd < 0) fail('invalid bracketed database hostname');
    const suffix = hostPort.slice(bracketEnd + 1);
    if (suffix) {
      if (!suffix.startsWith(':')) fail('invalid database authority');
      rawPort = suffix.slice(1);
    }
  } else {
    const colon = hostPort.lastIndexOf(':');
    if (colon >= 0) rawPort = hostPort.slice(colon + 1);
  }
  if (rawPort !== null && rawPort !== '5432') {
    fail('database port must be omitted or exact 5432');
  }
}

export function parseGuardedPostgresUrl(value) {
  // Match the repository's existing pg connection-string guards: WHATWG URL authority parsing plus
  // URLSearchParams key decoding/iteration, so encoded, mixed-case and duplicate target keys are all inspected.
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid PostgreSQL URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    fail('URL must use postgres:// or postgresql://');
  }
  assertRawAuthorityPort(value);
  if (parsed.hash) fail('URL fragments are not allowed');
  for (const rawKey of parsed.searchParams.keys()) {
    const key = rawKey.toLowerCase();
    if (FORBIDDEN_TARGET_QUERY_KEYS.has(key)) {
      fail('connection target query override is not allowed');
    }
  }
  const host = normalizeDatabaseHostname(parsed.hostname);
  if (!host) fail('database hostname is required');
  if (parsed.port && parsed.port !== '5432') fail('database port must be 5432');
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));
  } catch {
    fail('invalid encoded database name');
  }
  if (!database || database.includes('/')) fail('database name is required');
  return { host, port: parsed.port || '5432', database };
}

export function assertCanonicalLocalDatabaseUrl(value, expectedDatabase) {
  const target = parseGuardedPostgresUrl(value);
  if (target.host !== '127.0.0.1' && target.host !== 'localhost') {
    fail('canonical runtime database must use local PostgreSQL');
  }
  if (target.database !== expectedDatabase) {
    fail(`canonical runtime database must target exact ${expectedDatabase}`);
  }
  return target;
}

function readStdin() {
  return readFileSync(0, 'utf8').trim();
}

function runCli(argv) {
  const [mode, expectedDatabase] = argv;
  const value = readStdin();
  if (!value) fail('DATABASE_URL is required');
  if (mode === 'canonical') {
    if (!expectedDatabase) fail('expected database argument is required');
    assertCanonicalLocalDatabaseUrl(value, expectedDatabase);
    return;
  }
  fail('mode must be canonical');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'validation failed';
    console.error(`migration-url-guard: ${message}`);
    process.exitCode = 1;
  }
}
