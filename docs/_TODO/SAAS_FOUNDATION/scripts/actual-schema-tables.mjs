#!/usr/bin/env node
// Derives the REAL set of base tables that exist in the running application
// schema, by reading the source-of-truth artifacts directly:
//   - every `pgTable(...)` declaration in apps/webapp/db/schema/*.ts
//   - every `CREATE TABLE` in apps/webapp/db/drizzle-migrations/*.sql
//     (minus any table with a later `DROP TABLE`)
//   - every `CREATE TABLE` in apps/webapp/migrations/*.sql — the legacy
//     pre-drizzle webapp migration runner. Per
//     docs/ARCHITECTURE/DB_STRUCTURE.md it is "not a normal deploy step"
//     anymore, but it is what originally created most of the baseline
//     `public.*` schema, and those tables are still live today.
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
// Schema qualification: the webapp's `db/schema/*.ts` is drizzle-kit
// introspection output that declares `pgTable(...)` WITHOUT a schema
// qualifier for every table the webapp's DB role can see — including
// tables that physically live in the `integrator` Postgres schema (the
// webapp reads across schemas via search_path). So `pgTable(...)` alone
// cannot tell `public.*` from `integrator.*`. The migrations are
// authoritative for schema placement instead:
//   - a name created by an integrator-migration CREATE TABLE is
//     `integrator.<table>` (even if also mirrored in schema.ts).
//   - everything else (webapp-migration-created tables, plus any
//     schema.ts-declared table with no integrator-migration origin, e.g.
//     `public.be_*` and pre-migration-era baseline tables) is
//     `public.<table>`.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const sourceDirs = Object.freeze({
  webappSchema: 'apps/webapp/db/schema',
  webappMigrations: 'apps/webapp/db/drizzle-migrations',
  webappLegacyMigrations: 'apps/webapp/migrations',
  integratorCoreMigrations: 'apps/integrator/src/infra/db/migrations/core',
  integratorIntegrationsRoot: 'apps/integrator/src/integrations',
});

const PG_TABLE_RE = /pgTable\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;
// Table name, optionally prefixed by a schema-qualifier (`public.` / `"public".`)
// which we deliberately discard here — schema placement is decided by which
// migrations directory (webapp vs integrator) the CREATE TABLE came from,
// not by an explicit qualifier in the SQL text.
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const DROP_TABLE_RE =
  /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const QUALIFIED_DROP_TABLE_RE =
  /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?\."?([a-zA-Z0-9_]+)"?/gi;
const RENAME_TABLE_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+TO\s+(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi;

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

function extractAll(content, sourceRegex) {
  const re = new RegExp(sourceRegex.source, sourceRegex.flags);
  const out = new Set();
  let match;

  while ((match = re.exec(content)) !== null) {
    out.add(match[1]);
  }

  return out;
}

// Returns every CREATE/DROP/RENAME table statement in a file, in the order
// they occur in the text (statement order matters: e.g. a single migration
// file dropping and immediately recreating the same table must net to
// "exists", not "dropped").
function extractOrderedStatements(content) {
  const events = [];

  for (const match of content.matchAll(CREATE_TABLE_RE)) {
    events.push({ index: match.index, kind: 'create', table: match[1] });
  }

  for (const match of content.matchAll(DROP_TABLE_RE)) {
    events.push({ index: match.index, kind: 'drop', table: match[1] });
  }

  for (const match of content.matchAll(RENAME_TABLE_RE)) {
    events.push({ index: match.index, kind: 'rename', from: match[1], to: match[2] });
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

function readSchemaDeclaredTables(repoRoot) {
  const tables = new Set();
  const schemaDir = join(repoRoot, sourceDirs.webappSchema);
  const schemaFiles = readdirSync(schemaDir).filter((name) => name.endsWith('.ts'));

  for (const file of schemaFiles) {
    const content = readFileSync(join(schemaDir, file), 'utf8');

    for (const table of extractAll(content, PG_TABLE_RE)) {
      tables.add(table);
    }
  }

  return tables;
}

// Files must be passed in chronological (migration) order. Within each
// file, CREATE/DROP/RENAME are replayed in the order they appear in the SQL
// text, so a file that drops and recreates (or renames) the same table
// nets out correctly instead of being order-grouped by statement type.
function readMigrationCreatedTables(dirFiles) {
  const tables = new Set();

  for (const file of dirFiles) {
    const content = stripSqlLineComments(readFileSync(file, 'utf8'));

    for (const event of extractOrderedStatements(content)) {
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

function readQualifiedDrops(files, schema) {
  const tables = new Set();

  for (const file of files) {
    const content = stripSqlLineComments(readFileSync(file, 'utf8'));
    const regex = new RegExp(QUALIFIED_DROP_TABLE_RE.source, QUALIFIED_DROP_TABLE_RE.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1] === schema) tables.add(match[2]);
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
  const schemaDeclaredTables = readSchemaDeclaredTables(repoRoot);

  // Chronological order matters (CREATE/RENAME/DROP are replayed in file
  // order): the legacy pre-drizzle runner established the baseline schema
  // before `drizzle-migrations` took over, so it must be processed first.
  const webappMigrationFiles = [
    ...listSqlFiles(join(repoRoot, sourceDirs.webappLegacyMigrations)),
    ...listSqlFiles(join(repoRoot, sourceDirs.webappMigrations)),
  ];
  const webappCreatedTables = readMigrationCreatedTables(webappMigrationFiles);

  const integratorMigrationFiles = discoverIntegratorMigrationFiles(repoRoot);
  const integratorTables = readMigrationCreatedTables(integratorMigrationFiles);
  // A later webapp migration may retire an explicitly qualified integrator table.
  // Account for that cross-runner DROP instead of resurrecting the table merely because
  // its historical CREATE remains in the integrator migration ledger.
  for (const table of readQualifiedDrops(webappMigrationFiles, 'integrator')) {
    integratorTables.delete(table);
  }

  // Migrations are authoritative for schema placement: a table created by an
  // integrator migration is `integrator.<table>` even though it is also
  // mirrored (unqualified) in the webapp's drizzle-kit-introspected
  // schema.ts. Everything else the webapp knows about — either created by
  // its own migrations, or declared in schema.ts with no integrator origin
  // (baseline/pre-migration-era tables, `public.be_*`, etc.) — is public.
  const publicTables = new Set([
    ...webappCreatedTables,
    ...Array.from(schemaDeclaredTables).filter((table) => !integratorTables.has(table)),
  ]);

  return [
    ...Array.from(publicTables, (table) => `public.${table}`),
    ...Array.from(integratorTables, (table) => `integrator.${table}`),
    ...RUNNER_BOOTSTRAPPED_TABLES,
  ].sort();
}

if (process.argv.includes('--print')) {
  for (const table of readActualBaseTables()) {
    console.log(table);
  }
}
