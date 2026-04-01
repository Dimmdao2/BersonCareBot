/**
 * Internal M2M contract: webapp <-> integrator (Rubitime booking endpoints).
 *
 * This file is the authoritative source of types and error codes for the
 * signed M2M API that webapp calls on integrator:
 *
 *   POST /api/bersoncare/rubitime/slots
 *   POST /api/bersoncare/rubitime/create-record
 *   POST /api/bersoncare/rubitime/remove-record
 *   POST /api/bersoncare/rubitime/booking-event
 *
 * Webapp mirrors these types in:
 *   apps/webapp/src/modules/integrator/bookingM2mApi.ts
 *
 * Human-readable v2 contract (in-person, explicit IDs, no category/city in body):
 *   `API_CONTRACT_V2.md` in the booking rework city-service docs folder.
 *
 * External Rubitime API contract (webhook body, schedule response, etc.)
 * lives in schema.ts and client.ts in the same folder.
 */

// ---- Booking query (webapp -> integrator /slots and /create-record) ----

export type BookingQueryType = 'online' | 'in_person';
export type BookingCategoryCode = 'rehab_lfk' | 'nutrition' | 'general';

/**
 * @deprecated Legacy v1 — `category` (+ optional `city` for in_person) resolved via
 * `rubitime_booking_profiles` / `resolveScheduleParams`. Prefer {@link InternalSlotsQueryV2}.
 */
export type InternalSlotsQueryV1 = {
  type: BookingQueryType;
  category: BookingCategoryCode;
  /** @deprecated Legacy — in-person v2 uses explicit Rubitime IDs from webapp instead. */
  city?: string;
  date?: string; // YYYY-MM-DD, optional filter
};

/**
 * In-person (and future) v2: webapp supplies Rubitime IDs from booking catalog; integrator does not resolve category/city.
 */
export type InternalSlotsQueryV2 = {
  version: 'v2';
  rubitimeBranchId: string;
  rubitimeCooperatorId: string;
  rubitimeServiceId: string;
  /** Duration for expanding Rubitime `times[]` into slot end times. */
  slotDurationMinutes: number;
  /** Single-day filter (same semantics as v1 `date`). */
  dateFrom?: string;
  dateTo?: string;
};

export type InternalSlotsQuery = InternalSlotsQueryV1 | InternalSlotsQueryV2;

/**
 * @deprecated Legacy v1 — resolved via DB booking profiles.
 */
export type InternalCreateRecordInputV1 = {
  type: BookingQueryType;
  category: BookingCategoryCode;
  /** @deprecated Legacy — in-person v2 uses explicit IDs. */
  city?: string;
  slotStart: string; // ISO datetime
  slotEnd: string;   // ISO datetime
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
};

/** v2 create: explicit Rubitime IDs; contact block matches webapp `bookingM2mApi` body. */
export type InternalCreateRecordInputV2 = {
  version: 'v2';
  rubitimeBranchId: string;
  rubitimeCooperatorId: string;
  rubitimeServiceId: string;
  slotStart: string;
  patient: { name: string; phone: string; email?: string };
  localBookingId?: string;
};

export type InternalCreateRecordInput = InternalCreateRecordInputV1 | InternalCreateRecordInputV2;

// ---- Slots response (integrator -> webapp) ----

export type InternalSlot = {
  startAt: string; // ISO datetime (wall-clock, no tz offset)
  endAt: string;
};

export type InternalSlotsByDate = {
  date: string; // YYYY-MM-DD
  slots: InternalSlot[];
};

// ---- Resolved Rubitime schedule params (internal, integrator only) ----

export type ResolvedScheduleParams = {
  branchId: number;
  cooperatorId: number;
  serviceId: number;
  durationMinutes: number;
};

// ---- Error codes returned by integrator to webapp ----

/**
 * No active booking profile found in DB for the given type/category/city.
 * Admin needs to configure rubitime_booking_profiles.
 */
export const ERR_SLOTS_MAPPING_NOT_CONFIGURED = 'slots_mapping_not_configured';

/**
 * v1 legacy resolve was disabled via env toggle (see integrator `legacyResolveFlag.ts`, cutover).
 */
export const ERR_LEGACY_RESOLVE_DISABLED = 'legacy_resolve_disabled';

/**
 * Rubitime API returned a response that cannot be parsed as a schedule.
 */
export const ERR_RUBITIME_SCHEDULE_MALFORMED = 'rubitime_schedule_malformed';

/**
 * Rubitime API create-record call failed.
 */
export const ERR_RUBITIME_CREATE_FAILED = 'rubitime_create_failed';

/**
 * Integrator is not configured (shared secret missing).
 */
export const ERR_SERVICE_UNCONFIGURED = 'service_unconfigured';
