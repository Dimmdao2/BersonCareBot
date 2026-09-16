/**
 * Incident regression: on the shared staff Host the ambient surface resolves to `staff`. That
 * surface must reject a standalone email-code login door, but it must not suppress an email code
 * that the staff flow already requested after a verified password or during specialist signup.
 *
 * The observable boundary is the signed HTTP request to the integrator. Reverting the shared gate
 * to one surface-dependent decision for every purpose must stop that request and make this suite
 * red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESOLVED_SURFACE_HEADER,
  serializeResolvedSurface,
} from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({
  getPublicAuthChannelConfigured: vi.fn(),
  getPublicRuntimeBool: vi.fn(),
  getPublicRuntimeValue: vi.fn(),
  headers: vi.fn(),
  fetchImpl: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicAuthChannelConfigured: fakes.getPublicAuthChannelConfigured,
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
  getPublicRuntimeValue: fakes.getPublicRuntimeValue,
}));
vi.mock('next/headers', () => ({ headers: fakes.headers }));

import { createIntegratorEmailAdapter } from './integratorEmailAdapter';

const STAFF_HEADERS = new Headers({
  [RESOLVED_SURFACE_HEADER]: serializeResolvedSurface({
    surface: 'staff',
    publicOrigin: 'https://test.bersoncare.ru',
    authPolicy: { availableMethods: ['password', 'totp', 'passkey'], enabledMethods: ['password'] },
  }),
});
const MAIL_PROFILE = { kind: 'platform', senderDisplayName: 'Therapysto' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  fakes.headers.mockResolvedValue(STAFF_HEADERS);
  fakes.getPublicAuthChannelConfigured.mockResolvedValue(true);
  fakes.fetchImpl.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

describe('email-code delivery purpose on an ambient staff surface', () => {
  it('delivers the staff email factor but keeps the standalone email-code login door closed', async () => {
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: 'https://integrator.example.test',
      sharedSecret: 'test-secret',
      fetchImpl: fakes.fetchImpl,
    });

    await expect(
      adapter.sendEmailCode('doctor@example.test', '123456', MAIL_PROFILE, 'staff_login_factor'),
    ).resolves.toEqual({ ok: true });
    expect(fakes.fetchImpl).toHaveBeenCalledOnce();

    fakes.fetchImpl.mockClear();
    await expect(
      adapter.sendEmailCode('doctor@example.test', '654321', MAIL_PROFILE, 'login'),
    ).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
    expect(fakes.fetchImpl).not.toHaveBeenCalled();
  });

  it('delivers specialist-signup confirmation on the same ambient staff surface', async () => {
    const adapter = createIntegratorEmailAdapter({
      integratorBaseUrl: 'https://integrator.example.test',
      sharedSecret: 'test-secret',
      fetchImpl: fakes.fetchImpl,
    });

    await expect(
      adapter.sendEmailCode('new-doctor@example.test', '123456', MAIL_PROFILE, 'specialist_signup'),
    ).resolves.toEqual({ ok: true });
    expect(fakes.fetchImpl).toHaveBeenCalledOnce();
  });
});
