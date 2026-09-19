import { describe, expect, it } from 'vitest';
import { isPerOrgSettingKey } from './orgScopedKeys';
import { redactSettingValueForAudit } from './auditRedaction';
import { redactAdminSettingsForClient } from './webPushVapidRuntime';
import type { SystemSetting } from './types';
import { createSystemSettingsService } from './service';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  parseClinicDeliveryReadiness,
  withClinicDeliveryReadiness,
} from './clinicDeliveryReadiness';
import { parseClinicBotPatchValue } from './clinicBotPatch';

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

  it('stores only a complete owner-authored branded auth-mail template in its clinic row', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const otherOrganizationId = '22222222-2222-4222-8222-222222222222';
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    await expect(
      service.updateSetting(
        'clinic_transactional_mail_template',
        'admin',
        {
          value: {
            senderDisplayNameTemplate: '{{clinicName}}',
            authCodeSubjectTemplate: '{{senderDisplayName}}',
            authCodeTextTemplate: '{{senderDisplayName}} {{code}}',
          },
        },
        'actor',
        { organizationId },
      ),
    ).rejects.toThrow('invalid_setting_value: clinic_transactional_mail_template');

    await service.updateSetting(
      'clinic_transactional_mail_template',
      'admin',
      {
        value: {
          senderDisplayNameTemplate: ' {{clinicName}} · {{platformName}} ',
          authCodeSubjectTemplate: ' Код: {{senderDisplayName}} ',
          authCodeTextTemplate: ' {{senderDisplayName}}: {{code}} ',
        },
      },
      'actor',
      { organizationId },
    );

    await service.updateSetting(
      'clinic_transactional_mail_template',
      'admin',
      {
        value: {
          senderDisplayNameTemplate: '{{clinicName}} + {{platformName}}',
          authCodeSubjectTemplate: 'Код {{senderDisplayName}}',
          authCodeTextTemplate: '{{senderDisplayName}}: {{code}}',
        },
      },
      'other-actor',
      { organizationId: otherOrganizationId },
    );

    await expect(
      Promise.all([
        service.getSetting('clinic_transactional_mail_template', 'admin', { organizationId }),
        service.getSetting('clinic_transactional_mail_template', 'admin', {
          organizationId: otherOrganizationId,
        }),
      ]),
    ).resolves.toMatchObject([
      {
        organizationId,
        valueJson: {
          value: {
            senderDisplayNameTemplate: '{{clinicName}} · {{platformName}}',
            authCodeSubjectTemplate: 'Код: {{senderDisplayName}}',
            authCodeTextTemplate: '{{senderDisplayName}}: {{code}}',
          },
        },
      },
      {
        organizationId: otherOrganizationId,
        valueJson: {
          value: {
            senderDisplayNameTemplate: '{{clinicName}} + {{platformName}}',
            authCodeSubjectTemplate: 'Код {{senderDisplayName}}',
            authCodeTextTemplate: '{{senderDisplayName}}: {{code}}',
          },
        },
      },
    ]);
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

  it('returns public bot routing fields while keeping the credential redacted', () => {
    const row: SystemSetting = {
      ...setting('clinic_telegram_bot_token', 'secret'),
      valueJson: {
        value: 'secret',
        botPublicId: 'clinic_bot',
        inboundForwarding: { enabled: true, destinationChatId: '-123456' },
        deliveryReadiness: { status: 'enabled' },
      },
    };

    expect(redactAdminSettingsForClient([row])[0]?.valueJson).toEqual({
      value: '[REDACTED]',
      botPublicId: 'clinic_bot',
      inboundForwarding: { enabled: true, destinationChatId: '-123456' },
      deliveryReadiness: { status: 'enabled' },
    });
  });

  it('merges a valid public bot patch without changing its secret or readiness', () => {
    expect(
      parseClinicBotPatchValue({
        patchEnvelope: {
          value: '',
          botPublicId: '@new_clinic_bot',
          inboundForwarding: { enabled: true, destinationChatId: '-654321' },
        },
        existingValueJson: {
          value: 'stored-secret',
          botPublicId: 'old_clinic_bot',
          inboundForwarding: { enabled: false, destinationChatId: '' },
          deliveryReadiness: { status: 'enabled', checkedAt: '2026-08-24T00:00:00.000Z' },
        },
      }),
    ).toEqual({
      ok: true,
      credentialChanged: false,
      valueJson: {
        value: 'stored-secret',
        botPublicId: 'new_clinic_bot',
        inboundForwarding: { enabled: true, destinationChatId: '-654321' },
        deliveryReadiness: { status: 'enabled', checkedAt: '2026-08-24T00:00:00.000Z' },
      },
    });
  });

  it.each([{ destinationChatId: '123456' }, { enabled: 'true', destinationChatId: '123456' }])(
    'rejects malformed partial forwarding instead of resetting the saved state: %j',
    (patch) => {
      expect(
        parseClinicBotPatchValue({
          patchEnvelope: { value: '', inboundForwarding: patch },
          existingValueJson: {
            value: 'stored-secret',
            inboundForwarding: { enabled: true, destinationChatId: '-654321' },
            deliveryReadiness: { status: 'enabled' },
          },
        }),
      ).toMatchObject({ ok: false });
    },
  );

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

  it('keeps readiness beside the secret envelope and defaults legacy credentials to pending', () => {
    expect(parseClinicDeliveryReadiness({ value: 'legacy-token' })).toEqual({ status: 'pending' });
    const enabled = withClinicDeliveryReadiness(
      { value: 'secret' },
      { status: 'enabled', checkedAt: '2026-08-24T00:00:00.000Z' },
    );
    expect(parseClinicDeliveryReadiness(enabled)).toEqual({
      status: 'enabled',
      checkedAt: '2026-08-24T00:00:00.000Z',
    });
    expect(enabled.value).toBe('secret');
  });

  it('retains SMTP readiness while preserving the stored password', async () => {
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
          host: 'smtp.clinic.test',
          port: 587,
          secure: false,
          user: 'clinic',
          password: '',
          from: 'clinic@example.test',
        },
        deliveryReadiness: { status: 'enabled', checkedAt: '2026-08-24T00:00:00.000Z' },
      },
      'actor',
      { organizationId },
    );

    await expect(
      service.getSetting('clinic_smtp_outbound', 'admin', { organizationId }),
    ).resolves.toMatchObject({
      valueJson: {
        value: { password: 'stored-secret' },
        deliveryReadiness: { status: 'enabled' },
      },
    });
  });
});
