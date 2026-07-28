import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sourceTextEquals,
  sourceTextIncludes,
  sourceTextIndexOf,
  sourceTextReplace,
  sourceTextSliceBetween,
} from './source-text-guard.mjs';

test('ignores JavaScript quote style and whitespace formatting', () => {
  const source = `
    principal?.kind === 'organization' ||
      principal?.kind === 'clinicBilling'
  `;
  const fragment = 'principal?.kind === "organization" || principal?.kind === "clinicBilling"';

  assert.equal(sourceTextIncludes(source, fragment, 'packages/db-principal/src/index.ts'), true);
});

test('keeps names, operators, brackets, and argument order meaningful', () => {
  const source = 'guard(first, second); if (left >= right) return;';

  assert.equal(sourceTextIncludes(source, 'guard(second, first)', 'guard.ts'), false);
  assert.equal(sourceTextIncludes(source, 'left > right', 'guard.ts'), false);
  assert.equal(sourceTextIncludes(source, 'guard[first, second]', 'guard.ts'), false);
  assert.equal(sourceTextIncludes(source, 'guard(first, missing)', 'guard.ts'), false);
});

test('does not normalize whitespace inside string literals', () => {
  assert.equal(sourceTextIncludes("const value = 'a  b';", '"a b"', 'guard.ts'), false);
});

test('does not confuse SQL string and identifier quotes', () => {
  assert.equal(sourceTextIncludes("status = 'active'", 'status = "active"', 'guard.sql'), false);
  assert.equal(
    sourceTextIncludes(
      "-- owner's projection\n\\ir 0201_first.sql\n\\ir 0230_second.sql",
      '0230_second.sql',
      'overlay.sql ordered files',
    ),
    true,
  );
});

test('treats Markdown code ticks as formatting', () => {
  assert.equal(
    sourceTextIncludes('Run `RESET ROLE` after cleanup.', 'RESET ROLE', 'docs/runbook.md'),
    true,
  );
});

test('preserves fragment order and reports a missing fragment', () => {
  const source = 'prepare();\ncheckout();';

  assert.ok(sourceTextIndexOf(source, 'prepare()', 'guard.ts') >= 0);
  assert.ok(
    sourceTextIndexOf(source, 'prepare()', 'guard.ts') <
      sourceTextIndexOf(source, 'checkout()', 'guard.ts'),
  );
  assert.equal(sourceTextIndexOf(source, 'missing()', 'guard.ts'), -1);
});

test('compares generated SQL without depending on indentation', () => {
  assert.equal(
    sourceTextEquals(
      'CREATE POLICY exact_org ON "public"."items"\n  USING (organization_id = app.current_org_id());',
      'CREATE POLICY exact_org ON "public"."items" USING (organization_id = app.current_org_id());',
      'policy.sql',
    ),
    true,
  );
});

test('extracts a block with formatted boundary fragments', () => {
  const source = 'before\nfunction guard (\n value,\n) {\n  check(value);\n}\nafter';
  const block = sourceTextSliceBetween(source, 'function guard(value,) {', '} after', 'guard.ts');

  assert.ok(block);
  assert.equal(sourceTextIncludes(block, 'check(value)', 'guard.ts'), true);
});

test('replaces a formatted fragment by token sequence', () => {
  const source = 'guard(\n  first,\n  second,\n);';
  assert.equal(
    sourceTextReplace(source, 'guard(first, second,)', 'removed()', 'guard.ts'),
    'removed();',
  );
});
