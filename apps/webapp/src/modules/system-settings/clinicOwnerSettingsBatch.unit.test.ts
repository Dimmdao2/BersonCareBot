import { describe, expect, it, vi } from 'vitest';
import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  defaultDoctorWorkspaceClientDefaults,
  defaultDoctorWorkspaceComposition,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
} from './doctorWorkspaceComposition';
import { SystemSettingsOrgContextRequiredError } from './orgScopedKeys';
import { APPOINTMENT_LABEL_KEY } from './patientTerms';
import type { SystemSettingKey, SystemSettingScope } from './registry';
import { createSystemSettingsService } from './service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SMS_KEY = 'sms_fallback_enabled';
const COMMENTS_KEY = 'doctor_patient_support_comments_without_support_default_enabled';
const MEDIA_KEY = 'doctor_patient_support_media_without_support_default_enabled';
const SUPPORT_GROUP_LABEL_KEY = 'support_group_label';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

const WORKSPACE_ROWS = [
  {
    key: DOCTOR_WORKSPACE_COMPOSITION_KEY,
    scope: 'doctor' as const,
    value: { value: defaultDoctorWorkspaceComposition() },
  },
  {
    key: DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
    scope: 'doctor' as const,
    value: { value: defaultDoctorWorkspaceClientDefaults() },
  },
  { key: 'patient_label' as const, scope: 'doctor' as const, value: { value: 'клиент' } },
  {
    key: SUPPORT_GROUP_LABEL_KEY,
    scope: 'doctor' as const,
    value: { value: 'favorites' },
  },
] satisfies Array<{
  key: SystemSettingKey;
  scope: SystemSettingScope;
  value: unknown;
}>;

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

  it('atomically saves and reloads all workspace groups without crossing organizations', async () => {
    const port = createInMemorySystemSettingsPort();
    const batch = vi.spyOn(port, 'upsertManyInTransaction');
    const service = createSystemSettingsService(port);

    await service.persistSettingsBatch(WORKSPACE_ROWS, 'clinic-owner', {
      organizationId: ORGANIZATION_ID,
    });

    expect(batch).toHaveBeenCalledOnce();
    for (const row of WORKSPACE_ROWS) {
      await expect(
        service.getSetting(row.key, row.scope, { organizationId: ORGANIZATION_ID }),
      ).resolves.toMatchObject({
        organizationId: ORGANIZATION_ID,
        valueJson: row.value,
      });
      await expect(
        service.getSetting(row.key, row.scope, { organizationId: OTHER_ORGANIZATION_ID }),
      ).resolves.toBeNull();
    }
  });

  it('keeps the prior workspace set intact when the atomic repository write fails', async () => {
    const port = createInMemorySystemSettingsPort();
    const service = createSystemSettingsService(port);
    await service.persistSettingsBatch(WORKSPACE_ROWS, 'clinic-owner', {
      organizationId: ORGANIZATION_ID,
    });
    const previous = await Promise.all(
      WORKSPACE_ROWS.map((row) =>
        service.getSetting(row.key, row.scope, { organizationId: ORGANIZATION_ID }),
      ),
    );
    vi.spyOn(port, 'upsertManyInTransaction').mockRejectedValueOnce(
      new Error('injected_mid_batch_repository_failure'),
    );
    const originalUpsert = port.upsert.bind(port);
    let individualWriteCount = 0;
    vi.spyOn(port, 'upsert').mockImplementation(async (...args) => {
      individualWriteCount += 1;
      if (individualWriteCount === 2) throw new Error('injected_mid_batch_repository_failure');
      return originalUpsert(...args);
    });

    await expect(
      service.persistSettingsBatch(
        WORKSPACE_ROWS.map((row) => ({
          ...row,
          value: row.key === 'patient_label' ? { value: 'пациент' } : row.value,
        })),
        'clinic-owner',
        { organizationId: ORGANIZATION_ID },
      ),
    ).rejects.toThrow('injected_mid_batch_repository_failure');
    await expect(
      Promise.all(
        WORKSPACE_ROWS.map((row) =>
          service.getSetting(row.key, row.scope, { organizationId: ORGANIZATION_ID }),
        ),
      ),
    ).resolves.toEqual(previous);
  });

  it('requires organization context when reading the workspace composition', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    await expect(service.getDoctorWorkspaceComposition()).rejects.toBeInstanceOf(
      SystemSettingsOrgContextRequiredError,
    );
  });

  /**
   * Отказ, который этот тест ловит: клиника сохраняет слово о событии записи вне набора владельца
   * (12.09.2026 он назвал ровно четыре и дословно отклонил «встречу», а «занятие» закрепил за
   * самостоятельной практикой), общая дверь записи его принимает — и оба кабинета начинают
   * произносить это слово во всех надписях, пока кто-нибудь не пожалуется.
   *
   * Oracle здесь — решение владельца, а не наша же таблица форм: набор задан им поимённо.
   */
  it('refuses an appointment word outside the four the owner named', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    for (const rejected of ['встреча', 'занятие', '']) {
      await expect(
        service.updateSetting(
          APPOINTMENT_LABEL_KEY,
          'doctor',
          { value: rejected },
          'clinic-owner',
          { organizationId: ORGANIZATION_ID },
        ),
      ).rejects.toThrow(`invalid_setting_value: ${APPOINTMENT_LABEL_KEY}`);
    }

    await service.updateSetting(APPOINTMENT_LABEL_KEY, 'doctor', { value: 'Тренировка ' },
      'clinic-owner', { organizationId: ORGANIZATION_ID });
    await expect(
      service.getSetting(APPOINTMENT_LABEL_KEY, 'doctor', { organizationId: ORGANIZATION_ID }),
    ).resolves.toMatchObject({ valueJson: { value: 'тренировка' } });
  });
});
