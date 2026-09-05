/**
 * Live Drizzle UPDATE surface of the webapp schema, in one place.
 *
 * Mirrors `./drizzle-insert-surface.ts` for `.update(<table>).set({...})`. Added by the #1069
 * correction (docs/_TODO/runs/saas-period-grid-20260905/AUDIT.md F-1): the SaaS billing-period ship
 * added two subscription columns; the INSERT grant self-healed once the insert-surface artifact was
 * regenerated (S1's mechanism below), but there was no equivalent for UPDATE, so the column-level
 * UPDATE grant stayed hand-authored in a second file and nobody updated it — `42501` on every
 * purchase. This module gives UPDATE the same machine-derived evidence.
 *
 * UNLIKE INSERT, Postgres does not force every schema column to be NAMED in an UPDATE statement —
 * only the ones a callsite actually sets — so there is no "DEFAULT column" widening to encode here.
 * `declaration.ts` therefore never widens a grant from this data (see its SECTION -1): it only
 * FAILS CLOSED when a column this surface proves is written is missing from a declared grant. No
 * merge of two authorities happens during generation — a human still decides the grant; this module
 * only proves what the declaration is obligated to already cover.
 *
 * The surface is a lexical LOWER bound, not an exhaustive one: only `.update(<table>).set({...})`
 * calls where `{...}` is a plain object literal with static (non-computed, non-spread) keys can be
 * resolved to SQL column names. A `.set(patch)` call whose argument is a variable, a spread, or a
 * computed key cannot be read lexically and is reported in `unresolvedUpdateCallsites`, never
 * silently dropped — same discipline `drizzle-insert-surface.ts` uses for `.insert()` arguments it
 * cannot resolve to a schema export.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getTableColumns, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import ts from 'typescript';

import { REPO_ROOT, WEBAPP_ROOT, resolveModule, sourceFiles } from './drizzle-insert-surface';

export { REPO_ROOT, WEBAPP_ROOT };

const SCHEMA_DIR = path.join(WEBAPP_ROOT, 'db', 'schema');
const SRC_DIR = path.join(WEBAPP_ROOT, 'src');
const NON_TABLE_MODULES = new Set(['index.ts', 'relations.ts']);

export interface UpdateTableSurface {
  /** Every `db/schema/*.ts` export bound to this SQL table. */
  exports: { exportName: string; module: string }[];
  /** SQL schema the table lives in (`public` unless a `pgSchema` says otherwise). */
  schema: string;
  /** SQL column name, keyed by the JS field name Drizzle exposes it under (`getTableColumns`). */
  columnNameByField: Record<string, string>;
}

/** Same schema walk as `collectDrizzleInsertSurface`, keyed to the JS field → SQL column mapping
 *  UPDATE needs instead of the INSERT-named column list. */
export async function collectDrizzleUpdateColumnMap(): Promise<Record<string, UpdateTableSurface>> {
  const files = readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith('.ts') && !NON_TABLE_MODULES.has(file))
    .sort();
  const surface: Record<string, UpdateTableSurface> = {};
  for (const file of files) {
    const loaded: Record<string, unknown> = await import(
      pathToFileURL(path.join(SCHEMA_DIR, file)).href
    );
    for (const [exportName, value] of Object.entries(loaded)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const entry = { exportName, module: `db/schema/${file}` };
      const columnNameByField = Object.fromEntries(
        Object.entries(getTableColumns(value)).map(([field, column]) => [field, column.name]),
      );
      const schema = config.schema ?? 'public';
      const existing = surface[config.name];
      if (existing) {
        // The insert scanner refuses two disagreeing models on the same SQL table (S1 territory);
        // by the time this walk runs that invariant already held, so appending is safe here.
        existing.exports.push(entry);
        continue;
      }
      surface[config.name] = { exports: [entry], schema, columnNameByField };
    }
  }
  return surface;
}

export interface UpdateCallsites {
  /** SQL table name → SQL columns a `.set({...})` literal proves written, plus where. */
  byTable: Map<string, { columns: Set<string>; where: string[] }>;
  /** `.update(...).set(...)` callsites this scan could not resolve lexically, never dropped. */
  unresolved: string[];
}

/**
 * Every `.update(x).set({...})` callsite under `src/`, with `x` resolved to the SQL table of the
 * `db/schema/*.ts` export it is bound to and `{...}`'s static property keys resolved to SQL column
 * names via `columnNameByField`.
 */
export function collectDirectUpdateCallsites(
  surface: Record<string, UpdateTableSurface>,
): UpdateCallsites {
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

  const byTable = new Map<string, { columns: Set<string>; where: string[] }>();
  const unresolved: string[] = [];

  for (const file of sourceFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('.update(')) continue;
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
        && node.arguments.length === 1
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'set'
        && ts.isCallExpression(node.expression.expression)
        && ts.isPropertyAccessExpression(node.expression.expression.expression)
        && node.expression.expression.expression.name.text === 'update'
        && node.expression.expression.arguments.length >= 1
      ) {
        const updateCall = node.expression.expression;
        const updateArg = updateCall.arguments[0];
        const setArg = node.arguments[0];
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const where = `${path.relative(REPO_ROOT, file)}:${line}`;
        let table: string | null = null;
        let label = ts.SyntaxKind[updateArg.kind];
        if (ts.isIdentifier(updateArg)) {
          label = updateArg.text;
          table = tableForName(updateArg.text);
        } else if (ts.isPropertyAccessExpression(updateArg) && ts.isIdentifier(updateArg.expression)) {
          label = `${updateArg.expression.text}.${updateArg.name.text}`;
          const specifier = namespaceImports.get(updateArg.expression.text);
          if (specifier) table = tableForModuleExport(specifier, updateArg.name.text);
        }
        if (!table) {
          unresolved.push(`${where} .update(${label}).set(...) — table not resolved to a schema export`);
        } else if (!ts.isObjectLiteralExpression(setArg)) {
          unresolved.push(`${where} .update(${label}).set(...) — set() argument is not an object literal`);
        } else {
          const fieldMap = surface[table]?.columnNameByField ?? {};
          const entry = byTable.get(table) ?? { columns: new Set<string>(), where: [] };
          let dynamicKeys = false;
          for (const property of setArg.properties) {
            let key: string | null = null;
            if (
              ts.isPropertyAssignment(property)
              && !ts.isComputedPropertyName(property.name)
              && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ) {
              key = property.name.text;
            } else if (ts.isShorthandPropertyAssignment(property)) {
              key = property.name.text;
            } else {
              dynamicKeys = true; // spread or computed key — cannot name the column lexically
              continue;
            }
            const column = fieldMap[key];
            if (column) entry.columns.add(column);
            else dynamicKeys = true; // key not a known field of this table's Drizzle model
          }
          entry.where.push(where);
          byTable.set(table, entry);
          if (dynamicKeys) {
            unresolved.push(
              `${where} .update(${label}).set({...}) — some keys did not resolve to a declared column`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  for (const entry of byTable.values()) entry.where.sort();
  return { byTable, unresolved };
}
