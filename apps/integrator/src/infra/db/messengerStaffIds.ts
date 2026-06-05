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
  fetchPublicSystemSettingValueJson,
} from './publicSystemSettings.js';

export type { MessengerStaffChannel, ResolveMessengerStaffAdmin };

const CACHE_TTL_MS = 60_000;

type StaffIdLists = {
  adminIds: string[];
  doctorIds: string[];
};

type CacheEntry = {
  loadedAt: number;
  lists: StaffIdLists;
};

const listsCache = new Map<MessengerStaffChannel, CacheEntry>();

/** Keys that affect `createMessengerStaffIdsResolver` (admin + doctor messenger id lists). */
export const MESSENGER_STAFF_SETTINGS_KEYS = new Set([
  'admin_telegram_ids',
  'doctor_telegram_ids',
  'admin_max_ids',
  'doctor_max_ids',
]);

/** @deprecated Use {@link parseMessengerIdTokens} — re-export for existing tests. */
export function parseIdTokens(input: unknown): string[] {
  return parseMessengerIdTokens(input);
}

async function loadSettingInner(db: DbPort, key: string): Promise<unknown> {
  const valueJson = await fetchPublicSystemSettingValueJson(db, key);
  if (valueJson === null) return null;
  const inner = extractSystemSettingInnerValue(valueJson);
  return inner === undefined ? valueJson : inner;
}

async function loadStaffLists(db: DbPort, channel: MessengerStaffChannel): Promise<StaffIdLists> {
  const now = Date.now();
  const cached = listsCache.get(channel);
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.lists;
  }

  const adminKey = channel === 'telegram' ? 'admin_telegram_ids' : 'admin_max_ids';
  const doctorKey = channel === 'telegram' ? 'doctor_telegram_ids' : 'doctor_max_ids';

  const [adminInner, doctorInner] = await Promise.all([
    loadSettingInner(db, adminKey),
    loadSettingInner(db, doctorKey),
  ]);

  const lists: StaffIdLists = {
    adminIds: [...new Set(parseMessengerIdTokens(adminInner).map((x) => x.trim()).filter(Boolean))],
    doctorIds: [...new Set(parseMessengerIdTokens(doctorInner).map((x) => x.trim()).filter(Boolean))],
  };
  listsCache.set(channel, { loadedAt: now, lists });
  return lists;
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

/** Clears in-memory cache (tests and settings sync). */
export function clearMessengerStaffIdsCache(): void {
  listsCache.clear();
}

export function invalidateMessengerStaffIdsCacheForSettingKey(key: string): void {
  if (MESSENGER_STAFF_SETTINGS_KEYS.has(key)) {
    clearMessengerStaffIdsCache();
  }
}
