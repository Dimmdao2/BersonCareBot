/**
 * Resolves whether a messenger actor id is staff (admin/doctor lists from system_settings).
 * Env-admin is checked in webhook layer, not here.
 */
import type {
  DbPort,
  MessengerStaffChannel,
  ResolveMessengerStaffAdmin,
} from '../../kernel/contracts/index.js';

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

/** Exported for unit tests. */
export function parseIdTokens(input: unknown): string[] {
  const fromArray = (items: unknown[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const token = String(item).trim();
      if (!token) continue;
      if (!out.includes(token)) out.push(token);
    }
    return out;
  };

  if (Array.isArray(input)) {
    return fromArray(input);
  }

  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return fromArray(parsed);
    }
    if (typeof parsed === 'string') {
      return parseIdTokens(parsed);
    }
  } catch {
    // free-form
  }

  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

async function loadSettingInner(db: DbPort, key: string): Promise<unknown> {
  const r = await db.query<{ value_json: unknown }>(
    `SELECT value_json FROM public.system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
    [key],
  );
  const row = r.rows[0];
  if (!row) return null;
  const v = row.value_json;
  if (v !== null && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
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
    adminIds: [...new Set(parseIdTokens(adminInner).map((x) => x.trim()).filter(Boolean))],
    doctorIds: [...new Set(parseIdTokens(doctorInner).map((x) => x.trim()).filter(Boolean))],
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
