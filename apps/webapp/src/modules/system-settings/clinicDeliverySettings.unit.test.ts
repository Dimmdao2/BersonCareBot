import { describe, expect, it } from 'vitest';
import { isPerOrgSettingKey } from './orgScopedKeys';
import { redactSettingValueForAudit } from './auditRedaction';
import { redactAdminSettingsForClient } from './webPushVapidRuntime';
import type { SystemSetting } from './types';
import { createSystemSettingsService } from './service';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';

function setting(key: SystemSetting['key'], value: unknown): SystemSetting {
  return {
    key,
    scope: 'admin',
    valueJson: { value },
    updatedAt: '2026-08-02T00:00:00.000Z',
    updatedBy: 'actor',
    organizationId: '11111111-1111-4111-8111-111111111111',
  };
}

describe('clinic delivery settings', () => {
  it('keeps each clinic credential organization-scoped', () => {
    expect(isPerOrgSettingKey('clinic_smtp_outbound')).toBe(true);
    expect(isPerOrgSettingKey('clinic_smsc_api_key')).toBe(true);
    expect(isPerOrgSettingKey('clinic_telegram_bot_token')).toBe(true);
    expect(isPerOrgSettingKey('clinic_max_bot_api_key')).toBe(true);
  });

  it('never exposes or audits clinic credentials verbatim', () => {
    expect(
      redactSettingValueForAudit('clinic_smtp_outbound', {
        value: { host: 'smtp.clinic.test', password: 'secret' },
      }),
    ).toEqual({ value: { host: 'smtp.clinic.test', password: '[REDACTED]' } });
    expect(redactSettingValueForAudit('clinic_telegram_bot_token', { value: 'secret' })).toBe(
      '[REDACTED]',
    );

    const [smtp, telegram] = redactAdminSettingsForClient([
      setting('clinic_smtp_outbound', { host: 'smtp.clinic.test', password: 'secret' }),
      setting('clinic_telegram_bot_token', 'secret'),
    ]);
    expect(smtp?.valueJson).toEqual({
      value: { host: 'smtp.clinic.test', hasStoredPassword: true },
    });
    expect(telegram?.valueJson).toEqual({ value: '[REDACTED]' });
  });

  it('retains the stored clinic SMTP password when the redacted settings form saves an empty password', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());
    await service.updateSetting(
      'clinic_smtp_outbound',
      'admin',
      {
        value: {
          host: 'smtp.clinic.test',
          port: 587,
          secure: false,
          user: 'clinic',
          password: 'stored-secret',
          from: 'clinic@example.test',
        },
      },
      'actor',
      { organizationId },
    );

    await service.updateSetting(
      'clinic_smtp_outbound',
      'admin',
      {
        value: {
          host: 'smtp2.clinic.test',
          port: 587,
          secure: false,
          user: 'clinic',
          password: '',
          from: 'clinic@example.test',
        },
      },
      'actor',
      { organizationId },
    );

    await expect(
      service.getSetting('clinic_smtp_outbound', 'admin', { organizationId }),
    ).resolves.toMatchObject({
      organizationId,
      valueJson: {
        value: { host: 'smtp2.clinic.test', password: 'stored-secret' },
      },
    });
  });
});
