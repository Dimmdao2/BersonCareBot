/**
 * E2E: auth exchange API. Requires WEBAPP_E2E_BASE_URL when running against real server.
 */
import { describe, expect, it } from 'vitest';

const BASE = process.env.WEBAPP_E2E_BASE_URL ?? '';
const ORIGIN = BASE ? new URL(BASE).origin : '';

const webViewMutationHeaders = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  'Sec-Fetch-Site': 'same-origin',
};

describe('api/auth/exchange e2e', () => {
  const skip = !BASE;

  it.skipIf(skip)('POST with dev:client returns 200 and redirectTo', async () => {
    const res = await fetch(`${BASE}/api/auth/exchange`, {
      method: 'POST',
      headers: webViewMutationHeaders,
      body: JSON.stringify({ token: 'dev:client' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; redirectTo?: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe('/app/patient');
  });

  it.skipIf(skip)('POST without token returns 400', async () => {
    const res = await fetch(`${BASE}/api/auth/exchange`, {
      method: 'POST',
      headers: webViewMutationHeaders,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it.skipIf(skip)(
    'DEV WebView-style cross-site or missing origin metadata is rejected',
    async () => {
      const rejectedHeaderSets: Array<Record<string, string>> = [
        {
          'Content-Type': 'application/json',
          Origin: 'https://cross-site.invalid',
          'Sec-Fetch-Site': 'cross-site',
        },
        { 'Content-Type': 'application/json' },
      ];
      for (const headers of rejectedHeaderSets) {
        const res = await fetch(`${BASE}/api/auth/exchange`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ ok: false, error: 'csrf_origin_forbidden' });
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('set-cookie')).toBeNull();
      }
    },
  );
});
