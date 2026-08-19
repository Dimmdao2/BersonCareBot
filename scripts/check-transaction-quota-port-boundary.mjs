#!/usr/bin/env node
/**
 * Structural gate for SINGLE_ENTRY_CLEANUP §4б: atomic quota writers enter through
 * transactionQuotaPort. The gate uses the TypeScript AST, so formatting and aliases do not
 * affect its verdict.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(repoRoot, 'apps/webapp/src');
const quotaPortPath = join(sourceRoot, 'infra/repos/transactionQuotaPort.ts');
const quotaPortModule = '@/infra/repos/transactionQuotaPort';
// Т12 (владелец 19.08, дословно): «лимит клиентов - убрать». `orgEnrollments` ушла отсюда вместе с
// механикой `patient_count` — у карточки клиента больше нет потолка, значит и охранять на этой
// таблице нечего; оставить её здесь значило бы требовать блокировку под квоту, которой нет.
const protectedTables = new Set(['beBranches', 'organizationMemberInvites']);
const quotaLockPrefixes = ['saas_quota:', 'clinic_invite_seats:'];

function listProductionTypeScript(dir) {
  return readdirSync(dir).flatMap((name) => {
    const absolute = join(dir, name);
    const entry = statSync(absolute);
    if (entry.isDirectory()) return listProductionTypeScript(absolute);
    return /\.(?:[cm]?ts|tsx)$/.test(name) &&
      !name.includes('.test.') &&
      !name.includes('.spec.') &&
      !name.endsWith('.d.ts')
      ? [absolute]
      : [];
  });
}

function resolvedImportBase(filename, specifier) {
  if (specifier === quotaPortModule) return quotaPortPath.slice(0, -'.ts'.length);
  if (!specifier.startsWith('.')) return null;
  const absolute = resolve(dirname(filename), specifier);
  return extname(absolute) ? absolute.slice(0, -extname(absolute).length) : absolute;
}

function importsQuotaPort(filename, specifier) {
  return resolvedImportBase(filename, specifier) === quotaPortPath.slice(0, -'.ts'.length);
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function containsQuotaLockPrefix(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return quotaLockPrefixes.some((prefix) => node.text.includes(prefix));
  }
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return quotaLockPrefixes.some((prefix) => node.text.includes(prefix));
  }
  return false;
}

function mutationTable(call) {
  const method = propertyName(call.expression);
  if (method !== 'insert' && method !== 'update') return null;
  const table = call.arguments[0];
  return table && ts.isIdentifier(table) ? table.text : null;
}

function sourceSignals(filename, source) {
  if (normalize(filename) === normalize(quotaPortPath)) return [];

  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  let importsCanonicalPort = false;
  let callsCanonicalPort = false;
  let protectedMutation = false;
  let patientFilesUpdated = false;
  let mediaReadyTransition = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (importsQuotaPort(filename, node.moduleSpecifier.text)) {
        const bindings = node.importClause?.namedBindings;
        if (
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some(
            (binding) =>
              (binding.propertyName?.text ?? binding.name.text) === 'transactionQuotaPort',
          )
        ) {
          importsCanonicalPort = true;
        }
      }
    }

    if (containsQuotaLockPrefix(node)) {
      findings.push('defines a quota advisory-lock key outside transactionQuotaPort');
    }

    if (ts.isCallExpression(node)) {
      const table = mutationTable(node);
      if (table && protectedTables.has(table)) protectedMutation = true;
      if (table === 'patientFiles' && propertyName(node.expression) === 'update') {
        patientFilesUpdated = true;
      }

      if (
        propertyName(node.expression) === 'withinLock' &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression)) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'transactionQuotaPort'
      ) {
        callsCanonicalPort = true;
      }

      if (propertyName(node.expression) === 'set') {
        const value = node.arguments[0];
        if (value && ts.isObjectLiteralExpression(value)) {
          mediaReadyTransition ||= value.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) && property.name.text === 'status') ||
                (ts.isStringLiteral(property.name) && property.name.text === 'status')) &&
              ts.isStringLiteral(property.initializer) &&
              property.initializer.text === 'ready',
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(parsed);

  const isPatientFileCapacityWriter = patientFilesUpdated && mediaReadyTransition;
  if ((protectedMutation || isPatientFileCapacityWriter) && !(importsCanonicalPort && callsCanonicalPort)) {
    findings.push('contains a quota-consuming mutation without transactionQuotaPort.withinLock');
  }
  return [...new Set(findings)];
}

function productionFindings() {
  return listProductionTypeScript(sourceRoot).flatMap((filename) =>
    sourceSignals(filename, readFileSync(filename, 'utf8')).map((detail) => ({ filename, detail })),
  );
}

function selfTest() {
  const featurePath = join(sourceRoot, 'infra/repos/syntheticQuotaWriter.ts');
  const fixtures = [
    [
      'branch writer without the port',
      `import { beBranches } from '../../../db/schema/bookingEngine';
       export async function create(tx) { await tx.insert(beBranches).values({}); }`,
    ],
    [
      'team writer with a duplicated local lock',
      `const key = \`clinic_invite_seats:\${organizationId}\`;
       export async function invite(tx) { await tx.execute(key); }`,
    ],
    [
      'patient file ready transition without the port',
      `import { patientFiles, mediaFiles } from '../../../db/schema/schema';
       export async function confirm(tx) {
         await tx.update(mediaFiles).set({ status: 'ready' });
         await tx.update(patientFiles).set({ sizeBytes: 1 });
       }`,
    ],
  ];
  const missed = fixtures.filter(([, source]) => sourceSignals(featurePath, source).length === 0);
  const accepted = sourceSignals(
    featurePath,
    `import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
     import { beBranches } from '../../../db/schema/bookingEngine';
     export async function addBranch(tx, organizationId) {
       await transactionQuotaPort.withinLock(
         tx,
         { organizationId, mechanic: 'branches' },
         async (quota) => { await quota.assertStockAvailable(async () => 0); await tx.insert(beBranches).values({}); },
       );
     }`,
  );
  if (missed.length > 0 || accepted.length > 0) {
    throw new Error(
      `check-transaction-quota-port-boundary self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected-canonical=${accepted.join(', ') || 'none'}`,
    );
  }
  console.log(`check-transaction-quota-port-boundary self-test: ${fixtures.length} bypass forms rejected`);
  console.log('check-transaction-quota-port-boundary self-test: canonical port writer accepted');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const findings = productionFindings();
  if (findings.length > 0) {
    console.error('check-transaction-quota-port-boundary: quota-port bypass detected.');
    for (const finding of findings) {
      console.error(`  - ${relative(repoRoot, finding.filename).replaceAll('\\', '/')}: ${finding.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('check-transaction-quota-port-boundary: OK');
  }
}
