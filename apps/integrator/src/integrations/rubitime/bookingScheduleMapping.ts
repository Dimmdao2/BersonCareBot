/**
 * Маппинг доменного booking query (type/city/category) -> Rubitime schedule params.
 *
 * Конфигурируется через admin setting в `system_settings`,
 * с env fallback на миграционный период.
 * Формат элемента:
 * {
 *   "type": "in_person" | "online",
 *   "city": "moscow" | "spb" | ... (optional, required for in_person),
 *   "category": "rehab_lfk" | "nutrition" | "general",
 *   "branchId": 1,         // branch_id в Rubitime API
 *   "cooperatorId": 1,     // cooperator_id (специалист)
 *   "serviceId": 1,        // service_id (услуга)
 *   "durationMinutes": 60  // длительность слота для вычисления endAt
 * }
 *
 * Значение env должно быть JSON-массивом mapping entries.
 */
import { getRubitimeScheduleMappingRaw } from './runtimeConfig.js';

export type BookingScheduleParams = {
  branchId: number;
  cooperatorId: number;
  serviceId: number;
  durationMinutes: number;
};

type MappingEntry = {
  type: 'in_person' | 'online';
  city?: string;
  category: string;
  branchId: number;
  cooperatorId: number;
  serviceId: number;
  durationMinutes: number;
};

type BookingSlotsQueryInput = {
  type: 'in_person' | 'online';
  city?: string;
  category: string;
};

function isValidEntry(e: unknown): e is MappingEntry {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    (x.type === 'in_person' || x.type === 'online') &&
    typeof x.category === 'string' &&
    typeof x.branchId === 'number' &&
    Number.isFinite(x.branchId) &&
    typeof x.cooperatorId === 'number' &&
    Number.isFinite(x.cooperatorId) &&
    typeof x.serviceId === 'number' &&
    Number.isFinite(x.serviceId) &&
    typeof x.durationMinutes === 'number' &&
    Number.isFinite(x.durationMinutes) &&
    x.durationMinutes > 0
  );
}

function parseScheduleMapping(raw: string | undefined): MappingEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

let _cachedMapping: MappingEntry[] | null = null;

/** @internal for tests */
export function _resetScheduleMappingCache(): void {
  _cachedMapping = null;
}

async function getScheduleMapping(): Promise<MappingEntry[]> {
  if (_cachedMapping !== null) return _cachedMapping;
  _cachedMapping = parseScheduleMapping(await getRubitimeScheduleMappingRaw());
  return _cachedMapping;
}

/**
 * Преобразует доменный booking query в Rubitime schedule params.
 * Возвращает null, если маппинг не найден.
 */
export async function resolveScheduleParams(query: BookingSlotsQueryInput): Promise<BookingScheduleParams | null> {
  const entries = await getScheduleMapping();
  const match = entries.find((e) => {
    if (e.type !== query.type) return false;
    if (e.category !== query.category) return false;
    if (query.type === 'in_person') {
      if (!query.city) return false;
      if (e.city && e.city !== query.city) return false;
    }
    return true;
  });
  if (!match) return null;
  return {
    branchId: match.branchId,
    cooperatorId: match.cooperatorId,
    serviceId: match.serviceId,
    durationMinutes: match.durationMinutes,
  };
}
