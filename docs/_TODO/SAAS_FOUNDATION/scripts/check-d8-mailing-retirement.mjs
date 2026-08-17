#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

const retiredStringLiterals = [
  { category: 'producer event', value: 'mailing.topic.upserted' },
  { category: 'producer event', value: 'user.subscription.upserted' },
  { category: 'producer event', value: 'mailing.log.sent' },
  { category: 'producer mutation', value: 'mailing.topic.upsert' },
  { category: 'producer mutation', value: 'user.subscription.upsert' },
  { category: 'producer mutation', value: 'mailing.log.append' },
  { category: 'read query type', value: 'mailing.topics.list' },
  { category: 'read query type', value: 'subscriptions.byUser' },
];

const retiredIdentifiers = ['SubscriptionMailingProjection', 'subscriptionMailingProjection'];

const retiredSourceTables = ['mailing_topics', 'user_subscriptions', 'mailings', 'mailing_logs'];

const retiredProjectionTables = [
  'mailing_topics_webapp',
  'user_subscriptions_webapp',
  'mailing_logs_webapp',
];

const forbiddenRuntimePaths = [
  'apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.ts',
  'apps/integrator/src/infra/db/repos/mailingLogs.ts',
  'apps/integrator/src/infra/db/repos/subscriptions.ts',
  'apps/integrator/src/infra/db/repos/topics.ts',
  'apps/webapp/src/infra/repos/inMemorySubscriptionMailingProjection.ts',
  'apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts',
  'apps/webapp/src/app/api/integrator/subscriptions/for-user/route.ts',
  'apps/webapp/src/app/api/integrator/subscriptions/topics/route.ts',
  'apps/webapp/scripts/backfill-subscription-mailing-domain.mjs',
  'apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs',
];

const retiredTables = [
  'public.mailing_logs_webapp',
  'public.user_subscriptions_webapp',
  'public.mailing_topics_webapp',
  'public.mailing_logs',
  'public.user_subscriptions',
  'public.mailings',
  'public.mailing_topics',
  'integrator.mailing_logs',
  'integrator.user_subscriptions',
  'integrator.mailings',
  'integrator.mailing_topics',
];

const securityArtifactPaths = [
  'deploy/postgres/p0-5-role-split.sql',
  'deploy/postgres/p0-5b-grants.sql',
  'deploy/postgres/phase4-force-rls-cutover.sql',
  'deploy/postgres/phase4-locked-helper-rls-policies.sql',
];

function runtimeFilesUnder(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...runtimeFilesUnder(absolute));
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(entry) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry)) continue;
    files.push(absolute);
  }
  return files;
}

function scriptKind(path) {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => ['${}', span.literal.text]),
    ].join('');
  }
  return null;
}

function databaseLiteralTexts(sourceFile) {
  const texts = [];
  function visit(node) {
    if (ts.isTaggedTemplateExpression(node) && calleeName(node.tag) === 'sql') {
      const text = literalText(node.template);
      if (text !== null) texts.push(text);
    }
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name === 'pgTable') {
        const text = node.arguments[0] ? literalText(node.arguments[0]) : null;
        if (text !== null) texts.push(text);
      }
      if (name === 'query' || name === 'execute' || name === 'unsafe') {
        for (const argument of node.arguments) {
          const text = literalText(argument);
          if (text !== null) texts.push(text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return texts;
}

function referencesTable(text, table) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const qualified = String.raw`(?:(?:"?(?:public|integrator)"?)\s*\.\s*)?`;
  const identifier = String.raw`"?${escaped}"?`;
  const sqlReference = new RegExp(
    String.raw`\b(?:from|join|into|update|using|references|table|truncate(?:\s+table)?)\s+${qualified}${identifier}\b`,
    'i',
  );
  return text === table || sqlReference.test(text);
}

export function findD8RuntimeViolations(entries) {
  const violations = [];
  for (const entry of entries) {
    if (forbiddenRuntimePaths.includes(entry.path)) {
      violations.push(`${entry.path}: retired D8 runtime path exists`);
    }

    const sourceFile = ts.createSourceFile(
      entry.path,
      entry.content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(entry.path),
    );
    const stringLiterals = new Set();
    const identifiers = new Set();
    function collectSyntax(node) {
      if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        stringLiterals.add(node.text);
      }
      if (ts.isIdentifier(node)) identifiers.add(node.text);
      ts.forEachChild(node, collectSyntax);
    }
    collectSyntax(sourceFile);

    for (const signal of retiredStringLiterals) {
      if (stringLiterals.has(signal.value)) {
        violations.push(`${entry.path}: contains retired D8 ${signal.category} "${signal.value}"`);
      }
    }
    for (const identifier of retiredIdentifiers) {
      if (identifiers.has(identifier)) {
        violations.push(`${entry.path}: contains retired D8 identifier "${identifier}"`);
      }
    }

    const databaseTexts = databaseLiteralTexts(sourceFile);
    for (const table of retiredSourceTables) {
      if (databaseTexts.some((text) => referencesTable(text, table))) {
        violations.push(`${entry.path}: references retired D8 source table "${table}"`);
      }
    }
    for (const table of retiredProjectionTables) {
      if (databaseTexts.some((text) => referencesTable(text, table))) {
        violations.push(`${entry.path}: references retired D8 projection table "${table}"`);
      }
    }
  }
  return violations;
}

function currentRuntimeEntries() {
  const roots = ['apps/integrator/src', 'apps/webapp/src', 'apps/webapp/scripts'];
  return roots.flatMap((root) =>
    runtimeFilesUnder(join(repoRoot, root)).map((absolute) => ({
      path: relative(repoRoot, absolute),
      content: readFileSync(absolute, 'utf8'),
    })),
  );
}

function assertRetiredTablesAbsentFromCurrentContract() {
  const contractPath = join(
    repoRoot,
    'deploy/postgres/generated/privileges.bcb_webapp_dev.sql',
  );
  const contract = readFileSync(contractPath, 'utf8').replaceAll('"', '');
  const present = retiredTables.filter((table) => contract.includes(table));
  if (present.length > 0) {
    throw new Error(`D8 retired tables remain in the current B0 access contract: ${present.join(', ')}`);
  }
}

export function findD8SecurityArtifactViolations(entries) {
  return entries.flatMap((entry) => {
    const normalized = entry.content.replaceAll('"', '');
    return retiredTables
      .filter((table) => normalized.includes(table))
      .map((table) => `${entry.path}: configures retired D8 table "${table}"`);
  });
}

function currentSecurityArtifactEntries() {
  return securityArtifactPaths.map((path) => ({
    path,
    content: readFileSync(join(repoRoot, path), 'utf8'),
  }));
}

function runSelfTest() {
  const faults = [];

  for (const signal of retiredStringLiterals) {
    faults.push({
      name: `${signal.category} ${signal.value}`,
      entry: {
        path: 'apps/integrator/src/fault.ts',
        content: `const retiredContract = '${signal.value}';`,
      },
      expected: `retired D8 ${signal.category} "${signal.value}"`,
    });
  }
  for (const identifier of retiredIdentifiers) {
    faults.push({
      name: `identifier ${identifier}`,
      entry: {
        path: 'apps/webapp/src/fault.ts',
        content: `const ${identifier} = true;`,
      },
      expected: `retired D8 identifier "${identifier}"`,
    });
  }
  for (const table of retiredSourceTables) {
    faults.push({
      name: `source table ${table}`,
      entry: {
        path: 'apps/integrator/src/fault.ts',
        content: `const rows = sql\`SELECT * FROM integrator.${table}\`;`,
      },
      expected: `retired D8 source table "${table}"`,
    });
  }
  for (const table of retiredProjectionTables) {
    faults.push({
      name: `projection table ${table}`,
      entry: {
        path: 'apps/webapp/src/fault.ts',
        content: `const rows = sql\`SELECT * FROM public.${table}\`;`,
      },
      expected: `retired D8 projection table "${table}"`,
    });
  }
  for (const path of forbiddenRuntimePaths) {
    faults.push({
      name: `retired path ${path}`,
      entry: { path, content: 'export {};' },
      expected: 'retired D8 runtime path exists',
    });
  }

  for (const fault of faults) {
    const violations = findD8RuntimeViolations([fault.entry]);
    if (!violations.some((violation) => violation.includes(fault.expected))) {
      throw new Error(`self-test failed to detect ${fault.name}`);
    }
  }

  const securityViolations = findD8SecurityArtifactViolations([
    {
      path: 'deploy/postgres/fault.sql',
      content: 'ALTER TABLE "integrator"."mailings" ENABLE ROW LEVEL SECURITY;',
    },
  ]);
  if (!securityViolations.some((violation) => violation.includes('integrator.mailings'))) {
    throw new Error('self-test failed to detect retired D8 security artifact target');
  }
  console.log('check-d8-mailing-retirement: self-test OK');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const violations = findD8RuntimeViolations(currentRuntimeEntries());
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exit(1);
  }
  const securityViolations = findD8SecurityArtifactViolations(currentSecurityArtifactEntries());
  if (securityViolations.length > 0) {
    console.error(securityViolations.join('\n'));
    process.exit(1);
  }
  assertRetiredTablesAbsentFromCurrentContract();
  console.log('check-d8-mailing-retirement: OK');
}
