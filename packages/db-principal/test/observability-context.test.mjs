import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BC_CORRELATION_ID_HEADER,
  enterWithCorrelationId,
  ensureCorrelationId,
  getCurrentCorrelationId,
  getCurrentCorrelationIdHeader,
  getCurrentObservabilityContext,
  parseCorrelationId,
  resolveCorrelationId,
  runWithDbOrganizationPrincipal,
  runWithObservabilityContext,
} from '../dist/index.js';

const CORRELATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CORRELATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORGANIZATION_A = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_B = '22222222-2222-4222-8222-222222222222';

test('correlation ids accept only canonical bounded UUIDs', () => {
  assert.equal(parseCorrelationId(`  ${CORRELATION_A.toUpperCase()}  `), CORRELATION_A);
  assert.equal(parseCorrelationId('patient-name-or-token'), undefined);
  assert.equal(parseCorrelationId('x'.repeat(10_000)), undefined);

  const forgedReplacement = resolveCorrelationId('patient-name-or-token');
  const oversizedReplacement = resolveCorrelationId('x'.repeat(10_000));
  assert.match(forgedReplacement, /^[0-9a-f-]{36}$/);
  assert.match(oversizedReplacement, /^[0-9a-f-]{36}$/);
  assert.notEqual(forgedReplacement, 'patient-name-or-token');
  assert.notEqual(oversizedReplacement, 'x'.repeat(10_000));
});

test('one ALS cell preserves correlation while a trusted DB principal supplies organization context', async () => {
  await runWithObservabilityContext({ correlationId: CORRELATION_A }, async () => {
    assert.equal(ensureCorrelationId(), CORRELATION_A);
    assert.deepEqual(getCurrentCorrelationIdHeader(), {
      [BC_CORRELATION_ID_HEADER]: CORRELATION_A,
    });

    await runWithDbOrganizationPrincipal(ORGANIZATION_A, async () => {
      await Promise.resolve();
      assert.deepEqual(getCurrentObservabilityContext(), {
        correlationId: CORRELATION_A,
        orgId: ORGANIZATION_A,
      });
    });

    assert.deepEqual(getCurrentObservabilityContext(), { correlationId: CORRELATION_A });
  });
  assert.equal(getCurrentCorrelationId(), undefined);
});

test('request ingress replaces an inherited correlation id', () => {
  runWithObservabilityContext({ correlationId: CORRELATION_A }, () => {
    assert.equal(enterWithCorrelationId(CORRELATION_B), CORRELATION_B);
    assert.equal(getCurrentCorrelationId(), CORRELATION_B);
  });
  assert.equal(getCurrentCorrelationId(), undefined);
});

test('parallel request contexts do not leak correlation or organization', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let ready = 0;

  const run = (correlationId, organizationId) =>
    runWithObservabilityContext({ correlationId }, () =>
      runWithDbOrganizationPrincipal(organizationId, async () => {
        ready += 1;
        while (ready < 2) await new Promise((resolve) => setImmediate(resolve));
        release();
        await gate;
        return getCurrentObservabilityContext();
      }),
    );

  const [a, b] = await Promise.all([
    run(CORRELATION_A, ORGANIZATION_A),
    run(CORRELATION_B, ORGANIZATION_B),
  ]);
  assert.deepEqual(a, { correlationId: CORRELATION_A, orgId: ORGANIZATION_A });
  assert.deepEqual(b, { correlationId: CORRELATION_B, orgId: ORGANIZATION_B });
  assert.deepEqual(getCurrentObservabilityContext(), {});
});
