import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformTelegramCredentialsSection } from './PlatformTelegramCredentialsSection';

const fetchMock = vi.fn<typeof fetch>();

describe('PlatformTelegramCredentialsSection', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          settings: [
            {
              key: 'telegram_bot_token',
              valueJson: { value: { configured: true } },
            },
            {
              key: 'telegram_webhook_secret',
              valueJson: { value: { configured: true } },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the configured indicator returned for both write-only credentials', async () => {
    const { container } = render(<PlatformTelegramCredentialsSection />);

    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText('Задано')).toHaveLength(2));
  });
});
