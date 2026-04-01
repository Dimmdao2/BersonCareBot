/**
 * Booking schedule resolver: доменный query (type/category/city) -> Rubitime params.
 *
 * Источник истины — таблица rubitime_booking_profiles в DB.
 * env-переменная RUBITIME_SCHEDULE_MAPPING больше не используется.
 *
 * Публичный интерфейс сохранён для совместимости с остальным кодом.
 */
import { createDbPort } from '../../infra/db/client.js';
import { resolveBookingProfile } from './db/bookingProfilesRepo.js';

export type BookingScheduleParams = {
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

/** @internal — kept for test compatibility; no-op in DB-backed mode. */
export function _resetScheduleMappingCache(): void {
  // no-op: no longer cache-based
}

/**
 * Преобразует доменный booking query в Rubitime schedule params через DB.
 * Возвращает null, если активный профиль не найден.
 */
export async function resolveScheduleParams(query: BookingSlotsQueryInput): Promise<BookingScheduleParams | null> {
  const db = createDbPort();
  const dbQuery: { type: 'in_person' | 'online'; category: string; city?: string } = {
    type: query.type,
    category: query.category,
  };
  if (query.city !== undefined) dbQuery.city = query.city;
  const profile = await resolveBookingProfile(db, dbQuery);
  if (!profile) return null;
  return {
    branchId: profile.rubitimeBranchId,
    cooperatorId: profile.rubitimeCooperatorId,
    serviceId: profile.rubitimeServiceId,
    durationMinutes: profile.durationMinutes,
  };
}
