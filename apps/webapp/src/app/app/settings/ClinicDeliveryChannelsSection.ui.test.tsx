import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

import { ClinicDeliveryChannelsSection } from './ClinicDeliveryChannelsSection';

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

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
    readiness: { status: 'pending' as const },
  },
  smsConfigured: true,
  telegramConfigured: true,
  telegramReadiness: { status: 'enabled' as const, checkedAt: '2026-08-24T00:00:00.000Z' },
  maxConfigured: true,
  maxReadiness: {
    status: 'failed' as const,
    checkedAt: '2026-08-24T00:00:00.000Z',
    reason: 'Токен отклонён',
  },
  vkConfigured: true,
  telegramWebhookPath: null,
  maxWebhookPath: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ClinicDeliveryChannelsSection', () => {
  it('shows live-delivery readiness separately from saved credentials', () => {
    render(
      <ClinicDeliveryChannelsSection
        initial={initial}
        platformAvailability={allEnabled}
        smtpEntitled
      />,
    );

    expect(screen.getAllByText('Настройки сохранены')).toHaveLength(2);
    expect(screen.getByText('Ждём проверочной отправки')).toBeInTheDocument();
    expect(screen.getByText('Канал включён')).toBeInTheDocument();
    expect(screen.getByText('Проверка не прошла: Токен отклонён')).toBeInTheDocument();
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
      expect(toastMock.error).toHaveBeenCalledWith(
        'Сервер не смог проверить доступность интеграции. Повторите позже.',
      ),
    );
    expect(toastMock.error).not.toHaveBeenCalledWith('integration_availability_unavailable');
  });
});
