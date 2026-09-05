/**
 * Live Drizzle INSERT surface of the webapp schema, in one place.
 *
 * Two derivations live here, and nothing else:
 *
 *   1. `collectDrizzleInsertSurface()` — for every `pgTable` exported from `db/schema/*.ts`, the
 *      column list Drizzle actually NAMES in `INSERT INTO <table> (...)`.
 *   2. `collectDirectInsertCallsites()` — every `.insert(<table>)` callsite under `src/`, resolved
 *      through the TypeScript AST and the file's import graph to the exact schema export.
 *
 * The named set is NOT "the columns a callsite sets": drizzle-orm 0.45.2
 * (`pg-core/dialect.js`, `buildInsertQuery`) builds `insertOrder` from
 * `Object.entries(columns).filter(([, col]) => !col.shouldDisableInsert())` and pushes the
 * `default` keyword for every key missing from `.values({...})`. `Column.shouldDisableInsert()`
 * (`column.js`) is true only when `config.generated !== undefined && config.generated.type
 * !== 'byDefault'` — i.e. `generatedAlwaysAs` and `generatedAlwaysAsIdentity`. Everything else
 * is named, `defaultRandom()` primary keys included, and Postgres requires column-level INSERT
 * privilege on every NAMED column even when its value is the `DEFAULT` keyword.
 *
 * `shouldDisableInsert()` is `@internal` and absent from the published `.d.ts`, so the predicate
 * below is written against the public `Column.generated` field and then pinned to the library's
 * own method at runtime — a future drizzle release that changes the rule fails here loudly
 * instead of silently shrinking the required set.
 *
 * Consumers:
 *   - `scripts/print-drizzle-insert-columns.ts` — stdout JSON for the acceptance gate
 *     `deploy/postgres/privileges/drizzle-insert-grant-completeness.test.mjs`;
 *   - `scripts/generate-drizzle-insert-surface.ts` — the committed artifact
 *     `deploy/postgres/privileges/drizzle-insert-surface.ts` that the privilege declaration reads
 *     as data (the privilege generator is plain Node and cannot import this workspace).
 *
 * The gate re-derives BOTH sides on its own — it spawns the printer for the columns and runs its
 * own AST/import-graph scan for the callsites — and compares the result against the emitted
 * declaration. So a resolver here that finds fewer tables, or an artifact that has gone stale,
 * turns the gate red instead of silently narrowing a grant.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { type Column, getTableColumns, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import ts from 'typescript';

export const WEBAPP_ROOT = path.join(import.meta.dirname, '..');
export const REPO_ROOT = path.join(WEBAPP_ROOT, '..', '..');
const SCHEMA_DIR = path.join(WEBAPP_ROOT, 'db', 'schema');
const SRC_DIR = path.join(WEBAPP_ROOT, 'src');
const NON_TABLE_MODULES = new Set(['index.ts', 'relations.ts']);

export interface TableSurface {
  /** Every `db/schema/*.ts` export bound to this SQL table. */
  exports: { exportName: string; module: string }[];
  /** SQL schema the table lives in (`public` unless a `pgSchema` says otherwise). */
  schema: string;
  /** Columns Drizzle names in INSERT. */
  named: string[];
  /** Columns Drizzle never names because Postgres forbids writing them. */
  generatedAlways: string[];
}

/** Mirrors `Column.shouldDisableInsert()` through public metadata; pinned to it below. */
function isGeneratedAlways(column: Column): boolean {
  const generatedAlways = column.generated !== undefined && column.generated.type !== 'byDefault';
  const internal = column as unknown as { shouldDisableInsert?: () => boolean };
  if (
    typeof internal.shouldDisableInsert === 'function'
    && internal.shouldDisableInsert() !== generatedAlways
  ) {
    throw new Error(
      `drizzle-orm changed which columns it names in INSERT: ${column.name} disagrees with `
        + 'Column.shouldDisableInsert(). Re-read pg-core buildInsertQuery before touching grants.',
    );
  }
  return generatedAlways;
}

export async function collectDrizzleInsertSurface(): Promise<Record<string, TableSurface>> {
  const files = readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith('.ts') && !NON_TABLE_MODULES.has(file))
    .sort();
  const surface: Record<string, TableSurface> = {};
  for (const file of files) {
    const loaded: Record<string, unknown> = await import(
      pathToFileURL(path.join(SCHEMA_DIR, file)).href
    );
    for (const [exportName, value] of Object.entries(loaded)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const entry = { exportName, module: `db/schema/${file}` };
      const columns = Object.values(getTableColumns(value));
      const schema = config.schema ?? 'public';
      const named = columns.filter((c) => !isGeneratedAlways(c)).map((c) => c.name).sort();
      const existing = surface[config.name];
      if (existing) {
        // Several exports may legitimately bind the SAME table. Two models that merely SHARE a SQL
        // name are a different thing: this map is keyed by name, so the second one's columns would
        // be dropped and its relation would vanish from the artifact — a grant silently narrowed to
        // the first model's columns, which is the 42501 class S1 exists to close. Refuse instead.
        if (existing.schema !== schema || existing.named.join() !== named.join()) {
          throw new Error(
            `two Drizzle models disagree about the SQL table "${config.name}": `
              + `${existing.exports.map((e) => `${e.module}:${e.exportName}`).join(', ')} says `
              + `${existing.schema} (${existing.named.join(', ')}), `
              + `${entry.module}:${entry.exportName} says ${schema} (${named.join(', ')}). `
              + 'This surface is keyed by SQL table name, so one of them would be dropped and its '
              + 'grant narrowed in silence. Give the relations distinct names or merge the models.',
          );
        }
        existing.exports.push(entry);
        continue;
      }
      surface[config.name] = {
        exports: [entry],
        schema,
        named,
        generatedAlways: columns.filter((c) => isGeneratedAlways(c)).map((c) => c.name).sort(),
      };
    }
  }
  return surface;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function resolveModule(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else if (specifier.startsWith('@/')) base = path.join(SRC_DIR, specifier.slice(2));
  else return null;
  base = base.replace(/\.js$/, '');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

export interface InsertCallsites {
  /** SQL table name → sorted `path:line` of every direct `.insert()` callsite. */
  byTable: Map<string, string[]>;
  /** `.insert(...)` arguments this resolver could not tie back to `db/schema`. */
  unresolved: string[];
}

/**
 * Every `.insert(x)` callsite under `src/`, with `x` resolved to the SQL table of the
 * `db/schema/*.ts` export it is bound to. An argument that cannot be tied back to the schema is
 * reported, never dropped: silently skipping it is exactly the hole a hand-written table list has.
 */
export function collectDirectInsertCallsites(surface: Record<string, TableSurface>): InsertCallsites {
  const byModuleExport = new Map<string, string>();
  const byExportName = new Map<string, string | null>();
  for (const [table, info] of Object.entries(surface)) {
    for (const { exportName, module } of info.exports) {
      byModuleExport.set(`${path.join(WEBAPP_ROOT, module)}|${exportName}`, table);
      byExportName.set(
        exportName,
        byExportName.has(exportName) && byExportName.get(exportName) !== table ? null : table,
      );
    }
  }

  const byTable = new Map<string, string[]>();
  const unresolved: string[] = [];

  for (const file of sourceFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('.insert(')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const namedImports = new Map<string, { specifier: string; exported: string }>();
    const namespaceImports = new Map<string, string>();
    const localAliases = new Map<string, string>();
    for (const statement of sf.statements) {
      if (
        ts.isImportDeclaration(statement)
        && statement.importClause
        && ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const specifier = statement.moduleSpecifier.text;
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            namedImports.set(element.name.text, {
              specifier,
              exported: (element.propertyName ?? element.name).text,
            });
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          namespaceImports.set(bindings.name.text, specifier);
        }
      }
      if (ts.isVariableStatement(statement)) {
        for (const declared of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declared.name)
            && declared.initializer
            && ts.isIdentifier(declared.initializer)
          ) {
            localAliases.set(declared.name.text, declared.initializer.text);
          }
        }
      }
    }

    const tableForModuleExport = (specifier: string, exported: string): string | null => {
      const resolved = resolveModule(file, specifier);
      if (!resolved) return null;
      const exact = byModuleExport.get(`${resolved}|${exported}`);
      if (exact) return exact;
      // `db/schema/index.ts` re-exports every module: fall back to the unique export name.
      if (resolved.startsWith(SCHEMA_DIR)) return byExportName.get(exported) ?? null;
      return null;
    };

    const tableForName = (name: string, depth = 0): string | null => {
      if (depth > 8) return null;
      const imported = namedImports.get(name);
      if (imported) return tableForModuleExport(imported.specifier, imported.exported);
      const alias = localAliases.get(name);
      if (alias !== undefined) return tableForName(alias, depth + 1);
      return null;
    };

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'insert'
        && node.arguments.length >= 1
      ) {
        const argument = node.arguments[0];
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const where = `${path.relative(REPO_ROOT, file)}:${line}`;
        let table: string | null = null;
        let label: string = ts.SyntaxKind[argument.kind];
        if (ts.isIdentifier(argument)) {
          label = argument.text;
          table = tableForName(argument.text);
        } else if (ts.isPropertyAccessExpression(argument) && ts.isIdentifier(argument.expression)) {
          label = `${argument.expression.text}.${argument.name.text}`;
          const specifier = namespaceImports.get(argument.expression.text);
          if (specifier) table = tableForModuleExport(specifier, argument.name.text);
        }
        if (table) {
          const seen = byTable.get(table);
          if (seen) seen.push(where);
          else byTable.set(table, [where]);
        } else {
          unresolved.push(`${where} .insert(${label})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  for (const callsites of byTable.values()) callsites.sort();
  return { byTable, unresolved };
}
