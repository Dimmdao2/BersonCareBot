import { describe, expect, it } from 'vitest';
import {
  isValidSaasBillingPaymentProviderFiscalSettings,
  mergeSaasBillingPaymentProviderSecretsRetain,
  parseSaasBillingPaymentProviderSettings,
  redactSaasBillingPaymentProviderValue,
} from './settings';
import { SAAS_BILLING_INVOICE_VALIDITY_DAYS } from './invoiceValidity';

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

/**
 * Владелец, 18.08: срок жизни счёта — админ-настройка, одна на все счета. Её дом —
 * `saas_billing_payment_provider.value.lifecyclePolicy.invoiceValidityDays`, и второго быть не
 * должно. Эти проверки держат именно ЭТОТ адрес: и при чтении, и на обратном пути через redact и
 * merge, которыми админский экран сохраняет настройку.
 */
describe('срок жизни счёта — настройка, а не константа', () => {
  it('читает заданный администратором срок из lifecyclePolicy', () => {
    expect(
      parseSaasBillingPaymentProviderSettings({
        value: { lifecyclePolicy: { invoiceValidityDays: 7 } },
      }).lifecyclePolicy.invoiceValidityDays,
    ).toBe(7);
  });

  it('без настройки действует документированный дефолт, а не пустота', () => {
    for (const raw of [null, {}, { lifecyclePolicy: null }, { lifecyclePolicy: {} }]) {
      expect(
        parseSaasBillingPaymentProviderSettings({ value: raw }).lifecyclePolicy
          .invoiceValidityDays,
      ).toBe(SAAS_BILLING_INVOICE_VALIDITY_DAYS);
    }
  });

  it('мусор вместо срока не становится сроком — та же дисциплина, что у соседей', () => {
    for (const invoiceValidityDays of [0, -5, 1.5, '30', null]) {
      expect(
        parseSaasBillingPaymentProviderSettings({
          value: { lifecyclePolicy: { invoiceValidityDays } },
        }).lifecyclePolicy.invoiceValidityDays,
      ).toBe(SAAS_BILLING_INVOICE_VALIDITY_DAYS);
    }
  });

  it('соседние числа политики читаются независимо: неполнота одного не прячет остальные', () => {
    const policy = parseSaasBillingPaymentProviderSettings({
      value: { lifecyclePolicy: { graceDays: 3, invoiceValidityDays: 14 } },
    }).lifecyclePolicy;
    expect(policy).toEqual({
      graceDays: 3,
      chargeAttempts: null,
      readOnlyDays: null,
      invoiceValidityDays: 14,
    });
  });

  it('сохранение админского экрана возвращает срок на тот же адрес, а не рядом с ним', async () => {
    const stored = { value: { lifecyclePolicy: { invoiceValidityDays: 45 } } };

    // Экран читает настройку через redact и PATCH-ит прочитанное обратно; merge — серверная сторона
    // того же сохранения. Если срок уедет на верхний уровень, следующее чтение молча вернёт дефолт.
    const redacted = redactSaasBillingPaymentProviderValue(stored);
    expect(parseSaasBillingPaymentProviderSettings(redacted).lifecyclePolicy.invoiceValidityDays).toBe(
      45,
    );

    const merged = await mergeSaasBillingPaymentProviderSecretsRetain(
      async () => stored,
      redacted,
    );
    expect(parseSaasBillingPaymentProviderSettings(merged).lifecyclePolicy.invoiceValidityDays).toBe(
      45,
    );
  });
});
