import { z } from 'zod';

const BookingLifecyclePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  bookingId: z.string().uuid(),
  userId: z.string().min(1),
  bookingType: z.enum(['in_person', 'online']),
  city: z.string().nullable().optional(),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.union([z.string().email(), z.null()]).optional(),
  reason: z.string().optional(),
  cityCodeSnapshot: z.string().nullable().optional(),
  serviceTitleSnapshot: z.string().nullable().optional(),
  canonicalAppointmentId: z.string().uuid().optional(),
  /** Только для booking.created/rescheduled/payment_captured — вебапп решает офсеты и включённость; событиям отмены/неявки план не нужен. */
  reminderPlan: z
    .object({
      enabled: z.boolean(),
      offsetsMinutes: z.array(z.number().int().positive()),
    })
    .optional(),
  /** R21: врач снял «Уведомлять пациента» - не слать пациентские каналы/web-push. */
  suppressPatientNotification: z.boolean().optional(),
  /** D14(1): вебапп решает, отменять ли ожидающие напоминания на этом событии. Отсутствует → прежнее поведение (отменять всегда). */
  cancelPendingReminders: z.boolean().optional(),
  /** D14(2): вебапп решает, слать ли пуш пациенту и каким вариантом. null — не слать; строка — слать этот вариант; отсутствует → прежнее поведение. */
  patientPushVariant: z.enum(['created', 'cancelled', 'rescheduled']).nullable().optional(),
  /** D14(3): вебапп присылает готовый текст пациентского сообщения; интегратор доставляет его дословно, не сочиняя и не дополняя. Отсутствует → прежний текст интегратора. */
  patientMessageText: z.string().optional(),
  /** D14(4): вебапп решает, уведомлять ли врача. Явный `false` — не уведомлять вовсе. Отсутствует → прежнее поведение (уведомлять всегда для событий, где это было). */
  doctorNotify: z.boolean().optional(),
  /** D14(4): дословный текст врачебного уведомления; интегратор доставляет его без изменений. Отсутствует → прежний текст интегратора. */
  doctorMessageText: z.string().optional(),
  /** D14(5): вебапп решает действие внешнего календаря. Отсутствует → прежнее вычисление по типу события. */
  calendarAction: z.enum(['created', 'updated', 'canceled']).optional(),
  /** D14(5): вебапп решает пометку в заголовке события календаря. Отсутствует → прежнее вычисление по типу события. */
  calendarTitleMarker: z.enum(['none', 'cancelled', 'reschedule_pending']).optional(),
});

export const BookingLifecycleEventSchema = z.object({
  eventType: z.enum([
    'booking.created',
    'booking.cancelled',
    'booking.rescheduled',
    'booking.reschedule_requested',
    'booking.deleted',
    'booking.payment_captured',
    'booking.package_linked',
    'booking.package_unlinked',
    'booking.reminder_updated',
  ]),
  idempotencyKey: z.string().optional(),
  payload: BookingLifecyclePayloadSchema,
});

export type BookingLifecycleEventValidated = z.infer<typeof BookingLifecycleEventSchema>;
export type BookingLifecyclePayloadValidated = z.infer<typeof BookingLifecyclePayloadSchema>;

export function parseBookingLifecycleEvent(raw: unknown):
  | {
      success: true;
      data: BookingLifecycleEventValidated;
    }
  | {
      success: false;
      error: z.ZodError;
    } {
  const result = BookingLifecycleEventSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
