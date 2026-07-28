/**
 * A-3 — anonymous booking must prove control of the contact BEFORE the booking exists.
 *
 * Owner ruling (`docs/_TODO/NIGHT_PLAN_2026-07-26.md` A-3): «всегда просить код или вход».
 *
 * Root cause this closes (Sudhodanan & Paverd, *Pre-hijacked Accounts*, USENIX Security '22): a
 * service that lets an unauthenticated request USE an identifier it has not proved control of
 * merges the attacker's action into the victim's account. Their rule for the merge case is that the
 * service must ensure the user currently controls the identifier. Shipped systems that do exactly
 * this at booking time: Zocdoc (phone verified before a booking can be made), Doctolib (SMS/voice
 * code plus e-mail confirmation).
 *
 * This module holds the two things that must not be duplicated anywhere else:
 *   1. the shape of the booking payload that is pinned server-side while the code is outstanding;
 *   2. the rule mapping "which channel delivered the code" → "which contact was proved".
 */
import { z } from 'zod';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';

/** Bumped whenever the pinned shape changes; an intent of an unknown version is discarded. */
export const PUBLIC_BOOKING_INTENT_VERSION = 1;

const formAnswerSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string(),
});

/**
 * Everything the confirm step needs to build the booking, validated and tenant-resolved at start.
 * The confirm request body carries ONLY `challengeId` + `code`; nothing here is re-read from it,
 * so a caller cannot swap the clinic, the slot or the phone between the two steps.
 */
export const publicBookingIntentSchema = z.object({
  v: z.literal(PUBLIC_BOOKING_INTENT_VERSION),
  organizationId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  slotCount: z.number().int().min(1).max(8).optional(),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().optional(),
  formAnswers: z.array(formAnswerSchema).optional(),
  attribution: z.record(z.string(), z.unknown()).optional(),
});

export type PublicBookingIntent = z.infer<typeof publicBookingIntentSchema>;

/** Parses an intent read back out of the challenge store. Anything unexpected is "no intent". */
export function parsePublicBookingIntent(raw: unknown): PublicBookingIntent | null {
  const parsed = publicBookingIntentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Does a code delivered over `channel` prove control of the PHONE NUMBER the caller typed?
 *
 * Only SMS does. A code delivered to an e-mail proves control of the e-mail; a code delivered to a
 * Telegram/MAX chat proves control of that chat. Under #1005 (delivery-channel fallback) a phone
 * entered may legitimately be verified by an e-mail code — and the owner's own note on that item is
 * that this "must never stamp phone trust". Keeping the answer here, in one function, is what makes
 * that survive the fallback landing later: the fallback picks a channel, this decides what it buys.
 *
 * NIST SP 800-63B treats an out-of-band authenticator as proving possession of the specific
 * endpoint the secret was sent to — not of some other endpoint believed to belong to the same
 * person.
 */
export function channelProvesPhoneControl(
  channel: PhoneChallengePayload['deliveryChannel'],
): boolean {
  return channel === 'sms';
}
