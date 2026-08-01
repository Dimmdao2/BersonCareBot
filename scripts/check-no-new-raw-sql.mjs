#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = ['apps/integrator/src', 'apps/webapp/src'];

// Frozen D18a inventory of every existing raw .query() call. Do not add entries:
// a newly added call must use the application's Drizzle port instead. D18c removes
// entries as the legacy calls are converted. Keep each app's entries sorted.
const rawSqlQueryManifest = {
  integrator: new Set([
    'apps/integrator/src/infra/db/client.ts',
    'apps/integrator/src/infra/db/directPublic/mergeCandidatesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts',
    'apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts',
    'apps/integrator/src/infra/db/integratorPoolProvider.ts',
    'apps/integrator/src/infra/db/migrate.ts',
    'apps/integrator/src/infra/db/repos/projectionHealthCore.ts',
    'apps/integrator/src/infra/db/runIntegratorSql.ts',
    'apps/integrator/src/infra/db/withClient.ts',
    'apps/integrator/src/infra/observability/saasIsolationTelemetry.ts',
  ]),
  webapp: new Set([
    'apps/webapp/src/infra/db/client.ts',
    'apps/webapp/src/infra/db/runWebappSql.ts',
    'apps/webapp/src/infra/db/webappPoolProvider.ts',
    'apps/webapp/src/infra/db/withClient.ts',
    'apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserFullPurge.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserMergePreview.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/broadcastChannelCounts.ts',
    'apps/webapp/src/infra/repos/orgBrandRevisionGuard.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts',
    'apps/webapp/src/infra/repos/pgAuthRateLimitEvents.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.readChokepoint.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts',
    'apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorClients.appointmentJoin.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorClients.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgDoctorPhase13d.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgEmailChallengeAtomicAttempts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgMessengerPhoneHttpBind.ts',
    'apps/webapp/src/infra/repos/pgOnlineIntake.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPatientBookings.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPhase14DCommsTail.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgSupportCommunication.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgUserProjection.devDb.integration.test.ts',
    'apps/webapp/src/infra/upsertBroadcastDefaultsAfterChannelBind.ts',
    'apps/webapp/src/modules/auth/sessionRevocationSchema.ts',
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

function rawSqlQueryLines(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const queryAliases = new Set();

  const unwrapExpression = (node) => {
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
  };

  const isQueryMember = (node) =>
    (ts.isPropertyAccessExpression(node) && node.name.text === 'query') ||
    (ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) &&
      node.argumentExpression.text === 'query');

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

  // Resolve aliases to a fixed point so `const other = query` is guarded too. This
  // deliberately tracks only values proven to originate at `.query`, not arbitrary
  // identifier calls such as a product search helper named `query`.
  let aliasesChanged = true;
  while (aliasesChanged) {
    aliasesChanged = false;
    const collectAliases = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isQueryAliasSource(node.initializer) &&
        !queryAliases.has(node.name.text)
      ) {
        queryAliases.add(node.name.text);
        aliasesChanged = true;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isQueryAliasSource(node.right) &&
        !queryAliases.has(node.left.text)
      ) {
        queryAliases.add(node.left.text);
        aliasesChanged = true;
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(sourceFile);
  }

  const lines = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      if (isQueryMember(expression) || (ts.isIdentifier(expression) && queryAliases.has(expression.text))) {
        lines.add(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...lines].sort((a, b) => a - b);
}

function rawSqlOffenders(fileName, source, allowedFiles) {
  const lines = rawSqlQueryLines(fileName, source);
  return lines.length > 0 && !allowedFiles.has(fileName) ? [`${fileName}:${lines.join(',')}`] : [];
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
    ['comment (`--` and `/* */`)', "pool.query('-- c\nSELECT 1');\npool.query('/* c */ SELECT 1');\n"],
    ['line break', "pool.query(\n  'SELECT 1',\n);\n"],
    ['template interpolation', 'const column = "id"; pool.query(`SELECT ${column} FROM users`);\n'],
    ['foreign object', "foreignClient.query('SELECT 1');\n"],
    [
      'alias via `bind` / assignment',
      "const bound = pool.query.bind(pool); bound('SELECT 1');\nconst assigned = pool.query; assigned('SELECT 1');\n",
    ],
    ['string concatenation', "pool.query('SELECT ' + column + ' FROM users');\n"],
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
  const manifestFile = [...rawSqlQueryManifest.integrator].find((file) =>
    rawSqlQueryLines(file, readFileSync(join(repoRoot, file), 'utf8')).length > 0,
  );
  const manifestWithoutLiveEntry = new Set(
    [...rawSqlQueryManifest.integrator].filter((file) => file !== manifestFile),
  );
  const manifestDeletionOffenders = manifestFile
    ? rawSqlOffenders(manifestFile, readFileSync(join(repoRoot, manifestFile), 'utf8'), manifestWithoutLiveEntry)
    : [];
  if (
    rejectedFixtures.some(({ offenders }) => offenders.length === 0) ||
    drizzleExecute.length !== 0 ||
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
  console.log(`  - removed live manifest entry: rejected (${manifestDeletionOffenders.join(', ')})`);
  console.log('check-no-new-raw-sql: self-test OK.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const offenders = [];
const liveDebt = { integrator: new Set(), webapp: new Set() };
for (const root of scanRoots) {
  const app = root.includes('/integrator/') ? 'integrator' : 'webapp';
  for (const abs of listSourceFiles(join(repoRoot, root))) {
    const rel = relative(repoRoot, abs).replaceAll('\\', '/');
    const source = readFileSync(abs, 'utf8');
    const lines = rawSqlQueryLines(abs, source);
    if (lines.length === 0) continue;
    if (rawSqlQueryManifest[app].has(rel)) liveDebt[app].add(rel);
    else offenders.push(...rawSqlOffenders(rel, source, rawSqlQueryManifest[app]));
  }
}

const staleDebt = staleDebtEntries(rawSqlQueryManifest, liveDebt);

if (offenders.length > 0 || staleDebt.length > 0) {
  printViolation(offenders, staleDebt);
  process.exit(1);
}

console.log(
  `check-no-new-raw-sql: OK (integrator manifest files: ${rawSqlQueryManifest.integrator.size}; webapp manifest files: ${rawSqlQueryManifest.webapp.size})`,
);
