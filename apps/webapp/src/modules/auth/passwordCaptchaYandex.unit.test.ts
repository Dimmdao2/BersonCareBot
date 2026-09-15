import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordAltchaService } from '@/modules/auth/passwordAltcha';
import type { PasswordLoginProtectionPort } from '@/modules/auth/passwordLoginProtectionPort';

vi.mock('@/infra/logging/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * Молчание Яндекса — не пропуск (решение владельца 14.09: «значит не пускать»). Здесь проверяется
 * именно разделение двух разных исходов: «капча не пройдена» (Яндекс ответил `failed`) и «поставщик
 * не ответил» (таймаут, обрыв, не-200, нечитаемый ответ). Первое — обычная неудачная попытка,
 * второе маршрут обязан превратить в отказ ДО двери входа, не тронув счётчик попыток.
 */
const EMAIL = 'person@example.test';

const port: PasswordLoginProtectionPort = {
  acquirePasswordProof: vi.fn(),
  completePasswordProof: vi.fn(),
  readAltchaRootSecret: vi.fn(async () => null),
  readCaptchaConfig: vi.fn(async () => ({
    provider: 'yandex' as const,
    yandexClientKey: 'client-key',
    yandexServerKey: 'server-key',
  })),
  registerAltchaChallenge: vi.fn(async () => true),
  registerPublicLeadAltchaChallenge: vi.fn(async () => true),
  consumePublicLeadAltchaChallenge: vi.fn(async () => true),
};

const service = createPasswordAltchaService(port);
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Yandex SmartCaptcha verification', () => {
  it('accepts a token the provider confirmed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    await expect(service.verify(EMAIL, 'token', '203.0.113.7')).resolves.toEqual({
      verifiedExternally: true,
    });
  });

  it('treats a rejected token as a failed captcha, not as an outage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'failed', message: 'Invalid token' }));

    await expect(service.verify(EMAIL, 'token', '203.0.113.7')).resolves.toEqual({
      verifiedExternally: false,
    });
  });

  it('refuses instead of passing when the provider answers with an HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('gateway down', { status: 502 }));

    await expect(service.verify(EMAIL, 'token', null)).resolves.toEqual({
      verifiedExternally: false,
      providerUnavailable: true,
    });
  });

  it('refuses instead of passing when the request times out or the connection breaks', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(service.verify(EMAIL, 'token', null)).resolves.toEqual({
      verifiedExternally: false,
      providerUnavailable: true,
    });
  });

  it('refuses instead of passing when the answer cannot be read', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));

    await expect(service.verify(EMAIL, 'token', null)).resolves.toEqual({
      verifiedExternally: false,
      providerUnavailable: true,
    });
  });

  it('sends the address only when it really is one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await service.verify(EMAIL, 'token', 'email_password_login:missing_x_real_ip');
    const withoutAddress = fetchMock.mock.calls[0]?.[1] as { body: URLSearchParams };
    expect(withoutAddress.body.has('ip')).toBe(false);

    await service.verify(EMAIL, 'token', '203.0.113.7');
    const withAddress = fetchMock.mock.calls[1]?.[1] as { body: URLSearchParams };
    expect(withAddress.body.get('ip')).toBe('203.0.113.7');
  });

  it('does not reach the provider at all when no captcha answer was submitted', async () => {
    await expect(service.verify(EMAIL, undefined, '203.0.113.7')).resolves.toEqual({
      verifiedExternally: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(port.readCaptchaConfig).not.toHaveBeenCalled();
  });
});
