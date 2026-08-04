import { z } from 'zod';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
} from '@/shared/lib/fio';

/** D29: shared `contactFio` shape for public booking (online + in-person) — ФИО only, Cyrillic-only. */
export const contactFioFieldSchema = z
  .object({
    lastName: z
      .string()
      .trim()
      .min(1)
      .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
    firstName: z
      .string()
      .trim()
      .min(1)
      .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
    patronymic: z
      .string()
      .trim()
      .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
      .optional(),
  })
  .optional();

export const inPersonKeysFields = {
  branchId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  cityCode: z.string().trim().min(1).optional(),
};

export const inPersonKeysRefine = <T extends { branchId?: string; serviceId?: string }>(v: T) =>
  Boolean(v.branchId) && Boolean(v.serviceId);

export const inPersonSlotsQuerySchema = z
  .object({
    type: z.literal('in_person'),
    orgSlug: z.string().trim().min(1).max(120).optional(),
    ...inPersonKeysFields,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    slotCount: z.coerce.number().int().min(1).max(8).optional(),
  })
  .refine(inPersonKeysRefine, { message: 'invalid_in_person_keys' });

export const inPersonCreateBodySchema = z
  .object({
    type: z.literal('in_person'),
    ...inPersonKeysFields,
    slotStart: z.string().min(1),
    slotEnd: z.string().min(1),
    slotCount: z.coerce.number().int().min(1).max(8).optional(),
    contactName: z.string().min(1),
    contactFio: contactFioFieldSchema,
    contactPhone: z.string().min(1),
    contactEmail: z.string().email().optional(),
    formAnswers: z.array(z.object({ fieldKey: z.string().min(1), value: z.string() })).optional(),
    patientPackageId: z.string().uuid().optional(),
  })
  .refine(inPersonKeysRefine, { message: 'invalid_in_person_keys' });
