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

  /**
   * Владелец, 18.08: срок жизни счёта — админ-настройка, которую он должен видеть и менять. Без
   * этой проверки экран мог бы показывать число и не сохранять его — или сохранять НЕ туда, откуда
   * его потом читают все пути выставления (`lifecyclePolicy.invoiceValidityDays`).
   */
  it('показывает дефолтный срок оплаты счёта и сохраняет новый в lifecyclePolicy', async () => {
    let patchBody: unknown = null;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchBody = JSON.parse(String(init.body)) as unknown;
        return {
          ok: true,
          text: async () => JSON.stringify({ ok: true, setting: storedSetting }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, settings: [storedSetting] }),
      };
    });
    vi.stubGlobal('fetch', fetch);

    render(<SaasBillingProviderSettings />);

    const validity = await screen.findByLabelText('Срок оплаты счёта, дней');
    // Настройка не задана в storedSetting — экран показывает документированный дефолт, не пустоту.
    expect(validity).toHaveValue(30);

    fireEvent.change(validity, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toMatchObject({
      key: 'saas_billing_payment_provider',
      value: { value: { lifecyclePolicy: { invoiceValidityDays: 14 } } },
    });
  });

  it('не даёт сохранить бессмысленный срок вместо того, чтобы записать его в настройку', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new Error('PATCH не должен был уйти');
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, settings: [storedSetting] }),
      };
    });
    vi.stubGlobal('fetch', fetch);

    render(<SaasBillingProviderSettings />);

    const validity = await screen.findByLabelText('Срок оплаты счёта, дней');
    fireEvent.change(validity, { target: { value: '0' } });

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
