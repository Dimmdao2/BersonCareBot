import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformTelegramCredentialsSection } from './PlatformTelegramCredentialsSection';

const fetchMock = vi.fn<typeof fetch>();

// Deliberately mixed configured/unconfigured statuses per credential so the assertions below
// prove each field is wired to its own settings key, not just that "some" fields are configured.
const CREDENTIAL_FIELDS = [
  { title: 'Токен бота', key: 'telegram_bot_token', configured: true },
  { title: 'Секрет вебхука', key: 'telegram_webhook_secret', configured: true },
  { title: 'Токен сообщества', key: 'vk_community_access_token', configured: false },
  { title: 'Секрет Callback API', key: 'vk_callback_secret', configured: true },
  { title: 'Строка подтверждения Callback API', key: 'vk_callback_confirmation_token', configured: false },
] as const;

describe('PlatformTelegramCredentialsSection', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          settings: [
            ...CREDENTIAL_FIELDS.map((field) => ({
              key: field.key,
              valueJson: { value: { configured: field.configured } },
            })),
            { key: 'telegram_mode', valueJson: { value: 'long_polling' } },
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

  it('shows a credential input per Telegram/VK secret with its own configured status', async () => {
    render(<PlatformTelegramCredentialsSection />);

    for (const field of CREDENTIAL_FIELDS) {
      const title = await screen.findByText(field.title);
      const section = title.closest('section');
      if (!section) throw new Error(`no section found for ${field.title}`);
      const scoped = within(section);
      expect(section.querySelector('input[type="password"]')).toBeTruthy();
      await waitFor(() =>
        expect(scoped.getByText(field.configured ? 'Задано' : 'Не задано')).toBeVisible(),
      );
    }
  });

  it('shows the selected mode and the restart notice', async () => {
    render(<PlatformTelegramCredentialsSection />);

    expect(await screen.findByLabelText('Режим приёма сообщений')).toHaveTextContent('Long polling');
    expect(screen.getByText('Изменение вступит в силу после перезапуска интегратора.')).toBeVisible();
  });
});
