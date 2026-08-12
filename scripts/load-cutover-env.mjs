import { lstatSync, readFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuardedPostgresUrl } from './validate-migration-database-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PROD_CUTOVER_ENV_FILE = '/opt/env/bersoncarebot/cutover.prod';
const DEV_CUTOVER_ENV_FILES = [
  path.join(repoRoot, '.env.cutover.dev'),
  path.join(repoRoot, '.env.cutover'),
];

export const DEFAULT_CUTOVER_ENV_FILES = [PROD_CUTOVER_ENV_FILE, ...DEV_CUTOVER_ENV_FILES];
const LOCAL_POSTGRES_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  encodeURIComponent('/var/run/postgresql').toLowerCase(),
]);

function hasLocalIpv4(expectedAddress) {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .some((address) => address.family === 'IPv4' && address.address === expectedAddress);
}

function assertCanonicalRuntimeHost() {
  const shortHostname = hostname().split('.')[0];
  const hasProductionAddress = hasLocalIpv4('135.106.162.170');
  if (shortHostname === 'adelaide' || hasProductionAddress) {
    if (shortHostname === 'adelaide' && hasProductionAddress) return true;
    throw new Error('Production cutover requires exact host adelaide with local IPv4 135.106.162.170');
  }
  if (hasLocalIpv4('151.241.228.122')) return false;
  throw new Error('DEV/TEST cutover is allowed only on local IPv4 151.241.228.122');
}

function assertCanonicalEnvPath(candidate, productionHost) {
  const resolved = path.resolve(candidate);
  const allowed = productionHost ? [PROD_CUTOVER_ENV_FILE] : DEV_CUTOVER_ENV_FILES;
  if (!allowed.includes(resolved)) {
    throw new Error(
      productionHost
        ? 'Production cutover requires the canonical /opt/env/bersoncarebot/cutover.prod path'
        : 'Local cutover env must use the canonical repository .env.cutover.dev or .env.cutover path',
    );
  }
  return resolved;
}

function pathEntryExists(candidate) {
  return lstatSync(candidate, { throwIfNoEntry: false }) != null;
}

function databaseTarget(urlValue) {
  try {
    return parseGuardedPostgresUrl(urlValue);
  } catch {
    return null;
  }
}

function assertTargetDatabaseContract(parsedEnv, productionHost, override) {
  const effectiveValue = (key) => {
    const parsedValue = parsedEnv[key];
    if (override || process.env[key] == null || process.env[key] === '') {
      return parsedValue ?? process.env[key];
    }
    return process.env[key];
  };
  const expectedDatabases = productionHost
    ? new Set(['bersoncarebot'])
    : new Set(['bcb_webapp_dev', 'bersoncarebot_test']);
  for (const key of ['DATABASE_URL', 'INTEGRATOR_DATABASE_URL', 'SOURCE_DATABASE_URL']) {
    const value = effectiveValue(key);
    if (!value) continue;
    const target = databaseTarget(value);
    if (
      !target ||
      !LOCAL_POSTGRES_HOSTS.has(target.host) ||
      !expectedDatabases.has(target.database)
    ) {
      throw new Error(
        productionHost
          ? 'Cutover database contract requires local bersoncarebot on canonical PROD'
          : 'Local cutover database contract allows only local bcb_webapp_dev or bersoncarebot_test',
      );
    }
  }
}

function parseEnvFile(content) {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadCutoverEnv(options = {}) {
  const override = options.override === true;
  const productionHost = assertCanonicalRuntimeHost();
  const explicitPath = options.path || process.env.CUTOVER_ENV_FILE;
  const candidates = explicitPath
    ? [assertCanonicalEnvPath(explicitPath, productionHost)]
    : productionHost
      ? [DEFAULT_CUTOVER_ENV_FILES[0]]
      : DEFAULT_CUTOVER_ENV_FILES.slice(1);
  const resolvedPath =
    candidates.find((candidate) => candidate && pathEntryExists(candidate)) ?? candidates[0] ?? null;
  if (!resolvedPath || !pathEntryExists(resolvedPath)) {
    assertTargetDatabaseContract({}, productionHost, override);
    return { loaded: false, path: resolvedPath };
  }
  const envStat = lstatSync(resolvedPath);
  if (!envStat.isFile() || envStat.isSymbolicLink()) {
    throw new Error('Cutover env must be a regular non-symlink file');
  }

  const parsed = parseEnvFile(readFileSync(resolvedPath, 'utf8'));
  assertTargetDatabaseContract(parsed, productionHost, override);
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  return { loaded: true, path: resolvedPath };
}
