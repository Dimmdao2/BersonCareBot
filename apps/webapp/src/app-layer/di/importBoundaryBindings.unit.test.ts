import { describe, expect, it } from 'vitest';
import {
  ensureAuthModulePortsBound,
  resetAuthModulePortsBindingForTests,
} from './bindAuthModulePorts';
import { ensureSystemSettingsConfigAdapterBound } from './bindSystemSettingsConfigAdapter';
import { requireSessionUserPort } from '@/modules/auth/sessionUserPort';
import { requireConfigAdapterPort } from '@/modules/system-settings/configAdapterPort';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';
import {
  readAdminSystemSettingString,
  readExactOrganizationAdminSystemSettingString,
  readPublicAuthChannelConfigured,
} from '@/infra/repos/pgSystemSettings';

describe('D19a composition-root bindings', () => {
  it('binds DB-backed auth and system-settings ports before their module callers', () => {
    resetAuthModulePortsBindingForTests();
    expect(() => requireSessionUserPort()).toThrow('SessionUserPort is not bound');

    ensureAuthModulePortsBound();
    ensureSystemSettingsConfigAdapterBound();

    expect(requireSessionUserPort()).toBe(pgUserByPhonePort);
    expect(requireConfigAdapterPort()).toMatchObject({
      readAdminSystemSettingString,
      readExactOrganizationAdminSystemSettingString,
      readPublicAuthChannelConfigured,
    });
  });
});
