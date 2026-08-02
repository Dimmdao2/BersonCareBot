#!/usr/bin/env node
/**
 * Structural gate for Ч3б: retry jobs enter through QueuePort.  The raw Drizzle
 * repository seam is intentionally bound only by the QueuePort adapter.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const integratorSourceRoot = join(repoRoot, 'apps/integrator/src');
const rawQueueRepository = join(integratorSourceRoot, 'infra/db/repos/jobQueue.ts');
const queuePortAdapter = join(integratorSourceRoot, 'infra/adapters/jobQueuePort.ts');
const rawEnqueueSeam = 'enqueueMessageRetryJob';

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

function isAuthorizedBoundary(filename) {
  return normalize(filename) === rawQueueRepository || normalize(filename) === queuePortAdapter;
}

function resolvedImportBase(filename, specifier) {
  if (!specifier.startsWith('.')) return null;
  const absolute = resolve(dirname(filename), specifier);
  return extname(absolute) ? absolute.slice(0, -extname(absolute).length) : absolute;
}

function importsRawQueueRepository(filename, specifier) {
  const base = resolvedImportBase(filename, specifier);
  return base === rawQueueRepository.slice(0, -'.ts'.length);
}

function namedBindings(clause) {
  const bindings = clause?.namedBindings;
  return bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
}

function checkSource(filename, source) {
  if (isAuthorizedBoundary(filename)) return [];

  const findings = [];
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (importsRawQueueRepository(filename, node.moduleSpecifier.text)) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          findings.push(`${filename}: namespace-imports raw retry enqueue repository`);
        }
        for (const binding of namedBindings(node.importClause)) {
          if ((binding.propertyName?.text ?? binding.name.text) === rawEnqueueSeam) {
            findings.push(`${filename}: imports raw ${rawEnqueueSeam} as ${binding.name.text}`);
          }
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      importsRawQueueRepository(filename, node.arguments[0].text)
    ) {
      findings.push(`${filename}: dynamically imports raw retry enqueue repository`);
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (importsRawQueueRepository(filename, node.moduleSpecifier.text)) {
        if (!node.exportClause) {
          findings.push(`${filename}: re-exports raw retry enqueue repository`);
        } else if (ts.isNamespaceExport(node.exportClause)) {
          findings.push(`${filename}: namespace-re-exports raw retry enqueue repository`);
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const binding of node.exportClause.elements) {
            if ((binding.propertyName?.text ?? binding.name.text) === rawEnqueueSeam) {
              findings.push(`${filename}: re-exports raw ${rawEnqueueSeam}`);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return findings;
}

function productionFindings() {
  return listProductionTypeScript(integratorSourceRoot).flatMap((filename) =>
    checkSource(filename, readFileSync(filename, 'utf8')),
  );
}

function selfTest() {
  const featurePath = join(integratorSourceRoot, 'feature/queueRetry.ts');
  const adapterPath = queuePortAdapter;
  const repositoryPath = rawQueueRepository;
  const fixtures = [
    [
      'direct raw enqueue invocation',
      featurePath,
      "import { enqueueMessageRetryJob } from '../infra/db/repos/jobQueue.js'; void enqueueMessageRetryJob({} as never, {} as never);",
    ],
    [
      'aliased raw enqueue invocation',
      featurePath,
      "import { enqueueMessageRetryJob as enqueue } from '../infra/db/repos/jobQueue.js'; void enqueue({} as never, {} as never);",
    ],
    [
      'raw enqueue re-export',
      featurePath,
      "export { enqueueMessageRetryJob as enqueue } from '../infra/db/repos/jobQueue.js';",
    ],
    [
      'dynamic raw enqueue import',
      featurePath,
      "void import('../infra/db/repos/jobQueue.js').then(({ enqueueMessageRetryJob }) => enqueueMessageRetryJob({} as never, {} as never));",
    ],
  ];
  const missed = fixtures.filter(([, filename, source]) => checkSource(filename, source).length === 0);
  const green = [
    [
      'QueuePort consumer',
      featurePath,
      "import type { QueuePort } from '../kernel/contracts/index.js'; export async function schedule(queue: QueuePort) { await queue.enqueue({ kind: 'message.deliver', payload: {} }); }",
    ],
    [
      'QueuePort adapter binding',
      adapterPath,
      "import { enqueueMessageRetryJob } from '../db/repos/jobQueue.js'; void enqueueMessageRetryJob;",
    ],
    [
      'raw repository implementation',
      repositoryPath,
      'export async function enqueueMessageRetryJob() {}',
    ],
  ].filter(([, filename, source]) => checkSource(filename, source).length > 0);

  if (missed.length > 0 || green.length > 0) {
    throw new Error(
      `check-queue-port-boundary self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected=${green.map(([name]) => name).join(', ') || 'none'}`,
    );
  }
  console.log(`check-queue-port-boundary self-test: ${fixtures.length} bypass forms exit nonzero`);
  console.log('check-queue-port-boundary self-test: QueuePort consumer and authorized boundaries accepted');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const findings = productionFindings();
  if (findings.length > 0) {
    console.error('check-queue-port-boundary: QueuePort bypass detected.');
    for (const finding of findings) {
      const [filename, detail] = finding.split(': ', 2);
      console.error(`  - ${relative(repoRoot, filename).replaceAll('\\', '/')}: ${detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('check-queue-port-boundary: OK');
  }
}
