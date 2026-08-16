import assert from 'node:assert/strict';
import test from 'node:test';
import { runReversibleCycle } from './reversible-cycle.mjs';

test('restores the original value when changed readback throws', async () => {
  let value = 'original';
  let reads = 0;
  const result = await runReversibleCycle({
    id: 'example',
    read: async () => {
      reads += 1;
      if (reads === 2) throw new Error('readback unavailable');
      return { ok: true, status: 200, body: { value } };
    },
    change: async () => {
      value = 'changed';
      return { ok: true, status: 200 };
    },
    restore: async (initial) => {
      value = initial.body.value;
      return { ok: true, status: 200 };
    },
    changedMatches: (initial, changed) => initial.body.value !== changed.body.value,
    restoredMatches: (initial, restored) => initial.body.value === restored.body.value,
  });

  assert.equal(result.pass, false);
  assert.match(result.failure, /^exception:readback unavailable$/);
  assert.equal(value, 'original');
  assert.deepEqual(
    result.steps.map((step) => step.stage),
    ['initial_read', 'change', 'restore', 'restored_readback'],
  );
});

test('passes only after exact changed and restored readbacks', async () => {
  let value = false;
  const result = await runReversibleCycle({
    id: 'example',
    read: async () => ({ ok: true, status: 200, body: { value } }),
    change: async () => {
      value = true;
      return { ok: true, status: 200 };
    },
    restore: async () => {
      value = false;
      return { ok: true, status: 200 };
    },
    changedMatches: (_initial, changed) => changed.body.value === true,
    restoredMatches: (_initial, restored) => restored.body.value === false,
  });

  assert.equal(result.pass, true);
  assert.equal(value, false);
  assert.deepEqual(
    result.steps.map((step) => step.status),
    [200, 200, 200, 200, 200],
  );
});

test('fails when restoration does not converge', async () => {
  let value = 10;
  const result = await runReversibleCycle({
    id: 'example',
    read: async () => ({ ok: true, status: 200, body: { value } }),
    change: async () => {
      value = 11;
      return { ok: true, status: 200 };
    },
    restore: async () => ({ ok: false, status: 500 }),
    changedMatches: (_initial, changed) => changed.body.value === 11,
    restoredMatches: (initial, restored) => initial.body.value === restored.body.value,
  });

  assert.equal(result.pass, false);
  assert.equal(result.failure, 'restore_readback_mismatch');
  assert.equal(value, 11);
});
