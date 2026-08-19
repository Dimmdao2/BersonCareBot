import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A census assertion answers "which ones", never "how many".
 *
 * A count (`assert.equal(xs.length, 118)`) fails with `119 !== 118`: it names nothing, so the only
 * way to repair it is to retype the number — done by the same person who moved it, without looking.
 * A recorded name set fails with the exact names that appeared and disappeared, and is repaired by
 * regenerating the set on purpose:
 *
 *     BCB_UPDATE_NAME_CENSUS=1 pnpm test:db-privileges
 *
 * Only sets that no generated artifact already carries live here (AGENTS.md §5, one source):
 * everything the declaration itself knows is cross-checked against the declaration in place.
 */
const CENSUS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'name-census.json');
const REGENERATE = 'BCB_UPDATE_NAME_CENSUS=1 pnpm test:db-privileges';
const updating = process.env.BCB_UPDATE_NAME_CENSUS === '1';

const readCensus = () => JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));

const writeCensus = (census) => fs.writeFileSync(
  CENSUS_PATH,
  `${JSON.stringify(Object.fromEntries(Object.entries(census).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
);

/**
 * @param {string} key      census name inside name-census.json
 * @param {Iterable<string>} names  the names measured right now
 * @param {string} subject  what the names are, for the failure text
 */
export function assertNameCensus(key, names, subject) {
  const actual = [...names].map(String).sort();
  const census = readCensus();
  if (updating) {
    census[key] = actual;
    writeCensus(census);
    return actual;
  }
  const expected = census[key];
  assert.ok(Array.isArray(expected), `name census "${key}" is not recorded yet; regenerate: ${REGENERATE}`);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const appeared = actual.filter((name) => !expectedSet.has(name));
  const vanished = expected.filter((name) => !actualSet.has(name));
  assert.deepEqual(actual, expected, [
    `${subject}: recorded name census "${key}" diverged`,
    `  appeared (${appeared.length}): ${appeared.join(', ') || '—'}`,
    `  vanished (${vanished.length}): ${vanished.join(', ') || '—'}`,
    `  every line above is a real change to the privilege surface — read it, then regenerate: ${REGENERATE}`,
  ].join('\n'));
  return actual;
}
