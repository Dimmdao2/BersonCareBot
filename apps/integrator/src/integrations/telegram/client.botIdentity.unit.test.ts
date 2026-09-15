import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTelegramBotIdentity } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Telegram bot identity error boundary', () => {
  it('does not expose a rejected bot token from Telegram error details', async () => {
    const botToken = '123456:AA-do-not-leak-this-token';
    const providerDescription = `Unauthorized request to /bot${botToken}/getMe`;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: false, error_code: 401, description: providerDescription }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTelegramBotIdentity(botToken);

    expect(result).toEqual({ ok: false, error: 'telegram_rejected' });
    expect(JSON.stringify(result)).not.toContain(botToken);
    expect(JSON.stringify(result)).not.toContain(providerDescription);
  });
});
