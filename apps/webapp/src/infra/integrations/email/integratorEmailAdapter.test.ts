import { describe, expect, it, vi } from 'vitest';
import { BC_CORRELATION_ID_HEADER, runWithObservabilityContext } from '@bersoncare/db-principal';
import { createIntegratorEmailAdapter } from './integratorEmailAdapter';

describe('integratorEmailAdapter', () => {
  it('returns ok=true when integrator accepts request', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-webhook-secret-16chars',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await adapter.sendEmailCode('user@example.com', '123456');

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the bounded ambient correlation header without payload duplication', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-webhook-secret-16chars',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await runWithObservabilityContext({ correlationId }, () =>
      adapter.sendEmailCode('user@example.com', '123456'),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ [BC_CORRELATION_ID_HEADER]: correlationId });
    expect(String(init.body)).not.toContain(correlationId);
  });

  it('returns error when integrator responds with non-2xx', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'email_not_configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-webhook-secret-16chars',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await adapter.sendEmailCode('user@example.com', '123456');

    expect(res).toEqual({ ok: false, error: 'http_503' });
  });
});
