/**
 * Disposable-PostgreSQL harness lifecycle (block Б1/Б1а/Б1б, #1081, round 2 fix).
 *
 * The harness owns a PRIVATE, ephemeral PostgreSQL cluster for the lifetime of one
 * `pnpm run test:webapp:postgres` invocation -- it never touches the box's shared cluster on
 * :5432 (where `bcb_webapp_dev`/`bersoncarebot_test` live) and never asks for `sudo` or an
 * externally-supplied superuser URL. Transport is the same trusted-binary resolution the
 * repository's own `scripts/verify-a0-greenfield-baseline.mjs` / `verify-a1-rls-conformance.mjs`
 * / `verify-b3-booking-concurrency.mjs` already use (`resolveTrustedPostgresBinaries` + `initdb` +
 * `pg_ctl`, root-owned binaries only, fixed clean `PATH`) -- this is deliberately the SAME
 * mechanism as those three scripts, not a second one built alongside them.
 *
 * Schema (block Б1а, lead decision 2026-08-01): the migration chain alone is not self-contained
 * (`platform_users` is not created by any of the 287 committed migrations -- it only exists in the
 * `a0-greenfield` baseline dump), so the template database is built from the committed
 * `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield` baseline (schema + migration ledger), then every
 * migration NOT yet represented in that baseline's ledger is applied on top via the real `pnpm run
 * migrate` webapp chain. A broken *new* migration therefore fails the build the same way it would
 * fail a real deploy; the baseline itself is never sourced from a live `bcb_webapp_dev`/TEST/PROD
 * database -- see `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md` for how that package is
 * produced and statically verified (`pnpm run check:saas-a0-greenfield-baseline`).
 *
 * Every clone shares ONE non-superuser owner role with the template (created once per cluster,
 * used for every `CREATE DATABASE ... OWNER`). `CREATE DATABASE ... TEMPLATE` copies table
 * ownership by OID, so a clone owned by a role different from the template's actually-owning role
 * cannot read its own tables (`permission denied for table`) -- reusing the same role for template
 * and every clone removes that failure mode by construction instead of granting/reassigning after
 * the fact.
 *
 * Naming/safety builds on the phase-0 contract in `src/app-layer/testing/pg-harness.ts`
 * (`disposablePostgresHarness`): every database this module creates or drops must pass that same
 * `pbt_`-prefixed, dev/test/prod-rejecting name guard, so a bug here can never target a shared
 * database by construction, not by discipline.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { disposablePostgresHarness } from '@/app-layer/testing/pg-harness';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const webappRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(webappRoot, '..', '..');
const safeMigrationEnvPath = path.resolve(
  webappRoot,
  '..',
  '..',
  'deploy/env/empty.local-migration.env',
);

type A0GreenfieldBaselineLib = {
  packageDir: string;
  schemaPath: string;
  seedPath: string;
  BASELINE_OWNER_ROLE: string;
  resolveTrustedPostgresBinaries: (names: string[]) => Record<string, string>;
  validatePackage: () => {
    manifest: {
      ledgers: {
        drizzle: { entries: { tag: string; when: number; sha256: string }[] };
        integrator: { entries: { version: string }[] };
      };
    };
    pending: { drizzle: { tag: string }[]; integrator: { version: string }[] };
  };
};

let a0LibPromise: Promise<A0GreenfieldBaselineLib> | null = null;

/** Lazily imports the repository's own a0-greenfield baseline helpers (plain .mjs, no type decls). */
function loadA0Lib(): Promise<A0GreenfieldBaselineLib> {
  if (!a0LibPromise) {
    const libPath = path.resolve(repoRoot, 'scripts', 'a0-greenfield-baseline-lib.mjs');
    a0LibPromise = import(pathToFileURL(libPath).href) as Promise<A0GreenfieldBaselineLib>;
  }
  return a0LibPromise;
}

export type SharedCluster = Readonly<{
  scratchRoot: string;
  dataDir: string;
  socketDir: string;
  port: string;
  operatorRole: string;
  ownerRole: string;
  ownershipToken: string;
}>;

export type BuiltTemplate = SharedCluster & Readonly<{ templateName: string }>;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is unset -- vitest.postgres.globalSetup.ts did not run or failed`);
  return value;
}

/** Reconstructs the running shared cluster's coordinates from env vars set by globalSetup. */
export function clusterFromEnv(): SharedCluster {
  return {
    scratchRoot: requireEnv('POSTGRES_INTEGRATION_SCRATCH_ROOT'),
    dataDir: requireEnv('POSTGRES_INTEGRATION_DATA_DIR'),
    socketDir: requireEnv('POSTGRES_INTEGRATION_SOCKET_DIR'),
    port: requireEnv('POSTGRES_INTEGRATION_PORT'),
    operatorRole: requireEnv('POSTGRES_INTEGRATION_OPERATOR_ROLE'),
    ownerRole: requireEnv('POSTGRES_INTEGRATION_OWNER_ROLE'),
    ownershipToken: requireEnv('POSTGRES_INTEGRATION_OWNERSHIP_TOKEN'),
  };
}

export function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Every disposable name (template AND clone) must pass the shared phase-0 contract guard. */
export function assertDisposableName(name: string): void {
  disposablePostgresHarness(name);
}

export function newTemplateName(): string {
  const stamp = String(Date.now());
  return `pbt_tpl_${stamp}_${randomBytes(3).toString('hex')}`;
}

export function newCloneName(label: string): string {
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `pbt_${safeLabel || 'clone'}_${randomBytes(4).toString('hex')}`;
}

function newRoleName(label: string): string {
  return `pbt_${label}_${randomBytes(4).toString('hex')}`;
}

function sanitizedChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'DATABASE_URL' || key.startsWith('PG')) delete env[key];
  }
  return { ...env, ...extra };
}

const PRIVATE_SCRATCH_PREFIX = 'pbt_cluster_';
const OWNERSHIP_MARKER_FILE = '.postgres-integration-ownership.json';

type OwnershipMarker = Readonly<{
  formatVersion: 1;
  scratchRoot: string;
  dataDir: string;
  socketDir: string;
  port: string;
  operatorRole: string;
  ownerRole: string;
  ownershipToken: string;
}>;

function sameSecret(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

/** Refuses cleanup unless this is exactly our own 0700 temp directory and data subdirectory. */
function assertPrivateScratchRoot(
  cluster: Pick<SharedCluster, 'scratchRoot' | 'dataDir'>,
): { scratchRoot: string; dataDir: string } {
  const canonicalTmp = fs.realpathSync(os.tmpdir());
  const canonicalScratch = fs.realpathSync(cluster.scratchRoot);
  const canonicalData = fs.realpathSync(cluster.dataDir);
  const expectedPrefix = path.join(canonicalTmp, PRIVATE_SCRATCH_PREFIX);
  const mode = fs.statSync(canonicalScratch).mode & 0o777;
  if (
    path.resolve(cluster.scratchRoot) !== canonicalScratch ||
    path.resolve(cluster.dataDir) !== canonicalData ||
    !canonicalScratch.startsWith(expectedPrefix) ||
    canonicalData !== path.join(canonicalScratch, 'data') ||
    mode !== 0o700
  ) {
    throw new Error('unsafe_private_scratch_cleanup_target');
  }
  return { scratchRoot: canonicalScratch, dataDir: canonicalData };
}

function writeOwnershipMarker(cluster: SharedCluster): void {
  const marker: OwnershipMarker = {
    formatVersion: 1,
    scratchRoot: cluster.scratchRoot,
    dataDir: cluster.dataDir,
    socketDir: cluster.socketDir,
    port: cluster.port,
    operatorRole: cluster.operatorRole,
    ownerRole: cluster.ownerRole,
    ownershipToken: cluster.ownershipToken,
  };
  const markerPath = path.join(cluster.scratchRoot, OWNERSHIP_MARKER_FILE);
  fs.writeFileSync(markerPath, JSON.stringify(marker), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

/**
 * Coordinates inherited by worker processes are a capability only when they match the private
 * marker written by this exact start invocation. A prefix/mode-shaped directory is not enough.
 */
function assertClusterOwnership(cluster: SharedCluster): { scratchRoot: string; dataDir: string } {
  const canonical = assertPrivateScratchRoot(cluster);
  const markerPath = path.join(canonical.scratchRoot, OWNERSHIP_MARKER_FILE);
  let marker: OwnershipMarker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as OwnershipMarker;
  } catch {
    throw new Error('unowned_postgres_integration_cluster');
  }
  if (
    marker.formatVersion !== 1 ||
    marker.scratchRoot !== canonical.scratchRoot ||
    marker.dataDir !== canonical.dataDir ||
    marker.socketDir !== cluster.socketDir ||
    marker.port !== cluster.port ||
    marker.operatorRole !== cluster.operatorRole ||
    marker.ownerRole !== cluster.ownerRole ||
    !sameSecret(marker.ownershipToken, cluster.ownershipToken)
  ) {
    throw new Error('unowned_postgres_integration_cluster');
  }
  return canonical;
}

function run(
  command: string,
  args: string[],
  { label, input }: { label: string; input?: string },
): string {
  const result = spawnSync(command, args, { encoding: 'utf8', input, env: sanitizedChildEnv() });
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${result.status ?? 'unknown'}: ${result.stderr?.trim()}`,
    );
  }
  return result.stdout;
}

function psqlAs(
  psqlBin: string,
  cluster: Pick<SharedCluster, 'socketDir' | 'port'>,
  role: string,
  database: string,
  sql: string,
  label: string,
  { tuplesOnly = false }: { tuplesOnly?: boolean } = {},
): string {
  const args = [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    cluster.socketDir,
    '-p',
    cluster.port,
    '-U',
    role,
    '-d',
    database,
  ];
  if (tuplesOnly) args.push('-Atq');
  return run(psqlBin, args, { label, input: sql });
}

function psqlFileAs(
  psqlBin: string,
  cluster: Pick<SharedCluster, 'socketDir' | 'port'>,
  role: string,
  database: string,
  filePath: string,
  label: string,
): void {
  run(
    psqlBin,
    [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      cluster.socketDir,
      '-p',
      cluster.port,
      '-U',
      role,
      '-d',
      database,
      '-f',
      filePath,
    ],
    { label },
  );
}

/** Builds a `postgresql://` URL that routes through the cluster's Unix socket, not TCP. */
export function connectionUrlFor(
  cluster: Pick<SharedCluster, 'socketDir' | 'port'>,
  role: string,
  database: string,
): string {
  return `postgresql://${role}@localhost:${cluster.port}/${database}?host=${encodeURIComponent(cluster.socketDir)}`;
}

export function listDatabases(cluster: SharedCluster, psqlBin: string): string[] {
  const out = psqlAs(
    psqlBin,
    cluster,
    cluster.operatorRole,
    'postgres',
    'SELECT datname FROM pg_database ORDER BY datname;',
    'list databases (\\l proof)',
    {
      tuplesOnly: true,
    },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runMigrationsAgainst(databaseUrl: string): void {
  const result = spawnSync('pnpm', ['run', 'migrate'], {
    cwd: webappRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    env: sanitizedChildEnv({
      DATABASE_URL: databaseUrl,
      API_ENV_FILE: safeMigrationEnvPath,
      WEBAPP_ENV_FILE: safeMigrationEnvPath,
      NODE_ENV: 'development',
    }),
  });
  if (result.status !== 0) {
    throw new Error(
      `migration chain failed while building the disposable-PostgreSQL template (status ${result.status ?? 'unknown'}) -- this IS the "broken migration chain fails the run" proof required by Б1/Б1а`,
    );
  }
}

/** Starts a brand-new, private PostgreSQL cluster: own data dir, own Unix socket, TCP disabled. */
async function startEphemeralCluster(): Promise<
  SharedCluster & { pgCtlBin: string; psqlBin: string }
> {
  const a0Lib = await loadA0Lib();
  const {
    initdb,
    pg_ctl: pgCtlBin,
    psql: psqlBin,
  } = a0Lib.resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);

  const attempts = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), PRIVATE_SCRATCH_PREFIX));
    fs.chmodSync(scratchRoot, 0o700);
    const dataDir = path.join(scratchRoot, 'data');
    const socketDir = path.join(scratchRoot, 'socket');
    fs.mkdirSync(dataDir, { mode: 0o700 });
    fs.mkdirSync(socketDir, { mode: 0o700 });
    const port = String(40000 + (randomBytes(2).readUInt16BE(0) % 20000));
    const operatorRole = newRoleName('operator');
    const ownerRole = a0Lib.BASELINE_OWNER_ROLE;
    const sharedCluster: SharedCluster = {
      scratchRoot,
      dataDir,
      socketDir,
      port,
      operatorRole,
      ownerRole,
      ownershipToken: randomBytes(32).toString('hex'),
    };
    try {
      writeOwnershipMarker(sharedCluster);
      run(initdb, ['-D', dataDir, `--username=${operatorRole}`, '--auth=trust', '--no-locale'], {
        label: 'initdb',
      });
      run(
        pgCtlBin,
        [
          '-D',
          dataDir,
          '-o',
          `-F -k ${socketDir} -p ${port} -c listen_addresses=''`,
          '-w',
          'start',
          '-l',
          path.join(scratchRoot, 'postgres.log'),
        ],
        { label: 'pg_ctl start' },
      );

      // MUST be exactly a0Lib.BASELINE_OWNER_ROLE, not a generated name: the baseline schema's own
      // RLS policies hardcode `TO bcb_a0_owner` / `CURRENT_USER = 'bcb_a0_owner'` (normalized at
      // baseline-refresh time -- see normalizeA0Dump in a0-greenfield-baseline-lib.mjs), so restoring
      // schema.sql fails with "role does not exist" against any other owner role name.
      psqlAs(
        psqlBin,
        { socketDir, port },
        operatorRole,
        'postgres',
        `CREATE ROLE ${quoteIdent(ownerRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
        'create shared disposable owner role',
      );

      return { ...sharedCluster, pgCtlBin, psqlBin };
    } catch (error) {
      lastError = error;
      try {
        stopCluster(sharedCluster, pgCtlBin);
      } catch {
        // The original start/init error is more useful here. If it never started, the owned root
        // is still safe to remove once status proves no postmaster is attached to this data dir.
        try {
          removeStoppedCluster(sharedCluster, pgCtlBin);
        } catch {
          // Leave an uncertain root in place rather than deleting a path after failed ownership/status checks.
        }
      }
    }
  }
  throw new Error(
    `failed to start an ephemeral PostgreSQL cluster after ${attempts} attempts: ${String(lastError)}`,
  );
}

export type PgCtlCommandResult = Readonly<{
  error?: Error;
  status: number | null;
  signal: NodeJS.Signals | null;
}>;

/** Narrow command adapter: normal lifecycle and deterministic fault tests use the same stop path. */
export type PgCtlCommandRunner = (command: string, args: string[]) => PgCtlCommandResult;

function defaultPgCtlCommandRunner(command: string, args: string[]): PgCtlCommandResult {
  const result = spawnSync(command, args, { env: sanitizedChildEnv(), stdio: 'ignore' });
  return { error: result.error, status: result.status, signal: result.signal };
}

function requirePgCtlResult(result: PgCtlCommandResult, expectedStatus: number, label: string): void {
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.signal || result.status !== expectedStatus) {
    throw new Error(
      `${label} failed with status ${result.status ?? 'unknown'}${result.signal ? ` signal ${result.signal}` : ''}`,
    );
  }
}

function removeStoppedCluster(
  cluster: SharedCluster,
  pgCtlBin: string,
  runPgCtl: PgCtlCommandRunner = defaultPgCtlCommandRunner,
): void {
  const canonical = assertClusterOwnership(cluster);
  const status = runPgCtl(pgCtlBin, ['-D', canonical.dataDir, 'status']);
  // pg_ctl returns 3 only after it has proved this exact data directory has no running server.
  requirePgCtlResult(status, 3, 'pg_ctl status after stop');
  assertClusterOwnership(cluster);
  fs.rmSync(canonical.scratchRoot, { recursive: true, force: true });
}

export function stopCluster(
  cluster: SharedCluster,
  pgCtlBin: string,
  { runPgCtl = defaultPgCtlCommandRunner }: { runPgCtl?: PgCtlCommandRunner } = {},
): void {
  const canonical = assertClusterOwnership(cluster);
  const beforeStop = runPgCtl(pgCtlBin, ['-D', canonical.dataDir, 'status']);
  if (beforeStop.error) throw new Error(`pg_ctl status before stop failed to start: ${beforeStop.error.message}`);
  if (beforeStop.signal || (beforeStop.status !== 0 && beforeStop.status !== 3)) {
    throw new Error(
      `pg_ctl status before stop failed with status ${beforeStop.status ?? 'unknown'}${beforeStop.signal ? ` signal ${beforeStop.signal}` : ''}`,
    );
  }
  if (beforeStop.status === 0) {
    const stopped = runPgCtl(pgCtlBin, ['-D', canonical.dataDir, '-m', 'fast', '-w', 'stop']);
    requirePgCtlResult(stopped, 0, 'pg_ctl stop');
  }
  removeStoppedCluster(cluster, pgCtlBin, runPgCtl);
}

/**
 * The baseline schema's functions and the webapp migration chain both reference application
 * roles (`app_staff`, `app_worker`, `app_owner`, ...) via `pg_has_role(...)` and `GRANT/OWNER TO`,
 * unconditionally in some places -- `pg_has_role` raises "role does not exist" for a name that
 * genuinely does not exist (it does not just return false), so every referenced role must exist in
 * this cluster before schema restore, even though the harness never logs in as any of them.
 * Discovered from source, not hand-maintained, so a future migration introducing a new role does
 * not silently need a harness edit to keep working.
 */
function discoverApplicationRoleNames(schemaText: string, migrationsDir: string): string[] {
  const roles = new Set<string>();
  const scan = (text: string) => {
    for (const match of text.matchAll(/pg_has_role\([^,]+,\s*'([a-z_]+)'/g)) roles.add(match[1]);
    for (const match of text.matchAll(/\b(?:TO|OWNER TO)\s+"?(app_[a-z0-9_]+)"?/g))
      roles.add(match[1]);
    for (const acl of text.matchAll(/\b(?:GRANT|REVOKE)\b[\s\S]*?\b(?:TO|FROM)\s+([^;]+);/gi)) {
      for (const match of acl[1].matchAll(/"?(app_[a-z0-9_]+)"?/g)) roles.add(match[1]);
    }
  };
  scan(schemaText);
  for (const file of fs.readdirSync(migrationsDir)) {
    if (!file.endsWith('.sql')) continue;
    scan(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  return [...roles].filter((name) => name.startsWith('app_')).sort();
}

function buildDrizzleLedgerSql(entries: { sha256: string; when: number }[]): string {
  if (entries.length === 0) return '';
  const values = entries
    .map((entry) => `(${quoteLiteral(entry.sha256)}, ${Number(entry.when)})`)
    .join(',\n');
  return `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES\n${values};\n`;
}

function buildIntegratorLedgerSql(entries: { version: string }[]): string {
  if (entries.length === 0) return '';
  const values = entries.map((entry) => `(${quoteLiteral(entry.version)})`).join(',\n');
  return `INSERT INTO integrator.schema_migrations (version) VALUES\n${values};\n`;
}

/**
 * Builds ONE template database for the whole test run: starts a private cluster, restores the
 * a0-greenfield baseline (schema + drizzle ledger), then runs every migration not yet represented
 * in that ledger via the real `pnpm run migrate` chain. Cleans up the partial cluster/database on
 * any failure -- nothing is left running or on disk when this throws.
 */
export async function buildTemplateDatabase(): Promise<BuiltTemplate> {
  const cluster = await startEphemeralCluster();
  const { psqlBin, pgCtlBin, ...sharedCluster } = cluster;
  try {
    const templateName = newTemplateName();
    assertDisposableName(templateName);

    psqlAs(
      psqlBin,
      sharedCluster,
      sharedCluster.operatorRole,
      'postgres',
      `CREATE DATABASE ${quoteIdent(templateName)} OWNER ${quoteIdent(sharedCluster.ownerRole)};`,
      'create template database',
    );

    const a0Lib = await loadA0Lib();
    const migrationsDir = path.join(webappRoot, 'db', 'drizzle-migrations');
    const schemaText = fs.readFileSync(a0Lib.schemaPath, 'utf8');
    const applicationRoles = discoverApplicationRoleNames(schemaText, migrationsDir);
    if (applicationRoles.length > 0) {
      const createRolesSql = applicationRoles
        .map((role) => `CREATE ROLE ${quoteIdent(role)} NOLOGIN NOINHERIT NOBYPASSRLS;`)
        // Migrations transfer function ownership to some of these roles (e.g. `ALTER FUNCTION ...
        // OWNER TO app_owner`), which PostgreSQL only allows a role that can `SET ROLE` to the
        // target -- membership is enough even without INHERIT.
        .concat(
          applicationRoles.map(
            (role) => `GRANT ${quoteIdent(role)} TO ${quoteIdent(sharedCluster.ownerRole)};`,
          ),
        )
        .join('\n');
      psqlAs(
        psqlBin,
        sharedCluster,
        sharedCluster.operatorRole,
        'postgres',
        createRolesSql,
        `create application roles referenced by schema/migrations (${applicationRoles.join(', ')})`,
      );
    }

    psqlFileAs(
      psqlBin,
      sharedCluster,
      sharedCluster.ownerRole,
      templateName,
      a0Lib.schemaPath,
      'restore a0-greenfield schema baseline',
    );

    if (applicationRoles.length > 0) {
      // A0 intentionally strips runtime ACLs. Drizzle migrations nevertheless transfer ownership
      // of app functions to these NOLOGIN roles; PostgreSQL requires the target role to have
      // CREATE on the containing schema for that transfer. This is migration bootstrap only, not
      // an A1 runtime-role/RLS claim.
      psqlAs(
        psqlBin,
        sharedCluster,
        sharedCluster.ownerRole,
        templateName,
        `GRANT USAGE, CREATE ON SCHEMA app TO ${applicationRoles.map(quoteIdent).join(', ')};`,
        'grant app schema create for migration ownership transfers',
      );
    }

    const { manifest, pending } = a0Lib.validatePackage();
    // Nine baseline tables carry FORCE ROW LEVEL SECURITY, which applies even to the owning role;
    // migrations that touch them need a bounded bypass window, mirroring
    // scripts/verify-a0-greenfield-baseline.mjs's own migration-window pattern.
    psqlAs(
      psqlBin,
      sharedCluster,
      sharedCluster.operatorRole,
      'postgres',
      `ALTER ROLE ${quoteIdent(sharedCluster.ownerRole)} BYPASSRLS;`,
      'open migration window',
    );
    try {
      const ledgerSql = buildDrizzleLedgerSql(manifest.ledgers.drizzle.entries);
      if (ledgerSql) {
        psqlAs(
          psqlBin,
          sharedCluster,
          sharedCluster.ownerRole,
          templateName,
          ledgerSql,
          'seed drizzle migration ledger from baseline',
        );
      }
      const integratorLedgerSql = buildIntegratorLedgerSql(manifest.ledgers.integrator.entries);
      if (integratorLedgerSql) {
        psqlAs(
          psqlBin,
          sharedCluster,
          sharedCluster.ownerRole,
          templateName,
          integratorLedgerSql,
          'transplant integrator migration ledger from baseline',
        );
      }
      psqlFileAs(
        psqlBin,
        sharedCluster,
        sharedCluster.ownerRole,
        templateName,
        a0Lib.seedPath,
        'apply a0-greenfield synthetic seed',
      );
      runMigrationsAgainst(connectionUrlFor(sharedCluster, sharedCluster.ownerRole, templateName));
    } finally {
      psqlAs(
        psqlBin,
        sharedCluster,
        sharedCluster.operatorRole,
        'postgres',
        `ALTER ROLE ${quoteIdent(sharedCluster.ownerRole)} NOBYPASSRLS;`,
        'close migration window',
      );
    }

    if (pending.drizzle.length === 0) {
      // Not an error: baseline may already be current. Logged so a stale baseline is visible.
      console.error(
        '[postgres-integration-harness] note: zero pending drizzle migrations on top of the a0-greenfield baseline',
      );
    }

    return { ...sharedCluster, templateName };
  } catch (error) {
    try {
      stopCluster(sharedCluster, pgCtlBin);
    } catch {
      // best-effort cleanup after an already-failing build; surface the original error
    }
    throw error;
  }
}

/**
 * Clones `templateName` into a brand-new, uniquely-named disposable database owned by the SAME
 * role as the template (see module header for why: avoids the permission-denied-for-table failure
 * a distinct clone role hits against tables it does not actually own by OID).
 * The template must have zero other open connections at clone time (PostgreSQL requirement for
 * `CREATE DATABASE ... TEMPLATE`) -- callers must not hold a pool open against the template.
 */
export function cloneFromTemplate(
  cluster: SharedCluster,
  psqlBin: string,
  templateName: string,
  cloneName: string,
): { connectionUrl: string } {
  assertDisposableName(templateName);
  assertDisposableName(cloneName);

  psqlAs(
    psqlBin,
    cluster,
    cluster.operatorRole,
    'postgres',
    `CREATE DATABASE ${quoteIdent(cloneName)} TEMPLATE ${quoteIdent(templateName)} OWNER ${quoteIdent(cluster.ownerRole)};`,
    `clone disposable database ${cloneName} from template ${templateName}`,
  );

  return { connectionUrl: connectionUrlFor(cluster, cluster.ownerRole, cloneName) };
}

export function dropDisposableDatabase(
  cluster: SharedCluster,
  psqlBin: string,
  name: string,
): void {
  assertClusterOwnership(cluster);
  assertDisposableName(name);
  psqlAs(
    psqlBin,
    cluster,
    cluster.operatorRole,
    'postgres',
    [
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(name)} AND pid <> pg_backend_pid();`,
      `DROP DATABASE IF EXISTS ${quoteIdent(name)};`,
    ].join('\n'),
    `drop disposable database ${name}`,
  );
}

/**
 * Tears down the whole shared cluster by stopping `pg_ctl` and removing the cluster's private data
 * directory -- NOT by dropping the template database / owner role first. This cluster is private
 * and single-purpose (own data dir, own catalog, nothing else ever connects to it), so destroying
 * the whole postmaster + its on-disk state removes every database, role and clone it ever held in
 * one atomic step. Deliberately does not attempt `DROP DATABASE`/`DROP ROLE` here first: an earlier
 * version did, and a leaked clone (e.g. from a `vitest list` collection-only run, where per-file
 * `afterAll` cleanup never fires) made `DROP ROLE` fail with "role ... cannot be dropped because
 * some objects depend on it" -- which then skipped stopping `pg_ctl` entirely, leaking the whole
 * running cluster process. Stopping the cluster can never fail this way.
 */
export function teardownCluster(
  cluster: SharedCluster,
  pgCtlBin: string,
  options: { runPgCtl?: PgCtlCommandRunner } = {},
): void {
  stopCluster(cluster, pgCtlBin, options);
}

export async function resolvePsqlBin(): Promise<string> {
  const a0Lib = await loadA0Lib();
  return a0Lib.resolveTrustedPostgresBinaries(['psql']).psql;
}

export async function resolvePgCtlBin(): Promise<string> {
  const a0Lib = await loadA0Lib();
  return a0Lib.resolveTrustedPostgresBinaries(['pg_ctl']).pg_ctl;
}

export async function selfTest(): Promise<void> {
  const okNames = ['pbt_tpl_123_abc', 'pbt_email_otp_consume_ab12cd'];
  for (const name of okNames) assertDisposableName(name);

  const badNames = [
    'bcb_webapp_dev',
    'pbt_test_x',
    'pbt_dev_x',
    'pbt_production_x',
    'bcb_webapp_test',
  ];
  for (const name of badNames) {
    let threw = false;
    try {
      assertDisposableName(name);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`self-test expected rejection for disposable name: ${name}`);
  }

  const generated = [newTemplateName(), newCloneName('Some Weird Label!!'), newCloneName('')];
  for (const name of generated) assertDisposableName(name);

  // Transport resolution must work without reaching any database (no cluster started here).
  const a0Lib = await loadA0Lib();
  const binaries = a0Lib.resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    if (!binaries[name])
      throw new Error(`self-test expected trusted-binary resolution for ${name}`);
  }

  // clusterFromEnv() must fail closed when the shared-cluster env vars are absent.
  const envKeys = [
    'POSTGRES_INTEGRATION_SCRATCH_ROOT',
    'POSTGRES_INTEGRATION_DATA_DIR',
    'POSTGRES_INTEGRATION_SOCKET_DIR',
    'POSTGRES_INTEGRATION_PORT',
    'POSTGRES_INTEGRATION_OPERATOR_ROLE',
    'POSTGRES_INTEGRATION_OWNER_ROLE',
    'POSTGRES_INTEGRATION_OWNERSHIP_TOKEN',
  ];
  const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) delete process.env[key];
    let threwNoEnv = false;
    try {
      clusterFromEnv();
    } catch {
      threwNoEnv = true;
    }
    if (!threwNoEnv)
      throw new Error('self-test expected rejection with no shared-cluster env vars set');
  } finally {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }

  console.log(
    'postgres-integration harness-lib self-test: OK (name guard + trusted transport resolution + env-guard only; no DB reached)',
  );
}
