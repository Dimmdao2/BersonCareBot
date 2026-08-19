import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeOperatorAlertEnvLabel } from './operatorAlertEnvLabel';

describe('computeOperatorAlertEnvLabel (pure)', () => {
  it('labels the three known deployment hosts', () => {
    expect(computeOperatorAlertEnvLabel({ appBaseUrl: 'http://127.0.0.1:5200' })).toBe('DEV');
    expect(computeOperatorAlertEnvLabel({ appBaseUrl: 'https://test.bersoncare.ru' })).toBe(
      'TEST',
    );
    expect(computeOperatorAlertEnvLabel({ appBaseUrl: 'https://bersoncare.ru' })).toBe('PROD');
  });

  it('never guesses PROD for an unrecognised host — labels it honestly with the host itself', () => {
    expect(computeOperatorAlertEnvLabel({ appBaseUrl: 'https://staging.example.net' })).toBe(
      'unknown(staging.example.net)',
    );
    expect(computeOperatorAlertEnvLabel({ appBaseUrl: 'not-a-url' })).toBe('unknown(not-a-url)');
  });

  it('lets an explicit override win over the derived host', () => {
    expect(
      computeOperatorAlertEnvLabel({ appBaseUrl: 'https://bersoncare.ru', override: 'CANARY' }),
    ).toBe('CANARY');
  });

  it('falls back to the derived value when the override is unset or blank', () => {
    expect(
      computeOperatorAlertEnvLabel({ appBaseUrl: 'https://bersoncare.ru', override: '' }),
    ).toBe('PROD');
    expect(
      computeOperatorAlertEnvLabel({ appBaseUrl: 'https://bersoncare.ru', override: '   ' }),
    ).toBe('PROD');
  });
});

describe('resolveOperatorAlertEnvLabel / stampOperatorAlertSubject (wired to process env)', () => {
  const ORIGINAL_OVERRIDE = process.env.OPERATOR_ALERT_ENV_LABEL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPERATOR_ALERT_ENV_LABEL;
  });

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL_OVERRIDE === undefined) delete process.env.OPERATOR_ALERT_ENV_LABEL;
    else process.env.OPERATOR_ALERT_ENV_LABEL = ORIGINAL_OVERRIDE;
    vi.doUnmock('@/config/env');
  });

  it('derives the label from APP_BASE_URL by default (nothing breaks when the override is unset)', async () => {
    vi.doMock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));
    const { stampOperatorAlertSubject } = await import('./operatorAlertEnvLabel');
    expect(stampOperatorAlertSubject('Очередь транскода HLS: error')).toBe(
      '[TEST] Очередь транскода HLS: error',
    );
  });

  it('keeps the original subject text intact after the label prefix', async () => {
    vi.doMock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://bersoncare.ru' } }));
    const { stampOperatorAlertSubject } = await import('./operatorAlertEnvLabel');
    const subject = 'Самая старая неотправленная позиция: 18 ч';
    expect(stampOperatorAlertSubject(subject)).toBe(`[PROD] ${subject}`);
  });

  it('an explicit OPERATOR_ALERT_ENV_LABEL override beats the derived host', async () => {
    process.env.OPERATOR_ALERT_ENV_LABEL = 'STAGE-B';
    vi.doMock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://bersoncare.ru' } }));
    const { stampOperatorAlertSubject } = await import('./operatorAlertEnvLabel');
    expect(stampOperatorAlertSubject('x')).toBe('[STAGE-B] x');
  });
});
