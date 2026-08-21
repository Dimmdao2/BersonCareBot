import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import { mutateCanonicalUserContactsWebapp } from '@/infra/repos/userContactsSql';
import type { DevBypassPlatformUserPhonePort } from '@/modules/auth/devBypassPlatformUserPhonePort';

export async function applyDevBypassClientPhoneInDb(userId: string, phone: string): Promise<void> {
  await mutateCanonicalUserContactsWebapp(getWebappSqlDb(), userId, [{
    action: 'upsert', kind: 'phone', valueNormalized: phone, isPrimary: true,
    confirmedAt: new Date().toISOString(), sourceOrigin: 'direct',
  }]);
}

export async function applyDevBypassStaffPhoneInDb(userId: string, phone: string): Promise<void> {
  await mutateCanonicalUserContactsWebapp(getWebappSqlDb(), userId, [{
    action: 'upsert', kind: 'phone', valueNormalized: phone, isPrimary: true,
    confirmedAt: null, sourceOrigin: 'direct',
  }]);
}

export const pgDevBypassPlatformUserPhonePort: DevBypassPlatformUserPhonePort = {
  applyClientPhone: applyDevBypassClientPhoneInDb,
  applyStaffPhone: applyDevBypassStaffPhoneInDb,
};
