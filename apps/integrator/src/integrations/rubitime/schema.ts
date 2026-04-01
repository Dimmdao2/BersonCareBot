import { z } from 'zod';

/** Разрешенные типы Rubitime-событий о записи. */
const RubitimeEventSchema = z.enum([
  'event-create-record',
  'event-update-record',
  'event-remove-record',
  'event-delete-record',
]);

/** Схема body входящего Rubitime webhook. */
export const RubitimeWebhookBodySchema = z.object({
  from: z.string(),
  event: RubitimeEventSchema,
  data: z.record(z.string(), z.unknown()),
});

/** Валидированный тип Rubitime webhook body. */
export type RubitimeWebhookBodyValidated = z.infer<typeof RubitimeWebhookBodySchema>;

/**
 * Валидирует сырой Rubitime webhook body.
 * Возвращает discriminated-union с `success`.
 */
export function parseRubitimeBody(raw: unknown): {
  success: true;
  data: RubitimeWebhookBodyValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = RubitimeWebhookBodySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

const idLike = z.union([z.string().min(1), z.number().finite()]).transform((v) => String(v).trim());

/** v2: explicit Rubitime IDs from webapp catalog — no category/city resolve in integrator. */
export const RubitimeSlotsQueryV2Schema = z.object({
  version: z.literal('v2'),
  rubitimeBranchId: idLike,
  rubitimeCooperatorId: idLike,
  rubitimeServiceId: idLike,
  slotDurationMinutes: z.number().int().positive(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** @deprecated v1 — category (+ city for in_person) resolved via legacy booking profiles. */
export const RubitimeSlotsQueryV1Schema = z.object({
  type: z.enum(['in_person', 'online']),
  city: z.string().trim().optional(),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const RubitimeSlotsQuerySchema = z.union([RubitimeSlotsQueryV2Schema, RubitimeSlotsQueryV1Schema]);

export type RubitimeSlotsQueryValidated = z.infer<typeof RubitimeSlotsQuerySchema>;

const patientBlockSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.union([z.string().email(), z.literal('')]).optional(),
});

export const RubitimeCreateRecordV2Schema = z.object({
  version: z.literal('v2'),
  rubitimeBranchId: idLike,
  rubitimeCooperatorId: idLike,
  rubitimeServiceId: idLike,
  slotStart: z.string().min(1),
  patient: patientBlockSchema,
  localBookingId: z.string().uuid().optional(),
});

/** @deprecated v1 — flat contact fields + profile resolve. */
export const RubitimeCreateRecordV1Schema = z.object({
  type: z.enum(['in_person', 'online']),
  city: z.string().trim().optional(),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.union([z.string().email(), z.literal('')]).optional(),
});

export const RubitimeCreateRecordInputSchema = z.union([RubitimeCreateRecordV2Schema, RubitimeCreateRecordV1Schema]);

export type RubitimeCreateRecordInputValidated = z.infer<typeof RubitimeCreateRecordInputSchema>;

export function parseRubitimeCreateRecordInput(raw: unknown): {
  success: true;
  data: RubitimeCreateRecordInputValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = RubitimeCreateRecordInputSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/** Нормализованный слот для webapp API. */
export const RubitimeSlotSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
});

export type RubitimeSlot = z.infer<typeof RubitimeSlotSchema>;

/** Список слотов по дате для контракта GET /api/booking/slots. */
export const RubitimeSlotsByDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(RubitimeSlotSchema),
});

export type RubitimeSlotsByDate = z.infer<typeof RubitimeSlotsByDateSchema>;

export function parseRubitimeSlotsQuery(raw: unknown): {
  success: true;
  data: RubitimeSlotsQueryValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = RubitimeSlotsQuerySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

const BookingLifecyclePayloadSchema = z.object({
  bookingId: z.string().uuid(),
  userId: z.string().min(1),
  rubitimeId: z.string().nullable().optional(),
  bookingType: z.enum(['in_person', 'online']),
  city: z.string().nullable().optional(),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.union([z.string().email(), z.null()]).optional(),
  reason: z.string().optional(),
  branchServiceId: z.string().uuid().nullable().optional(),
  cityCodeSnapshot: z.string().nullable().optional(),
  serviceTitleSnapshot: z.string().nullable().optional(),
});

export const BookingLifecycleEventSchema = z.object({
  eventType: z.enum(['booking.created', 'booking.cancelled']),
  idempotencyKey: z.string().optional(),
  payload: BookingLifecyclePayloadSchema,
});

export type BookingLifecycleEventValidated = z.infer<typeof BookingLifecycleEventSchema>;
export type BookingLifecyclePayloadValidated = z.infer<typeof BookingLifecyclePayloadSchema>;

export function parseBookingLifecycleEvent(raw: unknown): {
  success: true;
  data: BookingLifecycleEventValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = BookingLifecycleEventSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
