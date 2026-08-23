import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinicDeliveryChannelsSection } from './ClinicDeliveryChannelsSection';

const allEnabled = {
  version: 1 as const,
  integrations: {
    email: true,
    smsc: true,
    telegram: true,
    max: true,
    vk: true,
  },
};

const initial = {
  smtp: {
    configured: false,
    host: '',
    port: '',
    secure: false,
    user: '',
    from: '',
  },
  smsConfigured: true,
  telegramConfigured: true,
  maxConfigured: true,
  vkConfigured: true,
  telegramWebhookPath: null,
  maxWebhookPath: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ClinicDeliveryChannelsSection', () => {
  it('shows configured status for its shared write-only credential inputs', () => {
    render(
      <ClinicDeliveryChannelsSection
        initial={initial}
        platformAvailability={allEnabled}
        smtpEntitled
      />,
    );

    expect(screen.getAllByText('Подключён')).toHaveLength(4);
  });

  it('does not offer the SMTP form when the platform disabled email', () => {
    render(
      <ClinicDeliveryChannelsSection
        initial={initial}
        platformAvailability={{
          ...allEnabled,
          integrations: { ...allEnabled.integrations, email: false },
        }}
        smtpEntitled
      />,
    );

    expect(screen.queryByText('SMTP')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить SMTP' })).not.toBeInTheDocument();
  });

  it('explains the tariff refusal without offering an unusable SMTP button', () => {
    render(
      <ClinicDeliveryChannelsSection
        initial={initial}
        platformAvailability={allEnabled}
        smtpEntitled={false}
      />,
    );

    expect(screen.getByText('Собственный SMTP недоступен на вашем тарифе.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить SMTP' })).not.toBeInTheDocument();
  });

  it('shows the human server refusal instead of its machine token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: 'integration_availability_unavailable',
            message: 'Сервер не смог проверить доступность интеграции. Повторите позже.',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    render(
      <ClinicDeliveryChannelsSection
        initial={initial}
        platformAvailability={allEnabled}
        smtpEntitled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить SMTP' }));

    await waitFor(() =>
      expect(
        screen.getByText('Сервер не смог проверить доступность интеграции. Повторите позже.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('integration_availability_unavailable')).not.toBeInTheDocument();
  });
});
