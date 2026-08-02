import { describe, expect, it } from 'vitest';
import { redactSettingValueForAudit } from './auditRedaction';
import { redactAdminSettingsForClient } from './webPushVapidRuntime';
import type { SystemSetting } from './types';

describe('integration credential audit redaction', () => {
  it.each([
    'max_bot_api_key',
    'max_webhook_secret',
    'telegram_bot_token',
    'telegram_webhook_secret',
    'smsc_api_key',
  ])('redacts the complete value for %s', (key) => {
    expect(redactSettingValueForAudit(key, { value: 'credential' })).toBe('[REDACTED]');
  });

  it('keeps non-secret runtime configuration inspectable', () => {
    expect(redactSettingValueForAudit('smsc_base_url', { value: 'https://smsc.ru' })).toEqual({
      value: 'https://smsc.ru',
    });
  });

  it('never returns a runtime integration credential to the settings client', () => {
    const row: SystemSetting = {
      key: 'telegram_bot_token',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: 'credential' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: null,
    };

    expect(redactAdminSettingsForClient([row])[0]?.valueJson).toEqual({
      value: '[REDACTED]',
    });
  });
});
