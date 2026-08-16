#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SAFE_OPERATOR_PATH,
  assertCleanRefreshSource,
  buildManifest,
  discoverDrizzleMigrationsAtCommit,
  discoverIntegratorMigrationsAtCommit,
  manifestPath,
  normalizeA0Dump,
  packageDir,
  repoRoot,
  resolveTrustedPostgresBinaries,
  schemaPath,
  seedPath,
} from './a0-greenfield-baseline-lib.mjs';
import {
  assertExactLocalDevDatabaseUrl,
  parseDatabaseUrlKeyFromDotenv,
} from '../deploy/host/parse-dev-database-url.mjs';

const confirmation = '--confirm-local-dev-schema-refresh';
const defaultEnvPath = path.join(repoRoot, 'apps', 'webapp', '.env.dev');

function usage() {
  return [
    'Usage:',
    `  node scripts/refresh-a0-greenfield-baseline.mjs ${confirmation} [--env-file=/absolute/apps/webapp/.env.dev]`,
    '',
    'Reads schema metadata only from exact local bcb_webapp_dev. It never dumps rows.',
    'The source URL is validated but never printed; protected schema metadata is read via local postgres operator.',
  ].join('\n');
}

function parseArgs(argv) {
  let confirmed = false;
  let envPath = defaultEnvPath;
  for (const arg of argv) {
    if (arg === confirmation) confirmed = true;
    else if (arg.startsWith('--env-file=')) envPath = path.resolve(arg.slice('--env-file='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`unknown_argument:${arg}`);
  }
  if (!confirmed) throw new Error(`explicit_confirmation_required:${confirmation}`);
  return { envPath };
}

function operatorEnv() {
  return {
    PATH: SAFE_OPERATOR_PATH,
    HOME: os.tmpdir(),
    LANG: 'C.UTF-8',
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? operatorEnv(),
    maxBuffer: 32 * 1024 * 1024,
    input: options.input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`${options.label ?? command}_failed${stderr ? `:${stderr}` : ''}`);
  }
  return String(result.stdout ?? '');
}

function runPostgres(binary, args, label) {
  return run(
    '/usr/bin/sudo',
    [
      '-n',
      '-u',
      'postgres',
      '/usr/bin/env',
      '-i',
      ...Object.entries(operatorEnv()).map(([key, value]) => `${key}=${value}`),
      binary,
      ...args,
    ],
    { label },
  );
}

function readCanonicalEnv(envPath) {
  const stat = fs.lstatSync(envPath);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('env_file_must_be_regular_non_symlink');
  if (fs.realpathSync(envPath) !== path.resolve(envPath))
    throw new Error('env_file_must_be_canonical');
  return fs.readFileSync(envPath, 'utf8');
}

function assertSourceLedgersCurrent(sourceCommit, postgresBinaries) {
  const currentIntegrator = discoverIntegratorMigrationsAtCommit(sourceCommit);
  const currentDrizzle = discoverDrizzleMigrationsAtCommit(sourceCommit);
  const integratorRows = runPostgres(
    postgresBinaries.psql,
    [
      '-X',
      '-d',
      'bcb_webapp_dev',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atqc',
      'SELECT version FROM integrator.schema_migrations ORDER BY version',
    ],
    'integrator_ledger_probe',
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const integratorSet = new Set(integratorRows);
  const missingIntegrator = currentIntegrator.filter((entry) => !integratorSet.has(entry.version));
  if (missingIntegrator.length > 0) {
    throw new Error(
      `source_integrator_ledger_incomplete:${missingIntegrator.map((entry) => entry.version).join(',')}`,
    );
  }

  const drizzleRows = runPostgres(
    postgresBinaries.psql,
    [
      '-X',
      '-d',
      'bcb_webapp_dev',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atqc',
      "SELECT hash || E'\\t' || created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id",
    ],
    'drizzle_ledger_probe',
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  const latestApplied = drizzleRows.reduce(
    (latest, row) => (BigInt(row[1]) > latest ? BigInt(row[1]) : latest),
    0n,
  );
  const expectedLatest = BigInt(currentDrizzle.at(-1)?.when ?? 0);
  if (latestApplied !== expectedLatest) {
    throw new Error(`source_drizzle_ledger_not_current:${latestApplied}:${expectedLatest}`);
  }
  const appliedWhen = new Set(drizzleRows.map((row) => row[1]));
  const missingDrizzle = currentDrizzle.filter((entry) => !appliedWhen.has(String(entry.when)));
  if (missingDrizzle.length > 0) {
    throw new Error(
      `source_drizzle_ledger_incomplete:${missingDrizzle.map((entry) => entry.tag).join(',')}`,
    );
  }
  const currentHashes = new Set(currentDrizzle.map((entry) => entry.sha256));
  const historicalHashRows = drizzleRows.filter(([hash]) => !currentHashes.has(hash)).length;
  return {
    integratorRows: integratorRows.length,
    integratorExtraRows: integratorRows.length - currentIntegrator.length,
    drizzleRows: drizzleRows.length,
    historicalHashRows,
  };
}

function writeAtomic(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, { mode: 0o644 });
  fs.renameSync(temporary, filePath);
}

function formatManifest(manifest) {
  const printable = structuredClone(manifest);
  printable.baseline.schemas = '__A0_SCHEMAS__';
  printable.baseline.extensions = '__A0_EXTENSIONS__';
  const inlineArray = (values) => `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
  return `${JSON.stringify(printable, null, 2)
    .replace('"__A0_SCHEMAS__"', inlineArray(manifest.baseline.schemas))
    .replace('"__A0_EXTENSIONS__"', inlineArray(manifest.baseline.extensions))}\n`;
}

try {
  const { envPath } = parseArgs(process.argv.slice(2));
  assertCleanRefreshSource();
  const sourceCommit = run('/usr/bin/git', ['rev-parse', 'HEAD'], {
    env: operatorEnv(),
    label: 'git_rev_parse',
  }).trim();
  const postgresBinaries = resolveTrustedPostgresBinaries(['psql', 'pg_dump']);
  assertExactLocalDevDatabaseUrl(
    parseDatabaseUrlKeyFromDotenv(readCanonicalEnv(envPath), 'DATABASE_URL_STAFF'),
    'bcb_dev_webapp_staff',
  );
  const sourceDb = runPostgres(
    postgresBinaries.psql,
    ['-X', '-d', 'bcb_webapp_dev', '-v', 'ON_ERROR_STOP=1', '-Atqc', 'SELECT current_database()'],
    'source_database_probe',
  ).trim();
  if (sourceDb !== 'bcb_webapp_dev') throw new Error('source_database_mismatch');

  // The reference_catalog_seed_owner policies are created by
  // deploy/postgres/reference-catalog-rls.sql against `provisioning_owner`, which is the actual
  // *owner* of these SECURITY DEFINER helper functions — not whichever role authenticates
  // DATABASE_URL. The connection role and the policy role only used to coincide by accident.
  const sourceRole = runPostgres(
    postgresBinaries.psql,
    [
      '-X',
      '-d',
      'bcb_webapp_dev',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atqc',
      "SELECT COALESCE(" +
        "(SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = to_regprocedure('app.provision_specialist_owner(uuid)')), " +
        "(SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure))",
    ],
    'reference_catalog_seed_owner_probe',
  ).trim();
  if (!sourceRole) throw new Error('reference_catalog_seed_owner_role_not_found');

  const ledgerProof = assertSourceLedgersCurrent(sourceCommit, postgresBinaries);
  const rawDump = runPostgres(
    postgresBinaries.pg_dump,
    ['--dbname=bcb_webapp_dev', '--schema-only', '--no-owner', '--no-privileges', '--no-comments'],
    'schema_only_dump',
  );
  const { normalized, normalizedRoleOccurrences } = normalizeA0Dump(rawDump, sourceRole);
  const pgDumpVersion = runPostgres(
    postgresBinaries.pg_dump,
    ['--version'],
    'pg_dump_version',
  ).trim();
  const seedText = fs.readFileSync(seedPath, 'utf8');
  const manifest = buildManifest({
    schemaText: normalized,
    seedText,
    sourceCommit,
    generatedAt: new Date().toISOString(),
    pgDumpVersion,
  });

  fs.mkdirSync(packageDir, { recursive: true });
  writeAtomic(schemaPath, normalized);
  writeAtomic(manifestPath, formatManifest(manifest));
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        source: 'exact-local-bcb_webapp_dev-schema-only',
        schemaSha256: manifest.baseline.schemaSha256,
        census: manifest.baseline.census,
        normalizedRoleOccurrences,
        ledgerProof,
        manifestEntries: {
          integrator: manifest.ledgers.integrator.entries.length,
          drizzle: manifest.ledgers.drizzle.entries.length,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `refresh-a0-greenfield-baseline: ${error instanceof Error ? error.message : 'unknown_error'}`,
  );
  process.exit(1);
}
