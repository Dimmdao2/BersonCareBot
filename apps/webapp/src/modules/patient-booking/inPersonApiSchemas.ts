import { z } from "zod";

export const inPersonKeysFields = {
  branchServiceId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  cityCode: z.string().trim().min(1).optional(),
};

export const inPersonKeysRefine = <T extends { branchServiceId?: string; branchId?: string; serviceId?: string }>(
  v: T,
) => Boolean(v.branchServiceId) || (Boolean(v.branchId) && Boolean(v.serviceId));

export const inPersonSlotsQuerySchema = z
  .object({
    type: z.literal("in_person"),
    ...inPersonKeysFields,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    slotCount: z.coerce.number().int().min(1).max(8).optional(),
  })
  .refine(inPersonKeysRefine, { message: "invalid_in_person_keys" });

export const inPersonCreateBodySchema = z
  .object({
    type: z.literal("in_person"),
    ...inPersonKeysFields,
    slotStart: z.string().min(1),
    slotEnd: z.string().min(1),
    contactName: z.string().min(1),
    contactFio: z
      .object({
        lastName: z.string().trim().min(1),
        firstName: z.string().trim().min(1),
        patronymic: z.string().trim().optional(),
      })
      .optional(),
    contactPhone: z.string().min(1),
    contactEmail: z.string().email().optional(),
    formAnswers: z
      .array(z.object({ fieldKey: z.string().min(1), value: z.string() }))
      .optional(),
    patientPackageId: z.string().uuid().optional(),
    productPurchaseId: z.string().uuid().optional(),
  })
  .refine(inPersonKeysRefine, { message: "invalid_in_person_keys" });
