#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
export const RETIREMENT_PARENT = '0210820cd';
export const RETIREMENT_COMMIT = 'fb44002ce';

// A regex census cannot count these declarations: an `it.each([...])` table may itself contain
// parentheses (`statement_timestamp()`), so `it.each\s*\([^)]*\)\s*\(` stops inside the table and
// drops the whole declaration. Counting is therefore done on the TypeScript AST.
//
// A declaration is one `it`/`test` call expression, including modifier chains (`it.only`, `it.skip`)
// and one call per `.each` table — never one per table row. `regex.test(value)` and `object.it(...)`
// are method calls on other objects and are not declarations; the `.each(table)` call itself binds
// the table and is not a declaration either.
function runnerChain(expression) {
  if (ts.isIdentifier(expression)) {
    return ['it', 'test'].includes(expression.text) ? [expression.text] : null;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const base = runnerChain(expression.expression);
    return base ? [...base, expression.name.text] : null;
  }
  return null;
}

function isDeclarationCall(node) {
  const direct = runnerChain(node.expression);
  if (direct) return direct.at(-1) !== 'each';
  const head = ts.isCallExpression(node.expression)
    ? runnerChain(node.expression.expression)
    : ts.isTaggedTemplateExpression(node.expression)
      ? runnerChain(node.expression.tag)
      : null;
  return head?.at(-1) === 'each';
}

export function countTestDeclarations(source, path = 'census.ts') {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let declarations = 0;
  function walk(node) {
    if (ts.isCallExpression(node) && isDeclarationCall(node)) declarations += 1;
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return declarations;
}

// Declaration titles are wrapped across lines with `+`, so the literal text must be folded.
function staticTitle(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticTitle(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticTitle(node.left);
    const right = staticTitle(node.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

export function collectTestDeclarationTitles(source, path = 'census.ts') {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const titles = [];
  function walk(node) {
    if (ts.isCallExpression(node) && isDeclarationCall(node)) titles.push(staticTitle(node.arguments[0]));
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return titles;
}

export function collectRetiredProductPostgresTests() {
  const paths = execFileSync(
    'git',
    ['diff', '--diff-filter=D', '--name-only', RETIREMENT_PARENT, RETIREMENT_COMMIT],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(
      (path) =>
        path.endsWith('.postgres.integration.test.ts') &&
        !path.includes('/app-layer/testing/'),
    );
  return paths.map((path) => {
    const source = execFileSync('git', ['show', `${RETIREMENT_PARENT}:${path}`], {
      cwd: root,
      encoding: 'utf8',
    });
    return {
      path,
      calls: countTestDeclarations(source, path),
      titles: collectTestDeclarationTitles(source, path),
    };
  });
}

function main() {
  const rows = collectRetiredProductPostgresTests();
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  console.log(JSON.stringify({ productFiles: rows.length, productCalls: calls, rows }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
