#!/usr/bin/env node
/**
 * Production relation-use census for the privilege declaration.
 * Tests, migrations, scripts and documentation are intentionally excluded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const productionRoots = [
  'apps/webapp/src',
  'apps/integrator/src',
  'apps/media-worker/src',
  'packages',
].map((root) => path.join(repoRoot, root));
const schemaRoots = [
  path.join(repoRoot, 'apps/webapp/db/schema'),
  path.join(repoRoot, 'apps/integrator/src/infra/db/schema'),
];
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const testFile = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test(?:\/|$))/;

function walk(directory, accept) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(target, accept));
    else if (accept(target)) found.push(target);
  }
  return found;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineHits(file, pattern) {
  const hits = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) hits.push(index + 1);
    pattern.lastIndex = 0;
  }
  return hits;
}

function relationSymbols() {
  const symbols = new Map();
  const schemaFiles = schemaRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file)));
  for (const file of schemaFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:pgTable|pgSchema\([^)]*\)\.)?(?:table|pgTable)\s*\(\s*['"]([^'"]+)['"]/g)) {
      const [, symbol, table] = match;
      const schema = file.includes('/apps/integrator/') ? 'integrator' : 'public';
      const identity = `${schema}.${table}`;
      const current = symbols.get(identity) ?? new Set();
      current.add(symbol);
      symbols.set(identity, current);
    }
  }
  return symbols;
}

export function productionRelationHits(identities) {
  const files = productionRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file) && !testFile.test(file)));
  const symbols = relationSymbols();
  const rows = new Map();
  for (const identity of identities) {
    const [, table] = identity.split('.');
    const names = [identity, table, ...(symbols.get(identity) ?? [])];
    const pattern = new RegExp(`\\b(?:${names.map(escapeRegex).join('|')})\\b`);
    const hits = [];
    for (const file of files) {
      const lines = lineHits(file, pattern);
      if (lines.length) hits.push(`${path.relative(repoRoot, file)}:${lines.slice(0, 6).join(',')}`);
    }
    rows.set(identity, hits);
  }
  return rows;
}

export function assertNoUndeclaredRuntimeSurface(declaration, dbName) {
  const database = declaration.databases[dbName];
  if (!database) throw new Error(`undeclared database '${dbName}'`);
  const active = Object.entries(database.tables).filter(([, table]) => table.disposition === 'ACTIVE');
  const hits = productionRelationHits(active.map(([identity]) => identity));
  const failures = [];
  for (const [identity, table] of active) {
    const access = table.access;
    const paths = hits.get(identity) ?? [];
    if (access?.kind === 'no-runtime-surface' && paths.length > 0) {
      failures.push(`no-runtime-surface has production callsite ${identity}: ${paths.join(' ')}`);
    }
    if (access?.kind === 'direct') {
      if (access.codePaths.length === 0 || paths.length === 0) {
        failures.push(`direct access lacks production relation callsite ${identity}`);
      }
      const expected = new Map(access.grants.map((grant) => [grant.role, grant]));
      const seamOwners = new Set(access.seams.map((seam) => seam.owner));
      for (const [role, grant] of Object.entries(table.grants ?? {})) {
        const wanted = expected.get(role);
        if (!wanted) {
          if (!seamOwners.has(role)) failures.push(`direct access grant role is absent from direct/seam matrix ${identity}:${role}`);
          continue;
        }
        const matches = wanted.operations.every((operation) => (grant.privs ?? []).some((actual) => {
          if (wanted.columns === 'table') return actual === operation;
          return typeof actual === 'object' && actual.kind === 'columns' && actual.priv === operation
            && actual.columns.length === wanted.columns.length
            && actual.columns.every((column) => wanted.columns.includes(column));
        }));
        if (!matches) {
          failures.push(`direct access grant is not declared by the exact matrix ${identity}:${role}`);
        }
      }
      for (const role of expected.keys()) {
        if (!(role in (table.grants ?? {}))) failures.push(`direct access role lacks relation grant ${identity}:${role}`);
      }
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {
    files: productionRoots.flatMap((root) => walk(root, (file) => sourceExtension.test(file) && !testFile.test(file))).length,
    hits,
  };
}

/* ============================================================================================
 * ПРИНЦИПАЛ ВЫЗЫВАЮЩЕЙ ТОЧКИ (A3, системный аудит 27.08)
 *
 * До этого шага перепись знала ИМЯ ФАЙЛА, который обращается к отношению, и не знала, под какой
 * ролью этот файл исполняется.  Поэтому `public.content_access_grants_webapp` могла объявить
 * `apps/webapp/src/infra/repos/pgEntitlements.ts` своим callsite, иметь ноль прав у `app_patient`
 * и остаться зелёной: перепись видела «callsite есть» и на этом заканчивала.  Живой пациент
 * получал `42501` и SSR 500 на странице контента.
 *
 * Здесь принципал ВЫВОДИТСЯ, а не объявляется: модуль, достижимый ТОЛЬКО с пациентской
 * поверхности (`app/app/patient/**`, `app/api/patient/**`) и ни с какой другой, исполняется под
 * пациентским принципалом — других вызывающих у него нет.  Такому модулю запрещено обращаться к
 * отношению, у которого нет пациентской двери: ни прямого гранта `app_patient`, ни именованного
 * корня, который `app_patient` имеет право исполнять.
 * ========================================================================================== */

const webappSourceRoot = path.join(repoRoot, 'apps/webapp/src');
const webappDependencyInjection = path.join(webappSourceRoot, 'app-layer/di/buildAppDeps.ts');
const routeEntryPoint = /\/(?:page|layout|route|default|template)\.(?:tsx?|jsx?)$/;
const patientSurfaces = ['app/app/patient', 'app/api/patient'];
const moduleExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx'];

const fileTextCache = new Map();
function fileText(file) {
  let text = fileTextCache.get(file);
  if (text === undefined) {
    text = fs.readFileSync(file, 'utf8');
    fileTextCache.set(file, text);
  }
  return text;
}

/** `@/x` и относительные спецификаторы — единственные, что ведут внутрь webapp. */
function resolveModuleSpecifier(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(webappSourceRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const extension of moduleExtensions) if (fs.existsSync(base + extension)) return base + extension;
  for (const extension of moduleExtensions) {
    const indexFile = path.join(base, `index${extension}`);
    if (fs.existsSync(indexFile)) return indexFile;
  }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null;
}

function moduleSpecifiers(text) {
  return [
    ...[...text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/gu)].map((match) => match[1]),
    ...[...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/gu)].map((match) => match[1]),
  ];
}

/**
 * Контейнер внедрения зависимостей — не обычный импорт: страница берёт из него ОДИН ключ, а не всю
 * поверхность.  Поэтому граф в него не проваливается целиком, а разбирает `deps.<ключ>` до модуля
 * фабрики, которая этот ключ собирает.  Без этого шага `pgEntitlements.ts` вообще не считался бы
 * достижимым с пациентской страницы — именно там разрыв A2 и жил.
 */
function dependencyKeyModules() {
  const text = fileText(webappDependencyInjection);
  const imported = new Map();
  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gu)) {
    const target = resolveModuleSpecifier(webappDependencyInjection, match[2]);
    if (!target) continue;
    for (const name of match[1].split(',').map((part) => part.trim().split(/\s+as\s+/u).pop()).filter(Boolean)) {
      imported.set(name, target);
    }
  }
  const assignments = new Map();
  for (const pattern of [
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:!][^=\n]*=\s*([\s\S]*?);\n/gu,
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);\n/gu,
    /^\s*([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);\n/gmu,
  ]) {
    for (const match of text.matchAll(pattern)) if (!assignments.has(match[1])) assignments.set(match[1], match[2]);
  }
  const modulesFor = (identifier, seen = new Set()) => {
    if (seen.has(identifier)) return [];
    seen.add(identifier);
    const found = [];
    if (imported.has(identifier)) found.push(imported.get(identifier));
    const body = assignments.get(identifier);
    if (body) {
      for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/gu)) found.push(...modulesFor(match[1], seen));
    }
    return found;
  };
  const byKey = new Map();
  for (const match of text.matchAll(/^\s{4}(\w+):\s*([A-Za-z_$][\w$]*)\s*,\s*$/gmu)) {
    const modules = [...new Set(modulesFor(match[2]))];
    if (modules.length > 0) byKey.set(match[1], modules);
  }
  return byKey;
}

function moduleClosure(entryPoints, keyModules) {
  const reached = new Set();
  const pending = [...entryPoints];
  const usedKeys = new Set();
  const follow = () => {
    while (pending.length > 0) {
      const file = pending.pop();
      if (reached.has(file)) continue;
      reached.add(file);
      const text = fileText(file);
      for (const match of text.matchAll(/\bdeps\.(\w+)/gu)) usedKeys.add(match[1]);
      for (const specifier of moduleSpecifiers(text)) {
        const target = resolveModuleSpecifier(file, specifier);
        if (target && target !== webappDependencyInjection) pending.push(target);
      }
    }
  };
  follow();
  for (const key of usedKeys) for (const module of keyModules.get(key) ?? []) pending.push(module);
  follow();
  return reached;
}

/**
 * Модули, у которых пациентская поверхность — ЕДИНСТВЕННЫЙ вход. Достижимость с любой другой
 * поверхности снимает вывод о принципале: тот же модуль вызывают и под сотрудником.
 */
export function patientOnlyModules() {
  const appRoot = path.join(webappSourceRoot, 'app');
  const entryPoints = walk(appRoot, (file) => sourceExtension.test(file) && !testFile.test(file))
    .filter((file) => routeEntryPoint.test(file));
  const patientRoots = entryPoints.filter((file) => patientSurfaces
    .some((surface) => file.startsWith(path.join(webappSourceRoot, surface) + path.sep)));
  const otherRoots = entryPoints.filter((file) => !patientRoots.includes(file));
  const keyModules = dependencyKeyModules();
  const patientClosure = moduleClosure(patientRoots, keyModules);
  const otherClosure = moduleClosure(otherRoots, keyModules);
  return new Set([...patientClosure]
    .filter((file) => !otherClosure.has(file))
    .map((file) => path.relative(repoRoot, file)));
}

/** Отношения, у которых пациентская дверь ЕСТЬ: прямой грант либо именованный корень для `app_patient`. */
export function relationsWithPatientDoor(declaration, dbName) {
  const database = declaration.databases[dbName];
  if (!database) throw new Error(`undeclared database '${dbName}'`);
  const doors = new Set();
  for (const [identity, table] of Object.entries(database.tables)) {
    if (table.disposition !== 'ACTIVE') continue;
    if (Object.keys(table.grants ?? {}).includes('app_patient')) {
      doors.add(identity);
      continue;
    }
    const access = table.access;
    const seams = access && (access.kind === 'direct' || access.kind === 'named-seams') ? access.seams : [];
    if (seams.some((seam) => (seam.callers ?? []).includes('app_patient'))) doors.add(identity);
  }
  return doors;
}

/**
 * Обращение к отношению — символ Drizzle или квалифицированное имя В КОДЕ. Строковые литералы
 * вырезаны: `'recommendations'` как идентификатор вкладки в клиентском компоненте — английское
 * слово, а не доступ к таблице, и гейт, который этого не различает, тонет в собственном шуме.
 */
function namesRelationInCode(text, patterns) {
  const code = text
    .replace(/'(?:\\.|[^'\\])*'/gu, " '' ")
    .replace(/"(?:\\.|[^"\\])*"/gu, ' "" ');
  return patterns.test(code);
}

function relationCodePatterns(identity, symbols) {
  const names = [identity, ...(symbols.get(identity) ?? [])];
  return new RegExp(`\\b(?:${names.map(escapeRegex).join('|')})\\b`, 'u');
}

/**
 * ГЕЙТ A3. Пациентский callsite нельзя объявить на отношении без пациентской двери.
 * Отрицательная инъекция: снять `app_patient` с грантов/корней такого отношения — и он краснеет.
 */
export function assertPatientCallsiteDoors(declaration, dbName) {
  const database = declaration.databases[dbName];
  if (!database) throw new Error(`undeclared database '${dbName}'`);
  const doors = relationsWithPatientDoor(declaration, dbName);
  const patientOnly = patientOnlyModules();
  const symbols = relationSymbols();
  const failures = [];
  for (const [identity, table] of Object.entries(database.tables)) {
    if (table.disposition !== 'ACTIVE' || doors.has(identity)) continue;
    const access = table.access;
    if (access?.kind !== 'direct') continue;
    const patterns = relationCodePatterns(identity, symbols);
    for (const codePath of access.codePaths ?? []) {
      if (!patientOnly.has(codePath)) continue;
      const absolute = path.join(repoRoot, codePath);
      if (!fs.existsSync(absolute)) continue;
      if (!namesRelationInCode(fileText(absolute), patterns)) continue;
      failures.push(
        `patient-only callsite reaches a relation with no app_patient door ${identity}: ${codePath};`
        + ' declare a narrow app_patient grant or a named root the patient may execute',
      );
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { patientOnlyModules: patientOnly.size, relationsWithPatientDoor: doors.size };
}

function main() {
  const relation = process.argv[2];
  if (!relation) throw new Error('usage: node access-census.mjs <schema.relation> [...]');
  const hits = productionRelationHits(process.argv.slice(2));
  for (const [identity, paths] of hits) {
    console.log(`${identity}\t${paths.length === 0 ? 'NO_RUNTIME_CALLSITE' : paths.join(' ')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
