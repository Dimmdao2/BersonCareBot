import { describe, expect, it } from 'vitest';
import {
  mergeBookingPaymentProvidersSecretsRetain,
  parseBookingPaymentSettingsValue,
} from './bookingPaymentSettings';

describe('booking payment fiscal settings', () => {
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

  it('retains fiscal settings while preserving redacted provider secrets', async () => {
    const merged = await mergeBookingPaymentProvidersSecretsRetain(
      async () => ({
        value: {
          providers: [
            {
              id: 'yookassa',
              label: 'ЮKassa',
              enabled: true,
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
  });
});
