/**
 * Resolves whether a messenger actor id is staff (admin/doctor lists from system_settings).
 * Env-admin is checked in webhook layer, not here.
 */
import type {
  DbPort,
  MessengerStaffChannel,
  ResolveMessengerStaffAdmin,
} from '../../kernel/contracts/index.js';
import { parseMessengerIdTokens } from './parseMessengerIdTokens.js';
import {
  extractSystemSettingInnerValue,
  fetchIntegratorRuntimeSettingValueJson,
  type IntegratorRuntimeSettingKey,
} from './publicSystemSettings.js';

export type { MessengerStaffChannel, ResolveMessengerStaffAdmin };

type StaffIdLists = {
  adminIds: string[];
  doctorIds: string[];
};

/** @deprecated Use {@link parseMessengerIdTokens} — re-export for existing tests. */
export function parseIdTokens(input: unknown): string[] {
  return parseMessengerIdTokens(input);
}

async function loadSettingInner(db: DbPort, key: IntegratorRuntimeSettingKey): Promise<unknown> {
  const valueJson = await fetchIntegratorRuntimeSettingValueJson(db, key);
  if (valueJson === null) return null;
  const inner = extractSystemSettingInnerValue(valueJson);
  return inner === undefined ? valueJson : inner;
}

async function loadStaffLists(db: DbPort, channel: MessengerStaffChannel): Promise<StaffIdLists> {
  const adminKey = channel === 'telegram' ? 'admin_telegram_ids' : 'admin_max_ids';
  const doctorKey = channel === 'telegram' ? 'doctor_telegram_ids' : 'doctor_max_ids';

  const [adminInner, doctorInner] = await Promise.all([
    loadSettingInner(db, adminKey),
    loadSettingInner(db, doctorKey),
  ]);

  return {
    adminIds: [
      ...new Set(
        parseMessengerIdTokens(adminInner)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
    doctorIds: [
      ...new Set(
        parseMessengerIdTokens(doctorInner)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
  };
}

function isActorInLists(actorId: string, lists: StaffIdLists): boolean {
  const id = actorId.trim();
  if (!id) return false;
  return lists.adminIds.includes(id) || lists.doctorIds.includes(id);
}

export function createMessengerStaffIdsResolver(db: DbPort): ResolveMessengerStaffAdmin {
  return async (channel, actorId) => {
    const lists = await loadStaffLists(db, channel);
    return isActorInLists(actorId, lists);
  };
}
