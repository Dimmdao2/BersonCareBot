#!/usr/bin/env node
/**
 * Compares the set of `public` base tables in the database with the set of `pgTable` declarations
 * Drizzle actually sees, and reports the divergence BY NAME.
 *
 * Two things used to rot here and both are gone:
 *
 * 1. The schema entry files were a hand-copied list. It had drifted to 12 files while `schema:` in
 *    `drizzle.config.ts` named 30, so the gate summed 109 `pgTable` declarations where the config
 *    reaches 162 — a ~50-table phantom gap on every run. The list is now read out of
 *    `drizzle.config.ts`, which is the same file drizzle-kit loads, so there is one source of truth
 *    and nothing to keep in sync.
 * 2. The comparison was `count !== count`. It failed with two numbers, named nothing, and its hint
 *    blamed "pending migrations" whatever the real cause was. Adding one table on either side can
 *    only be repaired by retyping. Names cannot rot: the failure prints exactly which tables are in
 *    the database without a declaration and which are declared without a table.
 *
 * Requires DATABASE_URL (e.g. apps/webapp/.env.dev). Skips with exit 0 if unset (CI without DB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: path.resolve(process.cwd(), '.env.dev') });
config();

const WEBAPP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIZZLE_CONFIG = path.join(WEBAPP_ROOT, 'drizzle.config.ts');

/** Entry files listed in `schema:` of `drizzle.config.ts` — read, never copied. */
function readSchemaEntries() {
  const source = fs.readFileSync(DRIZZLE_CONFIG, 'utf8');
  const block = source.match(/\bschema:\s*\[([\s\S]*?)\]/);
  if (!block) {
    throw new Error(`Could not find a "schema: [...]" array in ${DRIZZLE_CONFIG}`);
  }
  const entries = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) =>
    path.resolve(WEBAPP_ROOT, m[1]),
  );
  if (entries.length === 0) {
    throw new Error(`"schema: [...]" in ${DRIZZLE_CONFIG} is empty`);
  }
  for (const entry of entries) {
    if (!fs.existsSync(entry)) {
      throw new Error(`drizzle.config.ts names a schema file that does not exist: ${entry}`);
    }
  }
  return entries;
}

/** drizzle-kit reads the entry files and everything they import, so follow the same graph. */
function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableSchemaFiles(entries) {
  const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?\sfrom\s*['"]([^'"]+)['"]/g;
  const seen = new Set();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return seen;
}

/** The SQL name is `pgTable`'s first argument; the declaration is usually wrapped over lines. */
function declaredTableNames(files) {
  const PG_TABLE_RE = /\bpgTable\(\s*['"]([^'"]+)['"]/g;
  const names = new Set();
  for (const file of files) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(PG_TABLE_RE)) names.add(match[1]);
  }
  return names;
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log('[verify-drizzle-public-table-count] SKIP: DATABASE_URL not set (no DB to compare)');
  process.exit(0);
}

const entries = readSchemaEntries();
const schemaFiles = reachableSchemaFiles(entries);
const declared = declaredTableNames(schemaFiles);

const pool = new pg.Pool({ connectionString: url });
let live;
try {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  live = new Set(rows.map((row) => row.table_name));
} finally {
  await pool.end();
}

const undeclared = [...live].filter((name) => !declared.has(name)).sort();
const absent = [...declared].filter((name) => !live.has(name)).sort();

if (undeclared.length > 0 || absent.length > 0) {
  console.error(
    `[verify-drizzle-public-table-count] DIVERGENCE: ${live.size} public base tables in the database, ` +
      `${declared.size} pgTable declarations reachable from drizzle.config.ts ` +
      `(${entries.length} entry files, ${schemaFiles.size} files after imports)`,
  );
  if (undeclared.length > 0) {
    console.error(`  In the database, no pgTable declaration (${undeclared.length}):`);
    for (const name of undeclared) console.error(`    ${name}`);
    console.error(
      '    → either add the table to a schema file reachable from `schema:` in drizzle.config.ts,',
    );
    console.error('      or drop it if it is dead.');
  }
  if (absent.length > 0) {
    console.error(`  Declared as pgTable, absent from the database (${absent.length}):`);
    for (const name of absent) console.error(`    ${name}`);
    console.error('    → apply pending migrations (db/drizzle-migrations), or remove the stale declaration.');
  }
  process.exit(1);
}

console.log(
  `[verify-drizzle-public-table-count] OK: ${live.size} public base tables, ` +
    'each one declared as a pgTable reachable from drizzle.config.ts',
);
