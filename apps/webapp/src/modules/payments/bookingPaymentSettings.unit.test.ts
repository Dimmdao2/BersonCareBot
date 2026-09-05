import { describe, expect, it } from 'vitest';
import {
  mergeBookingPaymentProvidersSecretsRetain,
  parseBookingPaymentSettingsValue,
} from './bookingPaymentSettings';
import { buildBookingPaymentReceipt } from './fiscalReceipt';

describe('booking payment fiscal settings', () => {
  it('fails closed when merchant VAT or customer contact is absent', () => {
    const settings = {
      enabled: true,
      defaultProviderId: 'yookassa',
      providers: [],
    };

    expect(() =>
      buildBookingPaymentReceipt({
        settings,
        providerId: 'yookassa',
        customerEmail: 'patient@example.test',
        description: 'Приём',
        amountMinor: 5_000,
      }),
    ).toThrow('booking_payment_receipt_vat_code_missing');
    expect(() =>
      buildBookingPaymentReceipt({
        settings: { ...settings, fiscalVatCode: '1' },
        providerId: 'yookassa',
        customerEmail: null,
        description: 'Приём',
        amountMinor: 5_000,
      }),
    ).toThrow('booking_payment_receipt_customer_email_missing');
  });

  it('parses only valid YooKassa fiscal codes', () => {
    expect(
      parseBookingPaymentSettingsValue({
        value: { fiscalVatCode: '11', fiscalTaxSystemCode: '2' },
      }),
    ).toMatchObject({ fiscalVatCode: '11', fiscalTaxSystemCode: '2' });
    expect(
      parseBookingPaymentSettingsValue({
        value: { fiscalVatCode: '20%', fiscalTaxSystemCode: '7' },
      }),
    ).toMatchObject({ fiscalVatCode: null, fiscalTaxSystemCode: null });
  });

  /**
   * PAY-APPT-22: since the browser no longer receives the secret, an admin who opens the payment
   * settings and presses «Сохранить» without retyping sends back an empty field. That MUST retain
   * the stored credential — the alternative is silently wiping a working acquiring account on a
   * no-op save. The `hasApiKey`/`hasWebhookSecret` facts the projection added are display-only and
   * must not reach the stored value.
   */
  it('retains stored secrets on a save that carries only the safe projection facts', async () => {
    const merged = await mergeBookingPaymentProvidersSecretsRetain(
      async () => ({
        value: {
          providers: [
            { id: 'yookassa', label: 'ЮKassa', enabled: true, apiKey: 'stored-yookassa-key' },
            {
              id: 'tinkoff',
              label: 'Тинькофф Касса',
              enabled: true,
              apiKey: 'stored-tinkoff-key',
              webhookSecret: 'stored-tinkoff-hook',
            },
          ],
        },
      }),
      {
        value: {
          defaultProviderId: 'yookassa',
          providers: [
            {
              id: 'yookassa',
              label: 'ЮKassa',
              enabled: true,
              shopId: 'shop-42',
              apiKey: '',
              hasApiKey: true,
            },
            // Nothing at all about the secrets: an older client may omit the fields entirely.
            { id: 'tinkoff', label: 'Тинькофф Касса', enabled: true, hasWebhookSecret: true },
          ],
        },
      },
    );

    const providers = (merged.value as { providers: Array<Record<string, unknown>> }).providers;
    expect(providers[0]).toMatchObject({ shopId: 'shop-42', apiKey: 'stored-yookassa-key' });
    expect(providers[1]).toMatchObject({
      apiKey: 'stored-tinkoff-key',
      webhookSecret: 'stored-tinkoff-hook',
    });
    for (const provider of providers) {
      expect(provider).not.toHaveProperty('hasApiKey');
      expect(provider).not.toHaveProperty('hasWebhookSecret');
    }
  });

  /**
   * The other half of the retain contract, and the one no test held: a secret the admin DID retype
   * must reach the stored value. The break is «провайдер сменил ключ, админ вписал новый, форма
   * ответила «Сохранён», а сервер оставил мёртвый старый» — the acquiring account stops taking
   * money and nothing anywhere says so, because retain is exactly the code path that hides it.
   */
  it('stores a retyped acquiring secret instead of retaining the previous one', async () => {
    const merged = await mergeBookingPaymentProvidersSecretsRetain(
      async () => ({
        value: {
          providers: [
            { id: 'yookassa', label: 'ЮKassa', enabled: true, apiKey: 'rotated-away-key' },
            {
              id: 'tinkoff',
              label: 'Тинькофф Касса',
              enabled: true,
              apiKey: 'old-tinkoff-key',
              webhookSecret: 'old-tinkoff-hook',
            },
          ],
        },
      }),
      {
        value: {
          defaultProviderId: 'yookassa',
          providers: [
            { id: 'yookassa', label: 'ЮKassa', enabled: true, apiKey: 'fresh-yookassa-key' },
            {
              id: 'tinkoff',
              label: 'Тинькофф Касса',
              enabled: true,
              apiKey: 'fresh-tinkoff-key',
              webhookSecret: 'fresh-tinkoff-hook',
            },
          ],
        },
      },
    );

    const providers = (merged.value as { providers: Array<Record<string, unknown>> }).providers;
    expect(providers[0]).toMatchObject({ apiKey: 'fresh-yookassa-key' });
    expect(providers[1]).toMatchObject({
      apiKey: 'fresh-tinkoff-key',
      webhookSecret: 'fresh-tinkoff-hook',
    });
  });

  it('retains fiscal settings while preserving redacted provider secrets', async () => {
    const merged = await mergeBookingPaymentProvidersSecretsRetain(
      async () => ({
        value: {
          providers: [
            {
              id: 'yookassa',
              label: 'ЮKassa',
              enabled: true,
              webhookSecret: 'obsolete-secret',
              apiKey: 'secret',
            },
          ],
        },
      }),
      {
        value: {
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          fiscalTaxSystemCode: '3',
          providers: [
            {
              id: 'yookassa',
              label: 'ЮKassa',
              enabled: true,
              webhookSecret: '[REDACTED]',
              apiKey: '[REDACTED]',
            },
          ],
        },
      },
    );

    expect(merged).toEqual({
      value: expect.objectContaining({
        fiscalVatCode: '1',
        fiscalTaxSystemCode: '3',
        providers: [expect.objectContaining({ apiKey: 'secret' })],
      }),
    });
    expect(
      (merged.value as { providers: Array<Record<string, unknown>> }).providers[0],
    ).not.toHaveProperty('webhookSecret');
  });
});
