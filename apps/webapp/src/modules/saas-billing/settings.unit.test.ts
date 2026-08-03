import { describe, expect, it } from 'vitest';
import { isValidSaasBillingPaymentProviderFiscalSettings } from './settings';

describe('SaaS billing provider fiscal settings', () => {
  it('accepts YooKassa fiscal codes and permits an unset optional tax system', () => {
    expect(
      isValidSaasBillingPaymentProviderFiscalSettings({
        value: { payeeRequisites: { vatCode: '4', taxSystemCode: null } },
      }),
    ).toBe(true);
  });

  it('rejects unsupported fiscal codes', () => {
    expect(
      isValidSaasBillingPaymentProviderFiscalSettings({
        value: { payeeRequisites: { vatCode: '20%', taxSystemCode: '7' } },
      }),
    ).toBe(false);
  });
});
