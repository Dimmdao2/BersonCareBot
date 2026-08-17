#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
export const RETIREMENT_PARENT = '0210820cd';
export const RETIREMENT_COMMIT = 'fb44002ce';

// Product tests in this retired set declare cases at module top level. Anchoring is intentional:
// it excludes assertion helpers such as `emailRegex.test(value)` and method calls on other objects.
export function countTopLevelTestDeclarations(source) {
  return [...source.matchAll(/^\s*(?:it|test)(?:\.each\s*\([^)]*\))?\s*\(/gm)].length;
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
    return { path, calls: countTopLevelTestDeclarations(source) };
  });
}

function main() {
  const rows = collectRetiredProductPostgresTests();
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  console.log(JSON.stringify({ productFiles: rows.length, productCalls: calls, rows }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
