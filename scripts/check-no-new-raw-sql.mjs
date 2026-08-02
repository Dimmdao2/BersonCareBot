#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { posix as posixPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = ['apps/integrator/src', 'apps/media-worker/src', 'apps/webapp/src'];

// Каталог самого порта. Сырой драйвер обязан жить ЗДЕСЬ и больше нигде: транзакция
// (BEGIN/COMMIT), установка принципала, маршрутизация пулов, мост `$n` → drizzle и загрузочная
// проба — это и есть порт, а не долг. Всё, что вне этих каталогов и не тест, обязано ходить через
// него. Владелец 01.08: «сырого sql и запросов мимо порта не должно остаться вообще».
const portDirs = ['apps/webapp/src/infra/db/'];

// media-worker — плоское приложение, каталога `infra/db` у него нет: порт — вот эти три файла
// (мост `sql`→текст+параметры, BEGIN/COMMIT и установка принципала на пуле — ровно то, что у
// вебаппа лежит в `infra/db`). Это НЕ список долга: сюда нельзя дописать файл, чтобы «разрешить
// себе» сырой запрос, — эти три и есть сам порт.
const portFiles = new Set([
  'apps/media-worker/src/poolProvider.ts',
  'apps/media-worker/src/runMediaWorkerSql.ts',
  'apps/media-worker/src/withClient.ts',
]);

function isInsidePort(fileName) {
  return portDirs.some((dir) => fileName.startsWith(dir)) || portFiles.has(fileName);
}

// Frozen D18a inventory of every existing raw .query() call. Do not add entries:
// a newly added call must use the application's Drizzle port instead. D18c removes
// entries as the legacy calls are converted. Keep each app's entries sorted.
const rawSqlQueryManifest = {
  integrator: new Set([
    'apps/integrator/src/infra/db/client.ts',
    'apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts',
    'apps/integrator/src/infra/db/integratorPoolProvider.ts',
    'apps/integrator/src/infra/db/migrate.ts',
    'apps/integrator/src/infra/db/repos/projectionHealthCore.ts',
    'apps/integrator/src/infra/db/runIntegratorSql.ts',
    'apps/integrator/src/infra/db/withClient.ts',
  ]),
  webapp: new Set([
    'apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserFullPurge.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserMergePreview.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/orgBrandRevisionGuard.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgAuthRateLimitEvents.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.readChokepoint.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorClients.appointmentJoin.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorClients.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorPhase13d.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgEmailChallengeAtomicAttempts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgOnlineIntake.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPatientBookings.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPhase14DCommsTail.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgSupportCommunication.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgUserProjection.devDb.integration.test.ts',
  ]),
};

function listSourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) files.push(...listSourceFiles(abs));
    else if (/\.(?:[cm]?ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) files.push(abs);
  }
  return files;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

// Fixed point over plain string-literal propagation: `const method = 'query';` and any
// chain of reassignment from it. This exists solely to recognize `pool[method](...)` as
// the same door as `pool['query'](...)` — it does not attempt general string analysis.
function computeQueryLiteralAliases(sourceFile) {
  const literalAliases = new Set();
  const isQueryLiteral = (expr) => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
      return expr.text === 'query';
    if (ts.isIdentifier(expr)) return literalAliases.has(expr.text);
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isQueryLiteral(node.initializer) &&
        !literalAliases.has(node.name.text)
      ) {
        literalAliases.add(node.name.text);
        changed = true;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isQueryLiteral(node.right) &&
        !literalAliases.has(node.left.text)
      ) {
        literalAliases.add(node.left.text);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return literalAliases;
}

// `queryLiteralAliases` lets a computed member access resolve `pool[method]` back to
// `pool['query']` when `method` is provably the string literal `'query'`.
function makeIsQueryMember(queryLiteralAliases) {
  return function isQueryMember(node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'query') return true;
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const arg = node.argumentExpression;
      if (
        (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
        arg.text === 'query'
      ) {
        return true;
      }
      if (ts.isIdentifier(arg) && queryLiteralAliases.has(arg.text)) return true;
    }
    return false;
  };
}

// Resolve aliases to a fixed point so `const other = query` is guarded too. This
// deliberately tracks only values proven to originate at `.query`, not arbitrary
// identifier calls such as a product search helper named `query`. `seedAliases` lets
// a cross-file caller pre-load names imported from another file's proven alias export.
function computeLocalQueryAliases(sourceFile, isQueryMember, seedAliases) {
  const queryAliases = new Set(seedAliases);

  const isQueryAliasSource = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isIdentifier(expression)) return queryAliases.has(expression.text);
    if (isQueryMember(expression)) return true;
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      return isQueryAliasSource(expression.expression);
    }
    if (ts.isCallExpression(expression)) return isQueryAliasSource(expression.expression);
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isQueryAliasSource(node.initializer) &&
        !queryAliases.has(node.name.text)
      ) {
        queryAliases.add(node.name.text);
        changed = true;
      }
      // `const { query } = pool;` (optionally renamed: `const { query: q } = pool;`) is the
      // same door as `pool.query` regardless of what `pool` itself proves to be — matching how
      // `pool.query` is flagged without checking that `pool` is a real driver instance.
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
          const propertyName = element.propertyName
            ? ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : ts.isStringLiteral(element.propertyName)
                ? element.propertyName.text
                : undefined
            : element.name.text;
          if (propertyName === 'query' && !queryAliases.has(element.name.text)) {
            queryAliases.add(element.name.text);
            changed = true;
          }
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isQueryAliasSource(node.right) &&
        !queryAliases.has(node.left.text)
      ) {
        queryAliases.add(node.left.text);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return queryAliases;
}

function computeQueryCallLines(sourceFile, isQueryMember, queryAliases) {
  const lines = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      if (
        isQueryMember(expression) ||
        (ts.isIdentifier(expression) && queryAliases.has(expression.text))
      ) {
        lines.add(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...lines].sort((a, b) => a - b);
}

// Which of this file's proven query aliases are visible to an importer, and under what
// exported name (`export const x = ...` and `export { x as y }` both count).
function collectExportedAliasNames(sourceFile, queryAliases) {
  const exported = new Set();
  const visit = (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && queryAliases.has(decl.name.text)) {
          exported.add(decl.name.text);
        }
      }
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        const localName = (element.propertyName ?? element.name).text;
        if (queryAliases.has(localName)) exported.add(element.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return exported;
}

function collectRelativeImportBindings(sourceFile) {
  const imports = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.')
    ) {
      const namedBindings = statement.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          imports.push({
            specifier: statement.moduleSpecifier.text,
            importedName: (element.propertyName ?? element.name).text,
            localName: element.name.text,
          });
        }
      }
    }
  }
  return imports;
}

function resolveRelativeImport(fromFile, specifier, knownFiles) {
  const fromDir = posixPath.dirname(fromFile);
  const base = posixPath.normalize(posixPath.join(fromDir, specifier));
  const stripped = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
  const candidates = [
    base,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

// Project-wide pass: resolves a query alias re-exported through a relative helper and
// imported by a consumer file, so moving the door behind an import can't clear the gate.
// `fileSources` is a `Map<relPath, source>` — real files for the live scan, or a small
// synthetic project for the self-test.
function analyzeProject(fileSources) {
  const sourceFiles = new Map();
  const literalAliasesByFile = new Map();
  for (const [rel, source] of fileSources) {
    const sourceFile = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
    sourceFiles.set(rel, sourceFile);
    literalAliasesByFile.set(rel, computeQueryLiteralAliases(sourceFile));
  }

  const seedsByFile = new Map([...sourceFiles.keys()].map((rel) => [rel, new Set()]));
  let queryAliasesByFile = new Map();
  let exportsByFile = new Map();

  let changed = true;
  while (changed) {
    changed = false;
    for (const [rel, sourceFile] of sourceFiles) {
      const isQueryMember = makeIsQueryMember(literalAliasesByFile.get(rel));
      const queryAliases = computeLocalQueryAliases(
        sourceFile,
        isQueryMember,
        seedsByFile.get(rel),
      );
      queryAliasesByFile.set(rel, queryAliases);
      exportsByFile.set(rel, collectExportedAliasNames(sourceFile, queryAliases));
    }
    for (const [rel, sourceFile] of sourceFiles) {
      const seedSet = seedsByFile.get(rel);
      for (const { specifier, importedName, localName } of collectRelativeImportBindings(
        sourceFile,
      )) {
        const resolved = resolveRelativeImport(rel, specifier, sourceFiles);
        if (!resolved) continue;
        const targetExports = exportsByFile.get(resolved);
        if (targetExports?.has(importedName) && !seedSet.has(localName)) {
          seedSet.add(localName);
          changed = true;
        }
      }
    }
  }

  const linesByFile = new Map();
  for (const [rel, sourceFile] of sourceFiles) {
    const isQueryMember = makeIsQueryMember(literalAliasesByFile.get(rel));
    linesByFile.set(
      rel,
      computeQueryCallLines(sourceFile, isQueryMember, queryAliasesByFile.get(rel)),
    );
  }
  return linesByFile;
}

function rawSqlQueryLines(fileName, source) {
  return analyzeProject(new Map([[fileName, source]])).get(fileName);
}

function offendersFromLines(fileName, lines, allowedFiles) {
  if (lines.length === 0 || allowedFiles.has(fileName) || isInsidePort(fileName)) return [];
  return [`${fileName}:${lines.join(',')}`];
}

function rawSqlOffenders(fileName, source, allowedFiles) {
  return offendersFromLines(fileName, rawSqlQueryLines(fileName, source), allowedFiles);
}

function staleDebtEntries(manifest, liveDebt) {
  return Object.entries(manifest).flatMap(([app, files]) =>
    [...files]
      .filter((file) => !liveDebt[app].has(file))
      .map((file) => `${file} (remove its cleaned entry)`),
  );
}

function printViolation(offenders, staleDebt) {
  console.error('check-no-new-raw-sql: raw SQL debt manifest violation.');
  if (offenders.length > 0) {
    console.error('New raw .query(...) SQL outside the frozen D18c debt list:');
    for (const offender of offenders) console.error(`  - ${offender}`);
    console.error(
      "Use the owning application's Drizzle port/parameterized sql`...`.execute() path; do not add files to this list.",
    );
  }
  if (staleDebt.length > 0) {
    console.error('Debt-list entries without a live raw .query(...) SQL call:');
    for (const stale of staleDebt) console.error(`  - ${stale}`);
  }
}

function runSelfTest() {
  const fixtures = [
    [
      'comment (`--` and `/* */`)',
      "pool.query('-- c\nSELECT 1');\npool.query('/* c */ SELECT 1');\n",
    ],
    ['line break', "pool.query(\n  'SELECT 1',\n);\n"],
    ['template interpolation', 'const column = "id"; pool.query(`SELECT ${column} FROM users`);\n'],
    ['foreign object', "foreignClient.query('SELECT 1');\n"],
    [
      'alias via `bind` / assignment',
      "const bound = pool.query.bind(pool); bound('SELECT 1');\nconst assigned = pool.query; assigned('SELECT 1');\n",
    ],
    ['string concatenation', "pool.query('SELECT ' + column + ' FROM users');\n"],
    ['destructuring alias', "const { query } = pool;\nquery('SELECT 1');\n"],
    ['constant computed member name', "const method = 'query';\npool[method]('SELECT 1');\n"],
  ];
  const rejectedFixtures = fixtures.map(([label, source], index) => {
    const file = `apps/integrator/src/rawSqlD18aFixture${index}.ts`;
    return { label, offenders: rawSqlOffenders(file, source, new Set()) };
  });
  const drizzleExecute = rawSqlOffenders(
    'apps/integrator/src/drizzleD18aFixture.ts',
    'db.execute(sql`SELECT 1`);\n',
    new Set(),
  );

  const relativeHelperFile = 'apps/integrator/src/rawSqlD18aRelativeHelperFixture.ts';
  const relativeConsumerFile = 'apps/integrator/src/rawSqlD18aRelativeConsumerFixture.ts';
  const relativeProject = new Map([
    [
      relativeHelperFile,
      'const pool = {} as any;\nexport const dbQuery = pool.query.bind(pool);\n',
    ],
    [
      relativeConsumerFile,
      "import { dbQuery } from './rawSqlD18aRelativeHelperFixture';\ndbQuery('SELECT 1');\n",
    ],
  ]);
  const relativeProjectLines = analyzeProject(relativeProject);
  // The helper only binds `.query` (never calls it) — same as the existing `bound`/`assigned`
  // fixture above, where the bind/assignment expression itself is not a call site. Only the
  // consumer's invocation of the imported alias is expected to be flagged.
  const relativeConsumerOffenders = offendersFromLines(
    relativeConsumerFile,
    relativeProjectLines.get(relativeConsumerFile),
    new Set(),
  );

  const manifestFile = [...rawSqlQueryManifest.integrator].find(
    (file) => rawSqlQueryLines(file, readFileSync(join(repoRoot, file), 'utf8')).length > 0,
  );
  const manifestWithoutLiveEntry = new Set(
    [...rawSqlQueryManifest.integrator].filter((file) => file !== manifestFile),
  );
  const manifestDeletionOffenders = manifestFile
    ? rawSqlOffenders(
        manifestFile,
        readFileSync(join(repoRoot, manifestFile), 'utf8'),
        manifestWithoutLiveEntry,
      )
    : [];
  if (
    rejectedFixtures.some(({ offenders }) => offenders.length === 0) ||
    drizzleExecute.length !== 0 ||
    relativeConsumerOffenders.length === 0 ||
    !manifestFile ||
    manifestDeletionOffenders.length !== 1
  ) {
    throw new Error('check-no-new-raw-sql self-test failed');
  }
  console.log('check-no-new-raw-sql: self-test expected verdicts:');
  for (const { label, offenders } of rejectedFixtures) {
    console.log(`  - ${label}: rejected (${offenders.join(', ')})`);
  }
  console.log('  - Drizzle execute: allowed');
  console.log(
    `  - relative-helper export called by consumer: rejected (${relativeConsumerOffenders.join(', ')})`,
  );
  console.log(
    `  - removed live manifest entry: rejected (${manifestDeletionOffenders.join(', ')})`,
  );
  console.log('check-no-new-raw-sql: self-test OK.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const fileSources = new Map();
const appOfFile = new Map();
for (const root of scanRoots) {
  const app = root.includes('/integrator/') ? 'integrator' : 'webapp';
  for (const abs of listSourceFiles(join(repoRoot, root))) {
    const rel = relative(repoRoot, abs).replaceAll('\\', '/');
    fileSources.set(rel, readFileSync(abs, 'utf8'));
    appOfFile.set(rel, app);
  }
}

const offenders = [];
const liveDebt = { integrator: new Set(), webapp: new Set() };
const linesByFile = analyzeProject(fileSources);
for (const [rel, lines] of linesByFile) {
  if (lines.length === 0) continue;
  const app = appOfFile.get(rel);
  if (rawSqlQueryManifest[app].has(rel)) liveDebt[app].add(rel);
  else offenders.push(...offendersFromLines(rel, lines, rawSqlQueryManifest[app]));
}

const staleDebt = staleDebtEntries(rawSqlQueryManifest, liveDebt);

if (offenders.length > 0 || staleDebt.length > 0) {
  printViolation(offenders, staleDebt);
  process.exit(1);
}

console.log(
  `check-no-new-raw-sql: OK (integrator manifest files: ${rawSqlQueryManifest.integrator.size}; webapp manifest files: ${rawSqlQueryManifest.webapp.size})`,
);
