#!/usr/bin/env node
// Derives the REAL set of base tables that exist in the accepted B0 application
// schema, by reading the source-of-truth artifacts directly:
//   - the generated database-local access contract (schema-qualified current
//     relation catalog, rendered from the canonical privilege declaration);
//   - every `CREATE TABLE` in apps/webapp/db/drizzle-migrations/*.sql
//     (minus any table with a later `DROP TABLE`)
//   - every `CREATE TABLE` under the integrator migration runner's actual
//     discovery globs (mirrors `discoverMigrations()` in
//     apps/integrator/src/infra/db/migrate.ts):
//       apps/integrator/src/infra/db/migrations/core/*.sql
//       apps/integrator/src/integrations/*/db/migrations/*.sql
//     (minus any table with a later `DROP TABLE`)
//
// This intentionally does NOT touch a live database. It is a static,
// repo-only derivation so the P0.10.1 tier-completeness invariant can be
// grounded against the actual schema instead of a hand-maintained TSV
// snapshot (`all-218-signals.tsv`) that can silently drift.
//
// Schema qualification: an explicit schema in migration SQL is authoritative
// for CREATE/DROP/RENAME. Only an unqualified identifier uses the runner's
// default: webapp migrations create in `public`, while integrator migrations
// create in `integrator`. This matters in both directions because either runner
// may deliberately operate on a table in the other runner's schema.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const sourceDirs = Object.freeze({
  webappSchema: 'apps/webapp/db/schema',
  webappMigrations: 'apps/webapp/db/drizzle-migrations',
  webappAccessContract: 'deploy/postgres/generated/privileges.bcb_webapp_dev.sql',
  integratorCoreMigrations: 'apps/integrator/src/infra/db/migrations/core',
  integratorIntegrationsRoot: 'apps/integrator/src/integrations',
});

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const DROP_TABLE_RE =
  /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const RENAME_TABLE_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+TO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const ACCESS_CONTRACT_TABLE_RE = /\bTABLE\s+"(public|integrator)"\."([a-zA-Z0-9_]+)"/g;

// Base tables whose existence is real but whose CREATE TABLE is never a
// tracked .sql migration file or a Drizzle `pgTable()` declaration — they
// are bootstrapped inline by the migration runners themselves:
//   - `drizzle.__drizzle_migrations` is created by the drizzle-kit CLI.
//   - `integrator.schema_migrations` is created inline by
//     `ensureMigrationsTable()` in apps/integrator/src/infra/db/migrate.ts.
const RUNNER_BOOTSTRAPPED_TABLES = Object.freeze([
  'drizzle.__drizzle_migrations',
  'integrator.schema_migrations',
]);

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

// Matches `isSqlMigrationFile` in apps/integrator/src/infra/db/migrate.ts:
// a real migration is a `.sql` file whose name doesn't contain "example".
function isSqlMigrationFile(name) {
  return name.endsWith('.sql') && !name.toLowerCase().includes('example');
}

function listSqlFiles(dir) {
  if (!isDirectory(dir)) return [];

  return readdirSync(dir)
    .filter((name) => isSqlMigrationFile(name))
    .sort()
    .map((name) => join(dir, name));
}

// Mirrors `discoverMigrations()` in apps/integrator/src/infra/db/migrate.ts:
// core migrations, plus every `src/integrations/<name>/db/migrations/*.sql`.
function discoverIntegratorMigrationFiles(repoRoot) {
  const coreDir = join(repoRoot, sourceDirs.integratorCoreMigrations);
  const files = [...listSqlFiles(coreDir)];

  const integrationsRoot = join(repoRoot, sourceDirs.integratorIntegrationsRoot);

  if (isDirectory(integrationsRoot)) {
    const integrationNames = readdirSync(integrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const integrationName of integrationNames) {
      const migrationsDir = join(integrationsRoot, integrationName, 'db', 'migrations');
      files.push(...listSqlFiles(migrationsDir));
    }
  }

  // Mirror migrate.ts's discoverMigrations(): core + every integration's migrations are
  // replayed in ONE global chronological order by filename, not grouped directory-by-directory.
  // Directory-grouped order silently breaks whenever a later core migration (e.g. a rename) acts
  // on a table created/renamed by an earlier-dated integration migration, or vice versa.
  return files.sort((a, b) => basename(a).localeCompare(basename(b)));
}

// Returns every CREATE/DROP/RENAME table statement in a file, in the order
// they occur in the text (statement order matters: e.g. a single migration
// file dropping and immediately recreating the same table must net to
// "exists", not "dropped").
function extractOrderedStatements(content, defaultSchema) {
  const events = [];

  for (const match of content.matchAll(CREATE_TABLE_RE)) {
    events.push({
      index: match.index,
      kind: 'create',
      table: `${match[1] ?? defaultSchema}.${match[2]}`,
    });
  }

  for (const match of content.matchAll(DROP_TABLE_RE)) {
    events.push({
      index: match.index,
      kind: 'drop',
      table: `${match[1] ?? defaultSchema}.${match[2]}`,
    });
  }

  for (const match of content.matchAll(RENAME_TABLE_RE)) {
    const fromSchema = match[1] ?? defaultSchema;
    events.push({
      index: match.index,
      kind: 'rename',
      from: `${fromSchema}.${match[2]}`,
      to: `${match[3] ?? fromSchema}.${match[4]}`,
    });
  }

  events.sort((a, b) => a.index - b.index);
  return events;
}

// Strip SQL line comments (both full-line `-- ...` and trailing
// `...;--> statement-breakpoint` drizzle-kit markers) so commented-out
// CREATE/DROP TABLE mentions (used as ops-rollback documentation in this
// repo) never leak into the derived table set.
function stripSqlLineComments(content) {
  return content
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

function readAccessContractTables(repoRoot) {
  const tables = new Set();
  const source = readFileSync(join(repoRoot, sourceDirs.webappAccessContract), 'utf8');
  for (const match of source.matchAll(ACCESS_CONTRACT_TABLE_RE)) {
    tables.add(`${match[1]}.${match[2]}`);
  }
  return tables;
}

// Files must be passed in chronological (migration) order. Within each
// file, CREATE/DROP/RENAME are replayed in the order they appear in the SQL
// text, so a file that drops and recreates (or renames) the same table
// nets out correctly instead of being order-grouped by statement type.
function readMigrationCreatedTables(migrationSources) {
  const tables = new Set();

  for (const { file, defaultSchema } of migrationSources) {
    const content = stripSqlLineComments(readFileSync(file, 'utf8'));

    for (const event of extractOrderedStatements(content, defaultSchema)) {
      if (event.kind === 'create') {
        tables.add(event.table);
      } else if (event.kind === 'drop') {
        tables.delete(event.table);
      } else if (event.kind === 'rename') {
        tables.delete(event.from);
        tables.add(event.to);
      }
    }
  }

  return tables;
}

/**
 * Returns the sorted, schema-qualified list of base tables that actually
 * exist per the repo's own schema declarations and migration history
 * (`public.<table>` / `integrator.<table>`). No live DB access.
 */
export function readActualBaseTables({ repoRoot = process.cwd() } = {}) {
  const accessContractTables = readAccessContractTables(repoRoot);

  // Chronological order matters (CREATE/RENAME/DROP are replayed in file
  // order). The maintained webapp ledger starts at the complete B0 baseline.
  const webappMigrationFiles = listSqlFiles(join(repoRoot, sourceDirs.webappMigrations));
  const integratorMigrationFiles = discoverIntegratorMigrationFiles(repoRoot);
  const migrationSources = [
    ...webappMigrationFiles.map((file) => ({ file, defaultSchema: 'public' })),
    ...integratorMigrationFiles.map((file) => ({ file, defaultSchema: 'integrator' })),
  ].sort(
    (left, right) =>
      basename(left.file).localeCompare(basename(right.file)) ||
      left.file.localeCompare(right.file),
  );
  const migrationTables = readMigrationCreatedTables(migrationSources);

  return Array.from(
    new Set([...accessContractTables, ...migrationTables, ...RUNNER_BOOTSTRAPPED_TABLES]),
  ).sort();
}

if (process.argv.includes('--print')) {
  for (const table of readActualBaseTables()) {
    console.log(table);
  }
}
