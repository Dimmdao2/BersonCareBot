import { z } from 'zod';
import type { HumanMergeDecision } from '@bersoncare/platform-merge';
import { FIO_LATIN_REJECTED_MESSAGE, isCyrillicFioInput } from '@/shared/lib/fio';

const fioSelectionSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('target') }).strict(),
  z.object({ source: z.literal('duplicate') }).strict(),
  z
    .object({
      source: z.literal('custom'),
      value: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .refine(isCyrillicFioInput, FIO_LATIN_REJECTED_MESSAGE),
    })
    .strict(),
]);

const accountSummarySchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    patronymic: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

const fioFieldSchema = z.enum(['last_name', 'first_name', 'patronymic']);

export const humanMergeDecisionSchema: z.ZodType<HumanMergeDecision> = z
  .object({
    accountConfirmed: z.literal(true),
    prompt: z
      .object({
        target: accountSummarySchema,
        duplicate: accountSummarySchema,
        foundAccountId: z.string().uuid(),
        conflicts: z.array(fioFieldSchema).max(3),
      })
      .strict(),
    fio: z
      .object({
        last_name: fioSelectionSchema.optional(),
        first_name: fioSelectionSchema.optional(),
        patronymic: fioSelectionSchema.optional(),
      })
      .strict(),
  })
  .strict();
