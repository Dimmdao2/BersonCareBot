import { describe, expect, it, vi } from 'vitest';

import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import { createSystemSettingsService } from './service';
import { allowsPlatformGlobalFallbackWrite, isPerOrgSettingKey } from './orgScopedKeys';

describe('platform-owned fallback rows for per-organization settings', () => {
  it('keeps both keys per-org while allowing their explicit platform fallback rows', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    expect(isPerOrgSettingKey('patient_booking_url')).toBe(true);
    expect(isPerOrgSettingKey('notifications_topics')).toBe(true);
    expect(allowsPlatformGlobalFallbackWrite('patient_booking_url')).toBe(true);
    expect(allowsPlatformGlobalFallbackWrite('notifications_topics')).toBe(true);

    await service.updateSetting(
      'patient_booking_url',
      'admin',
      { value: 'https://booking.example.test' },
      'platform-actor',
      { allowPlatformGlobalFallbackWrite: true },
    );
    await service.updateSetting(
      'notifications_topics',
      'admin',
      { value: [{ id: 'test', title: 'Тест тема' }] },
      'platform-actor',
      { allowPlatformGlobalFallbackWrite: true },
    );

    await expect(service.getSetting('patient_booking_url', 'admin')).resolves.toMatchObject({
      organizationId: null,
      valueJson: { value: 'https://booking.example.test' },
    });
    await expect(service.getSetting('notifications_topics', 'admin')).resolves.toMatchObject({
      organizationId: null,
      valueJson: { value: [{ id: 'test', title: 'Тест тема' }] },
    });
  });

  it('fails closed without the platform option and for every unlisted per-org key', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    await expect(
      service.updateSetting(
        'patient_booking_url',
        'admin',
        { value: 'https://booking.example.test' },
        'actor',
      ),
    ).rejects.toThrow('organization_context_required');
    await expect(
      service.updateSetting('patient_home_mood_icons', 'admin', { value: [] }, 'platform-actor', {
        allowPlatformGlobalFallbackWrite: true,
      }),
    ).rejects.toThrow('organization_context_required');
    await expect(
      service.updateSetting(
        'notif_template:created:patient',
        'admin',
        { value: 'template' },
        'platform-actor',
        { allowPlatformGlobalFallbackWrite: true },
      ),
    ).rejects.toThrow('organization_context_required');
  });

  it('preflights every batch row before opening the atomic port write', async () => {
    const port = createInMemorySystemSettingsPort();
    const upsertManyInTransaction = vi.spyOn(port, 'upsertManyInTransaction');
    const service = createSystemSettingsService(port);

    await expect(
      service.persistAdminModesBatch(
        [
          { key: 'patient_booking_url', valueJson: { value: 'https://booking.example.test' } },
          // Deliberately exercise the service boundary with a registry-valid but non-Modes per-org
          // key. The HTTP schema rejects it even earlier; the service must still fail before write.
          { key: 'patient_home_mood_icons', valueJson: { value: [] } },
        ] as never,
        'platform-actor',
        { allowPlatformGlobalFallbackWrite: true },
      ),
    ).rejects.toThrow('organization_context_required');
    expect(upsertManyInTransaction).not.toHaveBeenCalled();
  });

  it('commits the valid modes batch once with the fallback row and global rows together', async () => {
    const port = createInMemorySystemSettingsPort();
    const upsertManyInTransaction = vi.spyOn(port, 'upsertManyInTransaction');
    const service = createSystemSettingsService(port);

    await service.persistAdminModesBatch(
      [
        { key: 'patient_booking_url', valueJson: { value: 'https://booking.example.test' } },
        { key: 'material_ratings_enabled', valueJson: { value: false } },
      ],
      'platform-actor',
      { allowPlatformGlobalFallbackWrite: true },
    );

    expect(upsertManyInTransaction).toHaveBeenCalledOnce();
    expect(upsertManyInTransaction).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'patient_booking_url', organizationId: null }),
      expect.objectContaining({ key: 'material_ratings_enabled', organizationId: null }),
    ]);
  });
});

describe('error-tracking settings transaction', () => {
  it('writes enabled and DSN together and keeps the stored DSN out of summary concerns', async () => {
    const port = createInMemorySystemSettingsPort();
    const upsertManyInTransaction = vi.spyOn(port, 'upsertManyInTransaction');
    const service = createSystemSettingsService(port);
    const dsn = 'https://public-key@errors.example.test/42';

    await service.persistErrorTrackingConfig(
      { enabled: true, dsn },
      '00000000-0000-4000-8000-000000000017',
    );

    expect(upsertManyInTransaction).toHaveBeenCalledOnce();
    expect(upsertManyInTransaction).toHaveBeenCalledWith([
      expect.objectContaining({
        key: 'error_tracking_enabled',
        organizationId: null,
        valueJson: { value: true },
      }),
      expect.objectContaining({
        key: 'error_tracking_dsn',
        organizationId: null,
        valueJson: { value: dsn },
      }),
    ]);
    await expect(service.getSetting('error_tracking_dsn', 'admin')).resolves.toMatchObject({
      organizationId: null,
      valueJson: { value: dsn },
    });
  });
});
