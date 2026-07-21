import {
  BC_CORRELATION_ID_HEADER,
  getCurrentCorrelationId,
  getCurrentObservabilityContext,
} from '@bersoncare/db-principal';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerHttpCorrelationContext, resolveHttpCorrelationId } from './httpCorrelation.js';

async function buildProbe() {
  const app = Fastify({ logger: false, genReqId: resolveHttpCorrelationId });
  registerHttpCorrelationContext(app);
  app.get('/probe', async () => ({ correlationId: getCurrentCorrelationId() }));
  return app;
}

describe('integrator HTTP correlation ingress', () => {
  it('preserves a valid UUID through Fastify lifecycle and response', async () => {
    const app = await buildProbe();
    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { [BC_CORRELATION_ID_HEADER]: correlationId },
    });
    expect(response.json()).toEqual({ correlationId });
    expect(response.headers[BC_CORRELATION_ID_HEADER]).toBe(correlationId);
    await app.close();
  });

  it.each([
    { label: 'forged', input: 'patient-name-or-token' },
    { label: 'oversized', input: 'x'.repeat(10_000) },
  ])(
    'replaces $label input instead of copying it into context',
    async ({ input: forged }) => {
      const app = await buildProbe();
      const response = await app.inject({
        method: 'GET',
        url: '/probe',
        headers: { [BC_CORRELATION_ID_HEADER]: forged },
      });
      const correlationId = (response.json() as { correlationId: string }).correlationId;
      expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(correlationId).not.toBe(forged);
      expect(response.headers[BC_CORRELATION_ID_HEADER]).toBe(correlationId);
      await app.close();
    },
  );

  it('keeps parallel requests isolated', async () => {
    const app = await buildProbe();
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const [left, right] = await Promise.all([
      app.inject({ method: 'GET', url: '/probe', headers: { [BC_CORRELATION_ID_HEADER]: a } }),
      app.inject({ method: 'GET', url: '/probe', headers: { [BC_CORRELATION_ID_HEADER]: b } }),
    ]);
    expect(left.json()).toEqual({ correlationId: a });
    expect(right.json()).toEqual({ correlationId: b });
    expect(getCurrentCorrelationId()).toBeUndefined();
    await app.close();
  });

  it('never accepts organization context from an HTTP header', async () => {
    const app = Fastify({ logger: false, genReqId: resolveHttpCorrelationId });
    registerHttpCorrelationContext(app);
    app.get('/probe', async () => getCurrentObservabilityContext());
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: {
        [BC_CORRELATION_ID_HEADER]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'x-bc-organization-id': '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(response.json()).toEqual({
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    await app.close();
  });
});
