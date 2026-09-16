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

import type { EmailChallengePurpose } from '@/modules/auth/emailAuthPort';
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

  // Полное отображение назначений, а не два выбранных: `Record` по объединению не даст добавить
  // новое значение `EmailChallengePurpose`, не решив здесь его судьбу. Именно эту дыру нашёл аудит —
  // правка, оставлявшая доставку только двум назначениям, прежде проходила зелёной.
  const DELIVERY_ON_STAFF_SURFACE: Record<EmailChallengePurpose, 'delivered' | 'refused'> = {
    // Единственная самостоятельная дверь: на сотрудничьей поверхности её нет, и настройкой не вернуть.
    login: 'refused',
    public_registration: 'delivered',
    clinic_invite: 'delivered',
    specialist_signup: 'delivered',
    password_reset: 'delivered',
    password_setup: 'delivered',
    email_verify: 'delivered',
    patient_email_change: 'delivered',
    staff_login_factor: 'delivered',
  };

  it.each(Object.entries(DELIVERY_ON_STAFF_SURFACE))(
    'purpose %s on the ambient staff surface is %s',
    async (purpose, expectation) => {
      const adapter = createIntegratorEmailAdapter({
        integratorBaseUrl: 'https://integrator.example.test',
        sharedSecret: 'test-secret',
        fetchImpl: fakes.fetchImpl,
      });

      const result = await adapter.sendEmailCode(
        'person@example.test',
        '123456',
        MAIL_PROFILE,
        purpose as EmailChallengePurpose,
      );

      if (expectation === 'delivered') {
        expect(result).toEqual({ ok: true });
        expect(fakes.fetchImpl).toHaveBeenCalledOnce();
      } else {
        expect(result).toEqual({ ok: false, error: 'auth_channel_disabled' });
        expect(fakes.fetchImpl).not.toHaveBeenCalled();
      }
    },
  );
});
