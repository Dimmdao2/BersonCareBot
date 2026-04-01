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
 * External Rubitime API contract (webhook body, schedule response, etc.)
 * lives in schema.ts and client.ts in the same folder.
 */

// ---- Booking query (webapp -> integrator /slots and /create-record) ----

export type BookingQueryType = 'online' | 'in_person';
export type BookingCategoryCode = 'rehab_lfk' | 'nutrition' | 'general';

export type InternalSlotsQuery = {
  type: BookingQueryType;
  category: BookingCategoryCode;
  city?: string;
  date?: string; // YYYY-MM-DD, optional filter
};

export type InternalCreateRecordInput = {
  type: BookingQueryType;
  category: BookingCategoryCode;
  city?: string;
  slotStart: string; // ISO datetime
  slotEnd: string;   // ISO datetime
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
};

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
