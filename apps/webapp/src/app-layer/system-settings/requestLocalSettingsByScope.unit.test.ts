import { describe, expect, it } from 'vitest';
import { runWithDbPatientPrincipal, runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import {
  settingsByScopeMemoKey,
  wrapSystemSettingsServiceWithRequestLocalScopeReads,
} from '@/app-layer/system-settings/requestLocalSettingsByScope';
import type { SystemSetting, SystemSettingScope } from '@/modules/system-settings/types';

const ORG_A = 'a0000000-0000-4000-8000-0000000000a1';
const ORG_B = 'b0000000-0000-4000-8000-0000000000b2';
const USER_A = 'c0000000-0000-4000-8000-0000000000c3';
const USER_B = 'd0000000-0000-4000-8000-0000000000d4';

function serviceRecording(calls: string[]) {
  return {
    async listSettingsByScope(
      scope: SystemSettingScope,
      options?: { organizationId?: string | null },
    ): Promise<SystemSetting[]> {
      calls.push(`${scope}/${options?.organizationId ?? 'null'}`);
      return [];
    },
  };
}

/**
 * Что ловит: ключ памяти, переставший различать арендатора, область или принципала. Такой ключ
 * отдал бы список настроек одной клиники другой — страница выглядела бы исправной, а настройки
 * на ней были бы чужие. Длительность памяти принадлежит `react.cache` и равна одному серверному
 * запросу; здесь проверяется разделённость, за которую отвечает этот файл.
 */
describe('request-local settings-by-scope memo key', () => {
  it('separates organizations under one principal', async () => {
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      expect(settingsByScopeMemoKey('doctor', ORG_A)).not.toEqual(
        settingsByScopeMemoKey('doctor', ORG_B),
      );
    });
  });

  it('separates the platform-global list from a clinic list', async () => {
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      expect(settingsByScopeMemoKey('admin', null)).not.toEqual(
        settingsByScopeMemoKey('admin', ORG_A),
      );
    });
  });

  it('separates scopes', async () => {
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      expect(settingsByScopeMemoKey('doctor', ORG_A)).not.toEqual(
        settingsByScopeMemoKey('admin', ORG_A),
      );
    });
  });

  it('separates principals asking about the same scope and organization', async () => {
    const staffKey = await runWithDbStaffPrincipal(
      { organizationId: ORG_A, platformUserId: USER_A },
      async () => settingsByScopeMemoKey('doctor', ORG_A),
    );
    const otherStaffKey = await runWithDbStaffPrincipal(
      { organizationId: ORG_A, platformUserId: USER_B },
      async () => settingsByScopeMemoKey('doctor', ORG_A),
    );
    const patientKey = await runWithDbPatientPrincipal(
      { organizationId: ORG_A, platformUserId: USER_A },
      async () => settingsByScopeMemoKey('doctor', ORG_A),
    );
    expect(new Set([staffKey, otherStaffKey, patientKey]).size).toBe(3);
  });
});

describe('request-local settings-by-scope wrapper', () => {
  /**
   * Обёртка нормализует `organizationId` так же, как сам порт (`пусто → null`), иначе один и тот
   * же вопрос получил бы два разных ключа памяти — и разошёлся бы с тем, что реально спрашивают
   * у базы.
   */
  it('asks the service with the same normalized organization the port would use', async () => {
    const calls: string[] = [];
    const service = wrapSystemSettingsServiceWithRequestLocalScopeReads(serviceRecording(calls));
    await service.listSettingsByScope('admin');
    await service.listSettingsByScope('admin', { organizationId: null });
    await service.listSettingsByScope('admin', { organizationId: '   ' });
    await service.listSettingsByScope('doctor', { organizationId: ORG_A });
    expect(calls).toEqual(['admin/null', 'admin/null', 'admin/null', `doctor/${ORG_A}`]);
  });

  it('keeps asking the service and never answers from a previous request', async () => {
    const calls: string[] = [];
    const service = wrapSystemSettingsServiceWithRequestLocalScopeReads(serviceRecording(calls));
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      await service.listSettingsByScope('doctor', { organizationId: ORG_A });
    });
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      await service.listSettingsByScope('doctor', { organizationId: ORG_A });
    });
    expect(calls).toEqual([`doctor/${ORG_A}`, `doctor/${ORG_A}`]);
  });
});
