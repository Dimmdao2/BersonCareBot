import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectRetiredProductPostgresTests,
  countTopLevelTestDeclarations,
} from './census-retired-postgres-tests.mjs';

test('counts only top-level it/test declarations and supported each declarations', () => {
  const source = `
it('one', () => {});
test('two', () => {});
it.each([1, 2])('three', () => {});
test.each(cases)('four', () => {});
expect(regex.test(value)).toBe(true);
object.it('not a declaration');
`;
  assert.equal(countTopLevelTestDeclarations(source), 4);
});

test('recounts the retired product set as exactly 35 files and 121 declarations', () => {
  const rows = collectRetiredProductPostgresTests();
  assert.equal(rows.length, 35);
  assert.equal(rows.reduce((sum, row) => sum + row.calls, 0), 121);
  assert.equal(new Set(rows.map((row) => row.path)).size, rows.length);
});
