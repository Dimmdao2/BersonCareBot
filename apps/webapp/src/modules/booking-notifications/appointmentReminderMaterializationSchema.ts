import { z } from 'zod';

export const appointmentReminderMaterializationBodySchema = z.object({
  organizationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  bookingId: z.string().min(1).max(240),
  platformUserId: z.string().uuid().optional(),
  phoneNormalized: z.string().min(8).max(32).optional(),
  slotStartIso: z.string().datetime({ offset: true }),
  patientName: z.string().max(500).nullable().optional(),
  cancelPending: z.boolean().default(false),
  reminderPlan: z.object({
    enabled: z.boolean(),
    offsetsMinutes: z.array(z.number().int().positive()).max(20),
  }),
});

export type AppointmentReminderMaterializationBody = z.infer<
  typeof appointmentReminderMaterializationBodySchema
>;
