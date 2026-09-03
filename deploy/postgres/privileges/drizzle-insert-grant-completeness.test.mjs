/**
 * S1 acceptance gate — column-level INSERT grants must cover every column Drizzle NAMES.
 *
 * Named breakage this catches (§10a): staff presses "продать абонемент", the webapp runs
 * `insert into "be_patient_package_items" ("id", …) values (default, $1, …)` as `app_staff`,
 * and Postgres answers `42501 permission denied for table be_patient_package_items` because
 * the column grant omits `id`. The package is not created; the same class breaks every other
 * staff/admin write whose grant was hand-written from "business columns".
 *
 * The oracle has ONE source of truth on each side and no hand-written table list:
 *
 *   required columns  ← real Drizzle metadata (`getTableColumns` + `Column.shouldDisableInsert`)
 *                       via `apps/webapp/scripts/print-drizzle-insert-columns.ts`;
 *   reachable tables  ← every `db.insert(<table>)` callsite in `apps/webapp/src`, resolved
 *                       through the TypeScript AST and the file's import graph to the exact
 *                       `db/schema/*.ts` export (aliases followed);
 *   reachable roles   ← `declaration.portContext.capabilities`: the `targetRole` of every
 *                       webapp capability with `purpose: 'relation'`. Only those roles can
 *                       ever execute a webapp relational (Drizzle) statement, so only their
 *                       grants are held to the Drizzle column set;
 *   granted columns   ← the emitted `declaration`, i.e. exactly what the generator writes,
 *                       for every managed database.
 *
 * Deliberately NOT asserted, because the evidence does not reach there:
 *   - relations with a column INSERT grant but no Drizzle `.insert()` callsite — their grant
 *     serves raw SQL or a SECURITY DEFINER body that names its own columns, and widening it
 *     from ORM metadata would be an unproven privilege broadening;
 *   - roles with no webapp `purpose: 'relation'` capability (`app_tenant_service`, the
 *     `app_seam_*` owners, integrator roles) — same reason, from the other side;
 *   - columns granted beyond the Drizzle set (over-grant is a different class than 42501).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { declaration } from './declaration.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WEBAPP_ROOT = path.join(REPO_ROOT, 'apps/webapp');
const WEBAPP_SRC = path.join(WEBAPP_ROOT, 'src');
const SCHEMA_DIR = path.join(WEBAPP_ROOT, 'db/schema');

/** Real Drizzle metadata: { table: { exports, named, generatedAlways } }. */
function drizzleInsertSurface() {
  return JSON.parse(
    execFileSync('node_modules/.bin/tsx', ['scripts/print-drizzle-insert-columns.ts'], {
      cwd: WEBAPP_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

function sourceFiles(dir, out = []) {
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

function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else if (specifier.startsWith('@/')) base = path.join(WEBAPP_SRC, specifier.slice(2));
  else return null;
  base = base.replace(/\.js$/, '');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every `.insert(x)` callsite under `apps/webapp/src`, with `x` resolved to the SQL table of
 * the `db/schema/*.ts` export it is bound to. Returns { targets, unresolved }; `unresolved`
 * must stay empty — an argument this resolver cannot tie back to the schema is exactly the
 * hole a hand-written table list would leave open.
 */
function drizzleInsertCallsites(surface) {
  const byModuleExport = new Map();
  const byExportName = new Map();
  for (const [table, info] of Object.entries(surface)) {
    for (const { exportName, module } of info.exports) {
      byModuleExport.set(`${path.join(WEBAPP_ROOT, module)}|${exportName}`, table);
      byExportName.set(exportName, byExportName.has(exportName) && byExportName.get(exportName) !== table
        ? null
        : table);
    }
  }

  const targets = new Map();
  const unresolved = [];

  for (const file of sourceFiles(WEBAPP_SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('.insert(')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const namedImports = new Map();
    const namespaceImports = new Map();
    const localAliases = new Map();
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
          if (ts.isIdentifier(declared.name) && declared.initializer && ts.isIdentifier(declared.initializer)) {
            localAliases.set(declared.name.text, declared.initializer.text);
          }
        }
      }
    }

    const tableForModuleExport = (specifier, exported) => {
      const module = resolveModule(file, specifier);
      if (!module) return null;
      const exact = byModuleExport.get(`${module}|${exported}`);
      if (exact) return exact;
      // `db/schema/index.ts` re-exports every module: fall back to the unique export name.
      if (module.startsWith(SCHEMA_DIR)) return byExportName.get(exported) ?? null;
      return null;
    };

    const tableForName = (name, depth = 0) => {
      if (depth > 8) return null;
      if (namedImports.has(name)) {
        const { specifier, exported } = namedImports.get(name);
        return tableForModuleExport(specifier, exported);
      }
      if (localAliases.has(name)) return tableForName(localAliases.get(name), depth + 1);
      return null;
    };

    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'insert'
        && node.arguments.length >= 1
      ) {
        const argument = node.arguments[0];
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const where = `${path.relative(REPO_ROOT, file)}:${line}`;
        let table = null;
        let label = ts.SyntaxKind[argument.kind];
        if (ts.isIdentifier(argument)) {
          label = argument.text;
          table = tableForName(argument.text);
        } else if (ts.isPropertyAccessExpression(argument) && ts.isIdentifier(argument.expression)) {
          label = `${argument.expression.text}.${argument.name.text}`;
          const specifier = namespaceImports.get(argument.expression.text);
          if (specifier) table = tableForModuleExport(specifier, argument.name.text);
        }
        if (table) {
          if (!targets.has(table)) targets.set(table, []);
          targets.get(table).push(where);
        } else {
          unresolved.push(`${where} .insert(${label})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { targets, unresolved };
}

/** Roles a webapp relational (Drizzle) statement can actually run as. */
function webappRelationRoles() {
  return new Set(
    Object.values(declaration.portContext.capabilities)
      .filter((capability) => capability.purpose === 'relation' && capability.port === 'webapp')
      .map((capability) => capability.targetRole),
  );
}

/** Every column-scoped INSERT grant the generator emits, per managed database. */
function columnInsertGrants() {
  const rows = [];
  for (const [database, dbDeclaration] of Object.entries(declaration.databases)) {
    for (const [relation, table] of Object.entries(dbDeclaration.tables)) {
      for (const [role, grant] of Object.entries(table.grants ?? {})) {
        for (const priv of grant.privs ?? []) {
          if (typeof priv !== 'object' || priv.kind !== 'columns' || priv.priv !== 'INSERT') continue;
          rows.push({ database, relation, role, columns: [...priv.columns].sort() });
        }
      }
    }
  }
  return rows;
}

const surface = drizzleInsertSurface();
const { targets, unresolved } = drizzleInsertCallsites(surface);

test('every apps/webapp/src .insert() callsite resolves to a declared Drizzle table', () => {
  assert.deepEqual(
    unresolved,
    [],
    'a `.insert(...)` argument could not be tied back to db/schema — the gate below would '
      + 'silently skip that relation, which is the failure mode a hand-written list has',
  );
  assert.ok(targets.size > 0, 'no Drizzle insert callsite found at all — the scan is broken');
});

test('the required column set is the set Drizzle names, generated-always columns excluded', () => {
  const overlapping = [];
  let generatedAlwaysSeen = 0;
  for (const [table, info] of Object.entries(surface)) {
    generatedAlwaysSeen += info.generatedAlways.length;
    const overlap = info.named.filter((column) => info.generatedAlways.includes(column));
    if (overlap.length > 0) overlapping.push(`${table}: ${overlap.join(', ')}`);
  }
  assert.deepEqual(overlapping, [], 'a generated-always column must never be required in a grant');
  assert.ok(
    generatedAlwaysSeen > 0,
    'no generated-always column in the schema — the exclusion above would be vacuous, so this '
      + 'gate could no longer prove it does not demand an ungrantable column',
  );
});

test('column-level INSERT grants name every column Drizzle names', () => {
  const roles = webappRelationRoles();
  const missing = [];
  const inScope = new Map();

  for (const row of columnInsertGrants()) {
    if (!row.relation.startsWith('public.')) continue;
    if (!roles.has(row.role)) continue;
    const table = row.relation.slice('public.'.length);
    if (!targets.has(table)) continue;
    inScope.set(`${row.database}|${row.relation}|${row.role}`, true);
    const absent = surface[table].named.filter((column) => !row.columns.includes(column));
    if (absent.length > 0) {
      missing.push(
        `${row.database} ${row.role} ${row.relation}: not granted ${absent.join(', ')}`
          + ` (first callsite ${targets.get(table)[0]})`,
      );
    }
  }

  const perDatabase = Object.keys(declaration.databases).length;
  console.log(
    `[S1] column INSERT (role, table) pairs with a live Drizzle .insert() callsite and a webapp `
      + `relation capability: ${inScope.size / perDatabase} per database `
      + `(${inScope.size} across ${perDatabase} managed databases)`,
  );

  assert.deepEqual(missing.sort(), [], `Drizzle names these columns; the grant does not:\n${missing.join('\n')}`);
});
