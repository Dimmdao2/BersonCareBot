import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectRetiredProductPostgresTests,
  collectTestDeclarationTitles,
  countTestDeclarations,
} from './census-retired-postgres-tests.mjs';

test('counts one declaration per it/test call and per .each table, never per table row', () => {
  const source = `
it('one', () => {});
test('two', () => {});
it.each([1, 2])('three', () => {});
test.each(cases)('four', () => {});
expect(regex.test(value)).toBe(true);
object.it('not a declaration');
`;
  assert.equal(countTestDeclarations(source), 4);
});

test('counts an each table that itself contains parentheses', () => {
  // The retired regex census used `it.each\\s*\\([^)]*\\)\\s*\\(` and stopped at the inner `)` of
  // `statement_timestamp()`, silently dropping the whole declaration.
  const source = `
it('plain', () => {});
it.each([
  ['archived', 'is_archived = true'],
  ['globally muted', "reminder_muted_until = statement_timestamp() + interval '1 hour'"],
])('terminalizes before provider when the recipient becomes %s', () => {});
`;
  assert.equal(countTestDeclarations(source), 2);
  assert.deepEqual(collectTestDeclarationTitles(source), [
    'plain',
    'terminalizes before provider when the recipient becomes %s',
  ]);
});

test('counts modifier chains and folds titles wrapped across concatenated literals', () => {
  const source = `
it.only('only', () => {});
test.skip('skipped', () => {});
it(
  'negative: a title split ' +
    'across two literals',
  () => {},
);
describe.each([1])('not a case declaration', () => {});
`;
  assert.equal(countTestDeclarations(source), 3);
  assert.deepEqual(collectTestDeclarationTitles(source), [
    'only',
    'skipped',
    'negative: a title split across two literals',
  ]);
});

test('recounts the retired product set as exactly 35 files and 122 declarations', () => {
  const rows = collectRetiredProductPostgresTests();
  assert.equal(rows.length, 35);
  assert.equal(
    rows.reduce((sum, row) => sum + row.calls, 0),
    122,
  );
  assert.equal(new Set(rows.map((row) => row.path)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.titles.length, row.calls, `${row.path}: title/declaration counts diverged`);
    assert(
      row.titles.every((title) => typeof title === 'string' && title.length > 0),
      `${row.path}: a declaration title could not be resolved statically`,
    );
  }
});
