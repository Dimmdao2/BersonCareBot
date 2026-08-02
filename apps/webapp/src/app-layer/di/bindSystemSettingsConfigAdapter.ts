import { bindConfigAdapterPort } from '@/modules/system-settings/configAdapterPort';
import {
  readAdminSystemSettingString,
  readExactOrganizationAdminSystemSettingString,
  readPublicAuthChannelConfigured,
} from '@/infra/repos/pgSystemSettings';
import { createPgAppRuntimeSettingsPort } from '@/infra/repos/pgAppRuntimeSettings';

let bound = false;

/** Wire the DB-backed system-settings adapter from the composition root. Idempotent. */
export function ensureSystemSettingsConfigAdapterBound(): void {
  if (bound) return;
  bindConfigAdapterPort({
    runtimeSettings: createPgAppRuntimeSettingsPort(),
    readAdminSystemSettingString,
    readExactOrganizationAdminSystemSettingString,
    readPublicAuthChannelConfigured,
  });
  bound = true;
}
