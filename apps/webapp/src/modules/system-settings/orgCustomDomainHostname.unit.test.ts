import { describe, expect, it } from 'vitest';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  normalizeOrgCustomDomainHostnamePatch,
  ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
} from './orgCustomDomainHostname';
import { isPerOrgSettingKey } from './orgScopedKeys';
import { ALLOWED_KEYS } from './registry';
import { createSystemSettingsService } from './service';

describe('normalizeOrgCustomDomainHostnamePatch', () => {
  it('accepts a plausible fqdn and lowercases it', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: 'Clinic.Example.COM' })).toEqual({
      ok: true,
      valueJson: { value: 'clinic.example.com' },
    });
  });

  it('accepts empty string to clear the hostname', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: '   ' })).toEqual({
      ok: true,
      valueJson: { value: '' },
    });
  });

  it('rejects values with a scheme or path', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: 'https://clinic.example.com' })).toEqual({
      ok: false,
      error: 'invalid_value',
    });
  });
});

/**
 * TPB-09, вторая половина требования: домен клиники и её интеграции — НЕ deploy config, а
 * org-scoped настройки БД. Имя и origin платформенной пациентской поверхности меняются окружением
 * (доказательство — `config/envDatabaseRuntime.unit.test.ts`); здесь доказывается обратное для
 * данных арендатора: значение принадлежит организации, окружением не задаётся, и одна организация
 * не видит настройку другой.
 */
describe('TPB-09: домен и интеграции клиники — org-scoped настройки БД', () => {
  const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('домен клиники принадлежит организации, а не деплою, и не течёт между организациями', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());
    expect(isPerOrgSettingKey(ORG_CUSTOM_DOMAIN_HOSTNAME_KEY)).toBe(true);

    // Значение из окружения: если бы домен читался деплой-конфигом, оно бы сюда дошло.
    const savedEnv = process.env.ORG_CUSTOM_DOMAIN_HOSTNAME;
    process.env.ORG_CUSTOM_DOMAIN_HOSTNAME = 'domain-from-deploy.example.test';
    try {
      await service.updateSetting(
        ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        'admin',
        normalizeOrgCustomDomainHostnamePatch({ value: 'clinic-a.example.test' }).ok
          ? { value: 'clinic-a.example.test' }
          : {},
        'admin-a',
        { organizationId: ORG_A },
      );

      const forA = await service.getSetting(ORG_CUSTOM_DOMAIN_HOSTNAME_KEY, 'admin', {
        organizationId: ORG_A,
      });
      expect(forA?.valueJson).toEqual({ value: 'clinic-a.example.test' });

      // Соседняя организация не видит домен первой и не получает значение из окружения.
      const forB = await service.getSetting(ORG_CUSTOM_DOMAIN_HOSTNAME_KEY, 'admin', {
        organizationId: ORG_B,
      });
      const seenByB = JSON.stringify(forB?.valueJson ?? null);
      expect(seenByB).not.toContain('clinic-a.example.test');
      expect(seenByB).not.toContain('domain-from-deploy.example.test');
    } finally {
      if (savedEnv === undefined) delete process.env.ORG_CUSTOM_DOMAIN_HOSTNAME;
      else process.env.ORG_CUSTOM_DOMAIN_HOSTNAME = savedEnv;
    }
  });

  it('интеграции клиники тоже per-org, и ни одна настройка не дублирует имя пациентской поверхности', async () => {
    // Каналы доставки клиники — настройки организации, не окружения (§1.1 плана).
    for (const key of [
      'clinic_smtp_outbound',
      'clinic_smsc_api_key',
      'clinic_max_bot_api_key',
      'patient_booking_url',
    ]) {
      expect(isPerOrgSettingKey(key)).toBe(true);
    }

    // Смена имени/origin платформенной пациентской поверхности не требует строки в БД: такой
    // настройки не существует ни в одном scope.
    const nameLike = ALLOWED_KEYS.filter((key) =>
      /patient_app_name|patient_surface_name|platform_name|app_origin|patient_app_origin/.test(key),
    );
    expect(nameLike).toEqual([]);
  });
});
