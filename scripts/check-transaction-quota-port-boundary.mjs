#!/usr/bin/env node
/**
 * Structural gate for SINGLE_ENTRY_CLEANUP §4б: atomic quota writers enter through
 * transactionQuotaPort. The gate uses the TypeScript AST, so formatting and aliases do not
 * affect its verdict.
 *
 * What the gate holds is the MODULE, not one symbol inside it: a writer that touches a protected
 * table must both import a declared quota entry from `infra/repos/transactionQuotaPort` and call
 * it. The module exports two such entries, because a ceiling can be decided in either place and
 * both keep the lock and the write in one transaction:
 *
 *   - `transactionQuotaPort.withinLock(...)` — the lock and the rule live in this application;
 *   - `assertOrgPatientCountQuotaAvailable(...)` — transport for a ceiling whose rule lives in one
 *     SQL door (`app.assert_org_patient_count_quota_available`), which takes the same
 *     transaction-scoped advisory lock before the caller's insert.
 *
 * Importing an entry without calling it is still a bypass, and a protected mutation with no entry
 * at all is still a bypass, so widening the accepted address does not widen the hole.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(repoRoot, 'apps/webapp/src');
const quotaPortPath = join(sourceRoot, 'infra/repos/transactionQuotaPort.ts');
const quotaPortModule = '@/infra/repos/transactionQuotaPort';
const protectedTables = new Set([
  'beBranches',
  'orgEnrollments',
  'organizationMemberInvites',
]);
const quotaLockPrefixes = ['saas_quota:', 'clinic_invite_seats:'];
// Every symbol the quota-port module exports as a way IN. A protected writer must name one of
// these in its import list and invoke it; nothing else counts as entering the port.
const quotaPortEntries = new Set(['transactionQuotaPort', 'assertOrgPatientCountQuotaAvailable']);

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
  const importedEntryAliases = new Set();
  let protectedMutation = false;
  let patientFilesUpdated = false;
  let mediaReadyTransition = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (importsQuotaPort(filename, node.moduleSpecifier.text)) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const binding of bindings.elements) {
            if (quotaPortEntries.has(binding.propertyName?.text ?? binding.name.text)) {
              importsCanonicalPort = true;
              importedEntryAliases.add(binding.name.text);
            }
          }
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
        node.expression.expression.text === 'transactionQuotaPort' &&
        importedEntryAliases.has('transactionQuotaPort')
      ) {
        callsCanonicalPort = true;
      }

      // A directly-called entry (the SQL-door transport) counts only under the local name it was
      // imported under, so an unrelated same-named local helper cannot stand in for the port.
      if (ts.isIdentifier(node.expression) && importedEntryAliases.has(node.expression.text)) {
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
    findings.push(
      'contains a quota-consuming mutation that never enters transactionQuotaPort '
        + `(call one of: ${[...quotaPortEntries].join(', ')})`,
    );
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
      'patient writer without the port',
      `import { orgEnrollments } from '../../../db/schema/bookingEngine';
       export async function enroll(tx) { await tx.insert(orgEnrollments).values({}); }`,
    ],
    [
      'team writer with a duplicated local lock',
      `const key = \`clinic_invite_seats:\${organizationId}\`;
       export async function invite(tx) { await tx.execute(key); }`,
    ],
    [
      'patient writer that imports the SQL-door transport but never calls it',
      `import { assertOrgPatientCountQuotaAvailable } from '@/infra/repos/transactionQuotaPort';
       import { orgEnrollments } from '../../../db/schema/bookingEngine';
       export async function enroll(tx) { await tx.insert(orgEnrollments).values({}); }`,
    ],
    [
      'patient writer calling a local look-alike instead of the port',
      `import { orgEnrollments } from '../../../db/schema/bookingEngine';
       async function assertOrgPatientCountQuotaAvailable() {}
       export async function enroll(tx, organizationId) {
         await assertOrgPatientCountQuotaAvailable(tx, organizationId);
         await tx.insert(orgEnrollments).values({});
       }`,
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
  const canonical = [
    [
      'writer entering through transactionQuotaPort.withinLock',
      `import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
       import { orgEnrollments } from '../../../db/schema/bookingEngine';
       export async function enroll(tx, organizationId) {
         await transactionQuotaPort.withinLock(
           tx,
           { organizationId, mechanic: 'patient_count' },
           async (quota) => { await quota.assertStockAvailable(async () => 0); await tx.insert(orgEnrollments).values({}); },
         );
       }`,
    ],
    [
      'writer entering through the SQL-door transport of the same module',
      `import { assertOrgPatientCountQuotaAvailable } from '@/infra/repos/transactionQuotaPort';
       import { orgEnrollments } from '../../../db/schema/bookingEngine';
       export async function enroll(tx, organizationId) {
         await assertOrgPatientCountQuotaAvailable(tx, organizationId);
         await tx.insert(orgEnrollments).values({});
       }`,
    ],
  ];
  const rejectedCanonical = canonical.filter(([, source]) => sourceSignals(featurePath, source).length > 0);
  if (missed.length > 0 || rejectedCanonical.length > 0) {
    throw new Error(
      `check-transaction-quota-port-boundary self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected-canonical=${rejectedCanonical.map(([name]) => name).join(', ') || 'none'}`,
    );
  }
  console.log(`check-transaction-quota-port-boundary self-test: ${fixtures.length} bypass forms rejected`);
  console.log(`check-transaction-quota-port-boundary self-test: ${canonical.length} canonical port writers accepted`);
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
