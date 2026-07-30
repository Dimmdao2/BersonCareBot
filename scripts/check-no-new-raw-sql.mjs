#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = ['apps/integrator/src', 'apps/webapp/src'];

// Existing debt, cleaned under plan D18c — do not add.
// Keep each app's entries sorted. Removing a cleaned file is allowed.
const rawSqlDebtFiles = {
  integrator: new Set([
    'apps/integrator/src/infra/db/directPublic/mergeCandidatesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts',
    'apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts',
    'apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts',
    'apps/integrator/src/infra/db/operationalPoolReadiness.ts',
    'apps/integrator/src/infra/db/publicRestrictedSettings.ts',
    'apps/integrator/src/infra/db/publicRuntimeSettings.ts',
    'apps/integrator/src/infra/db/repos/messageLogs.ts',
    'apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts',
    'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
    'apps/integrator/src/infra/db/repos/projectionHealthCore.ts',
    'apps/integrator/src/infra/db/repos/schedulerReminderOrganizations.ts',
    'apps/integrator/src/infra/db/writePort.ts',
    'apps/integrator/src/infra/observability/saasIsolationTelemetry.ts',
    'apps/integrator/src/kernel/domain/executor/handlers/reminders.ts',
  ]),
  webapp: new Set([
    'apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserFullPurge.devDb.integration.test.ts',
    'apps/webapp/src/infra/platformUserMergePreview.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/broadcastChannelCounts.ts',
    'apps/webapp/src/infra/repos/orgBrandRevisionGuard.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgAuthRateLimitEvents.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgBookingScheduling.readChokepoint.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts',
    'apps/webapp/src/infra/repos/pgCuratedSystemHealthDiagnostics.ts',
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
    'apps/webapp/src/infra/repos/pgPlatformAccess.ts',
    'apps/webapp/src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgSaasIsolationDiagnostics.ts',
    'apps/webapp/src/infra/repos/pgSupportCommunication.devDb.integration.test.ts',
    'apps/webapp/src/infra/repos/pgUserProjection.devDb.integration.test.ts',
    'apps/webapp/src/infra/upsertBroadcastDefaultsAfterChannelBind.ts',
    'apps/webapp/src/modules/auth/sessionRevocationSchema.ts',
  ]),
};

// These are infrastructure primitives, not application raw-SQL debt: migration loading and
// the low-level pool/client checkout implementations are explicitly outside D18a's manifest.
const exemptFiles = new Set([
  'apps/integrator/src/infra/db/client.ts',
  'apps/integrator/src/infra/db/migrate.ts',
  'apps/integrator/src/infra/db/withClient.ts',
  'apps/webapp/src/infra/db/webappPoolProvider.ts',
  'apps/webapp/src/infra/db/client.ts',
  'apps/webapp/src/infra/db/withClient.ts',
]);

const sqlStatementStart =
  /^(?:SELECT|INSERT|UPDATE|DELETE|WITH|ALTER|CREATE|DROP|SET|RESET|BEGIN|COMMIT|ROLLBACK)\b/i;

function listSourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) files.push(...listSourceFiles(abs));
    else if (/\.(?:[cm]?ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) files.push(abs);
  }
  return files;
}

function sqlText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  return null;
}

function rawSqlQueryLines(abs) {
  const source = readFileSync(abs, 'utf8');
  const sourceFile = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true);
  const lines = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'query' &&
      node.arguments.length > 0
    ) {
      const text = sqlText(node.arguments[0]);
      if (text !== null && sqlStatementStart.test(text.trimStart())) {
        lines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lines;
}

const offenders = [];
const liveDebt = { integrator: new Set(), webapp: new Set() };
for (const root of scanRoots) {
  const app = root.includes('/integrator/') ? 'integrator' : 'webapp';
  for (const abs of listSourceFiles(join(repoRoot, root))) {
    const rel = relative(repoRoot, abs).replaceAll('\\', '/');
    if (exemptFiles.has(rel)) continue;
    const lines = rawSqlQueryLines(abs);
    if (lines.length === 0) continue;
    if (!rawSqlDebtFiles[app].has(rel)) offenders.push(`${rel}:${lines.join(',')}`);
    else liveDebt[app].add(rel);
  }
}

const staleDebt = Object.entries(rawSqlDebtFiles).flatMap(([app, files]) =>
  [...files]
    .filter((file) => !liveDebt[app].has(file))
    .map((file) => `${file} (remove its cleaned entry)`),
);

if (offenders.length > 0 || staleDebt.length > 0) {
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
  process.exit(1);
}

console.log(
  `check-no-new-raw-sql: OK (integrator debt files: ${rawSqlDebtFiles.integrator.size}; webapp debt files: ${rawSqlDebtFiles.webapp.size})`,
);
