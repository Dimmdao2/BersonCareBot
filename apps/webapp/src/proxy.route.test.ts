import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

function unsafeRequest(
  pathname: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://app.example.test${pathname}`, {
    method: 'POST',
    headers: {
      host: 'app.example.test',
      'x-forwarded-proto': 'https',
      ...headers,
    },
  });
}

describe('HTTP CSRF origin boundary', () => {
  it('rejects a cross-origin browser mutation with a non-cacheable 403 response', async () => {
    const response = proxy(
      unsafeRequest('/api/account/security/password/change', {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'same-origin',
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'csrf_origin_forbidden',
    });
  });

  it.each([
    ['missing source headers', { 'sec-fetch-site': 'same-origin' }],
    [
      'an ambiguous Origin header',
      {
        origin: 'https://app.example.test, https://attacker.example',
        'sec-fetch-site': 'same-origin',
      },
    ],
  ])('rejects %s on a normal browser mutation', async (_case, headers) => {
    const response = proxy(
      unsafeRequest('/api/account/security/password/change', headers),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'csrf_origin_forbidden',
    });
  });

  it('allows the canonical same-origin browser mutation', () => {
    const response = proxy(
      unsafeRequest('/api/account/security/password/change', {
        origin: 'https://app.example.test',
        'sec-fetch-site': 'same-origin',
      }),
    );

    expect(response.status).not.toBe(403);
  });

  it('keeps the integrator exemption exact instead of exempting path prefixes', () => {
    const exemptResponse = proxy(unsafeRequest('/api/integrator/events'));
    const nearMatchResponse = proxy(unsafeRequest('/api/integrator/events/extra'));

    expect(exemptResponse.status).not.toBe(403);
    expect(nearMatchResponse.status).toBe(403);
  });
});
