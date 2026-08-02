#!/usr/bin/env node
/**
 * Structural gate for Track D D19a: production modules and API routes may only consume
 * DB/repository capabilities through module ports and composition-root DI. It parses AST rather
 * than matching source text, so renamed bindings, dynamic static expressions and re-exports do
 * not provide another door to infra/db or infra/repos.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const webappSourceRoot = join(repoRoot, 'apps/webapp/src');
const modulesRoot = join(webappSourceRoot, 'modules');
const apiRoot = join(webappSourceRoot, 'app/api');
const forbiddenAliasPrefix = '@/infra/';

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

function isProtectedFile(filename) {
  const absolute = normalize(filename);
  if (absolute.startsWith(`${normalize(modulesRoot)}/`)) return true;
  return (
    absolute.startsWith(`${normalize(apiRoot)}/`) &&
    absolute.endsWith(`${normalize('/route.ts')}`)
  );
}

function isForbiddenSpecifier(specifier, filename) {
  if (specifier.startsWith(forbiddenAliasPrefix)) {
    return /^@\/infra\/(?:db|repos)(?:\/|$)/.test(specifier);
  }
  if (!specifier.startsWith('.')) return false;
  const absolute = resolve(dirname(filename), specifier);
  const base = extname(absolute) ? absolute.slice(0, -extname(absolute).length) : absolute;
  return [join(webappSourceRoot, 'infra/db'), join(webappSourceRoot, 'infra/repos')].some(
    (root) => base === root || base.startsWith(`${root}/`),
  );
}

function staticString(node, constants) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return staticString(node.expression, constants);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(node.left, constants);
    const right = staticString(node.right, constants);
    return left === null || right === null ? null : `${left}${right}`;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression, constants);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function collectStaticStringConstants(sourceFile) {
  const constants = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isVariableDeclarationList(node.parent) &&
        (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
        !constants.has(node.name.text)
      ) {
        const value = staticString(node.initializer, constants);
        if (value !== null) {
          constants.set(node.name.text, value);
          changed = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return constants;
}

function sourceFindings(filename, source) {
  if (!isProtectedFile(filename)) return [];
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const constants = collectStaticStringConstants(sourceFile);
  const findings = [];
  const add = (node, kind, specifier) => {
    if (!isForbiddenSpecifier(specifier, filename)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    findings.push({ line, kind, specifier });
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node, ts.isImportDeclaration(node) ? 'static import' : 're-export', node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const specifier = staticString(node.arguments[0], constants);
      if (specifier !== null) add(node, 'dynamic import', specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function productionFindings() {
  return [...listProductionTypeScript(modulesRoot), ...listProductionTypeScript(apiRoot)]
    .flatMap((filename) =>
      sourceFindings(filename, readFileSync(filename, 'utf8')).map((finding) => ({ filename, ...finding })),
    )
    .sort((left, right) => left.filename.localeCompare(right.filename) || left.line - right.line);
}

function selfTest() {
  const moduleFile = join(modulesRoot, 'fixture.ts');
  const routeFile = join(apiRoot, 'fixture/route.ts');
  const rejected = [
    ['static direct', moduleFile, "import { port } from '@/infra/repos/pgPort';"],
    ['aliased binding', moduleFile, "import { port as canonicalPort } from '@/infra/repos/pgPort';"],
    ['type import', moduleFile, "import type { Port } from '@/infra/repos/pgPort';"],
    ['dynamic literal', moduleFile, "await import('@/infra/db/client');"],
    ['dynamic computed', moduleFile, "const target = '@/infra/' + 'repos/pgPort'; await import(target);"],
    ['re-export', routeFile, "export { port as canonicalPort } from '@/infra/repos/pgPort';"],
    ['relative bypass', moduleFile, "import { port } from '../infra/repos/pgPort';"],
  ];
  const missed = rejected.filter(([, filename, source]) => sourceFindings(filename, source).length === 0);
  const canonical = sourceFindings(
    moduleFile,
    "import type { Port } from '@/modules/example/ports'; export function use(port: Port) { return port; }",
  );
  if (missed.length > 0 || canonical.length > 0) {
    throw new Error(
      `check-webapp-infra-import-boundary self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected-canonical=${canonical.map(({ kind }) => kind).join(', ') || 'none'}`,
    );
  }
  console.log(
    `check-webapp-infra-import-boundary self-test: ${rejected.length} bypass forms rejected; canonical port consumer accepted`,
  );
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const findings = productionFindings();
  if (findings.length > 0) {
    console.error('check-webapp-infra-import-boundary: direct infra DB/repository import detected.');
    for (const finding of findings) {
      console.error(
        `  - ${relative(repoRoot, finding.filename).replaceAll('\\', '/')}:${finding.line} ${finding.kind} ${JSON.stringify(finding.specifier)}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log('check-webapp-infra-import-boundary: OK');
  }
}
