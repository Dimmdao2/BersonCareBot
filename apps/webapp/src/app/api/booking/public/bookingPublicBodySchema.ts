import { z } from "zod";
import { bookingAttributionBodySchema } from "./bookingAttributionBodySchema";

const formAnswerSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string(),
});

const contactFields = {
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
  formAnswers: z.array(formAnswerSchema).optional(),
  attribution: bookingAttributionBodySchema.optional(),
};

export const publicBookingCreateBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("online"),
    category: z.enum(["rehab_lfk", "nutrition", "general"]),
    slotStart: z.string().min(1),
    slotEnd: z.string().min(1),
    ...contactFields,
  }),
  z.object({
    type: z.literal("in_person"),
    branchServiceId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    cityCode: z.string().trim().min(1).optional(),
    slotStart: z.string().min(1),
    slotEnd: z.string().min(1),
    ...contactFields,
  }).refine(
    (v) => Boolean(v.branchServiceId) || (Boolean(v.branchId) && Boolean(v.serviceId)),
    { message: "invalid_in_person_keys" },
  ),
]);
