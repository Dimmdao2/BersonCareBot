/**
 * Public provider-boundary acceptance contract for RuStore Universal Push.
 *
 * Failure caught: native Push is sent in the obsolete direct-RuStore shape, or a provider/auth
 * failure retires an otherwise usable app target. Oracle: RuStore Universal Push API and examples
 * (inspected 2026-09-09) plus `MASTER_PLAN.md` M6-03/M6-05/M6-08/M6-11.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRuStoreUniversalPush } from './rustoreUniversalClient.js';

const originalFetch = globalThis.fetch;
const config = { endpoint: '', projectId: 'project-audit', authToken: 'test-auth-token' };
const data = {
  route: '/app/patient/notifications',
  pushSurface: 'therapygo',
  pushKind: 'appointment_reminder',
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('RuStore Universal Push provider boundary', () => {
  it('sends one default Universal request without direct bearer authorization', async () => {
    const providerFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ status: 'OK' }), { status: 200 }),
    );
    globalThis.fetch = providerFetch as never;

    const result = await sendRuStoreUniversalPush({ config, token: 'target-token', data });

    expect(result).toEqual({ ok: true });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const [url, init] = providerFetch.mock.calls[0]!;
    if (!init) throw new Error('RuStore request init is required');
    expect(url).toBe('https://vkpns-universal.rustore.ru/v1/send');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toEqual({
      providers: { rustore: { project_id: 'project-audit', auth_token: 'test-auth-token' } },
      tokens: { rustore: ['target-token'] },
      message: { data },
    });
  });

  it.each([
    ['validation', 400, ['message.data: invalid']],
    ['invalid auth token', 401, ['rustore: invalid auth token']],
    ['internal', 500, ['rustore: internal']],
  ])('returns a typed non-deactivating provider error for %s failures', async (_name, status, errors) => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'PROVIDER_ERROR', code: status, errors }), { status }),
    ) as never;

    await expect(sendRuStoreUniversalPush({ config, token: 'target-token', data })).resolves.toEqual({
      ok: false,
      status,
      code: 'provider_error',
    });
  });

  it('classifies only official RuStore invalid-token vocabulary as an invalid target', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        status: 'PROVIDER_ERROR',
        code: 400,
        errors: ['rustore: invalid tokens target'],
      }), { status: 400 }),
    ) as never;

    await expect(sendRuStoreUniversalPush({ config, token: 'target-token', data })).resolves.toEqual({
      ok: false,
      status: 400,
      code: 'invalid_token',
      invalidToken: true,
    });
  });

  it('returns a non-secret provider error and clears its timeout after a network failure', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network unavailable');
    }) as never;

    const result = await sendRuStoreUniversalPush({ config, token: 'target-token', data });

    expect(result).toEqual({ ok: false, code: 'provider_error' });
    expect(JSON.stringify(result)).not.toContain('target-token');
    expect(JSON.stringify(result)).not.toContain('test-auth-token');
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});
