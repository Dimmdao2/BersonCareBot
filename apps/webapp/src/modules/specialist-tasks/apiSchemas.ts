import { z } from "zod";

const isoDateTime = z.union([
  z.string().datetime({ offset: true }),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
]);

export const specialistTaskBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(8000).nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
  remindAt: isoDateTime.nullable().optional(),
  isImportant: z.boolean().optional(),
  patientUserId: z.string().uuid().nullable().optional(),
});

export const specialistTaskPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(8000).nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
  remindAt: isoDateTime.nullable().optional(),
  isImportant: z.boolean().optional(),
});
