import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaasBillingProviderSettings } from './SaasBillingProviderSettings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const storedSetting = {
  key: 'saas_billing_payment_provider',
  scope: 'admin',
  valueJson: {
    value: {
      defaultProviderId: 'yookassa',
      providers: [
        {
          id: 'yookassa',
          label: 'ЮKassa',
          enabled: true,
          shopId: '1425962',
          apiKey: '[REDACTED]',
          webhookSecret: '[REDACTED]',
        },
      ],
      payeeRequisites: { vatCode: null, taxSystemCode: null },
      lifecyclePolicy: null,
    },
  },
  updatedAt: '2026-08-03T00:00:00.000Z',
  updatedBy: null,
};

describe('SaasBillingProviderSettings', () => {
  it('saves a fiscal selection while retaining the stored secret markers', async () => {
    const user = userEvent.setup();
    let patchBody: unknown = null;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchBody = JSON.parse(String(init.body)) as unknown;
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              ok: true,
              setting: {
                ...storedSetting,
                valueJson: {
                  value: {
                    ...storedSetting.valueJson.value,
                    providers: [
                      {
                        ...storedSetting.valueJson.value.providers[0],
                        webhookSecret: '[REDACTED]',
                      },
                    ],
                  },
                },
              },
            }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, settings: [storedSetting] }),
      };
    });
    vi.stubGlobal('fetch', fetch);

    render(<SaasBillingProviderSettings />);

    expect(await screen.findByDisplayValue('1425962')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ключ сохранён')).toHaveValue('');
    expect(screen.getByPlaceholderText('Секрет сохранён')).toHaveValue('');
    await user.click(screen.getByLabelText('НДС в чеке'));
    await user.click(await screen.findByRole('option', { name: '20%' }));
    await user.type(screen.getByLabelText('Секрет вебхука'), 'fresh-webhook-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toMatchObject({
      key: 'saas_billing_payment_provider',
      value: {
        value: {
          providers: [
            {
              id: 'yookassa',
              apiKey: '[REDACTED]',
              webhookSecret: 'fresh-webhook-secret',
              shopId: '1425962',
            },
          ],
          payeeRequisites: { vatCode: '4', taxSystemCode: null },
        },
      },
    });
  });
});
