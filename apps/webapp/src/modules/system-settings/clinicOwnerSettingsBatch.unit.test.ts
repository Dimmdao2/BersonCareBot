import { describe, expect, it, vi } from 'vitest';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import { createSystemSettingsService } from './service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SMS_KEY = 'sms_fallback_enabled';
const COMMENTS_KEY = 'doctor_patient_support_comments_without_support_default_enabled';
const MEDIA_KEY = 'doctor_patient_support_media_without_support_default_enabled';

describe('clinic-owner settings atomic batch', () => {
  it('uses one transactional port call and reads all cabinet booleans from the same organization', async () => {
    const port = createInMemorySystemSettingsPort();
    const batch = vi.spyOn(port, 'upsertManyInTransaction');
    const service = createSystemSettingsService(port);

    await service.persistSettingsBatch(
      [
        { key: SMS_KEY, scope: 'doctor', value: { value: true } },
        { key: COMMENTS_KEY, scope: 'doctor', value: { value: false } },
        { key: MEDIA_KEY, scope: 'doctor', value: { value: true } },
      ],
      'clinic-owner',
      { organizationId: ORGANIZATION_ID },
    );

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ key: SMS_KEY, organizationId: ORGANIZATION_ID }),
      expect.objectContaining({ key: COMMENTS_KEY, organizationId: ORGANIZATION_ID }),
      expect.objectContaining({ key: MEDIA_KEY, organizationId: ORGANIZATION_ID }),
    ]);
    await expect(
      service.getSetting(SMS_KEY, 'doctor', { organizationId: ORGANIZATION_ID }),
    ).resolves.toMatchObject({ valueJson: { value: true }, organizationId: ORGANIZATION_ID });
    await expect(
      service.getSetting(COMMENTS_KEY, 'doctor', { organizationId: ORGANIZATION_ID }),
    ).resolves.toMatchObject({ valueJson: { value: false }, organizationId: ORGANIZATION_ID });
    await expect(
      service.getSetting(MEDIA_KEY, 'doctor', { organizationId: ORGANIZATION_ID }),
    ).resolves.toMatchObject({ valueJson: { value: true }, organizationId: ORGANIZATION_ID });
    await expect(
      service.getSetting(COMMENTS_KEY, 'doctor', {
        organizationId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toBeNull();
  });
});
