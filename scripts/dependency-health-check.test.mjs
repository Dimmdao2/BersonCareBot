import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyOutdatedPackages, shouldNotify } from './dependency-health-check.mjs';

test('reports only deprecated, major, and pre-1.0 minor dependency drift', () => {
  const result = classifyOutdatedPackages({
    patch: { current: '2.1.0', latest: '2.1.5', isDeprecated: false },
    minor: { current: '2.1.0', latest: '2.4.0', isDeprecated: false },
    major: { current: '2.1.0', latest: '3.0.0', isDeprecated: false },
    preOne: { current: '0.4.0', latest: '0.5.0', isDeprecated: false },
    deprecated: { current: '7.0.0', latest: '7.0.0', isDeprecated: true },
  });

  assert.deepEqual(result, [
    { name: 'deprecated', current: '7.0.0', latest: '7.0.0', reason: 'deprecated' },
    { name: 'major', current: '2.1.0', latest: '3.0.0', reason: 'major' },
    { name: 'preOne', current: '0.4.0', latest: '0.5.0', reason: 'pre-1.0 minor' },
  ]);
});

test('deduplicates findings, repeats them weekly, and reports recovery', () => {
  const day = 24 * 60 * 60 * 1000;
  const previous = {
    kind: 'findings',
    fingerprint: 'same',
    lastNotifiedAt: '2026-09-01T09:00:00.000Z',
  };

  assert.equal(
    shouldNotify({
      previous,
      currentKind: 'findings',
      fingerprint: 'same',
      nowMs: Date.parse('2026-09-02T09:00:00.000Z'),
    }),
    false,
  );
  assert.equal(
    shouldNotify({
      previous,
      currentKind: 'findings',
      fingerprint: 'same',
      nowMs: Date.parse('2026-09-01T09:00:00.000Z') + 7 * day,
    }),
    true,
  );
  assert.equal(
    shouldNotify({
      previous,
      currentKind: 'findings',
      fingerprint: 'changed',
      nowMs: Date.parse('2026-09-02T09:00:00.000Z'),
    }),
    true,
  );
  assert.equal(
    shouldNotify({
      previous,
      currentKind: 'clean',
      fingerprint: 'clean',
      nowMs: Date.parse('2026-09-02T09:00:00.000Z'),
    }),
    true,
  );
});
