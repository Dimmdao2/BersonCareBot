import { z } from "zod";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type { PhoneMessengerBindSecretRow } from "@/modules/auth/phoneMessengerBind.ports";
import type { MessengerIdentityResolutionHints } from "@/modules/auth/identityResolutionPort";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { ChannelBindings } from "@/shared/types/session";
import type { UserRole } from "@/shared/types/session";

const userRoleSchema = z.enum(["client", "doctor", "admin"]);

export const identityChannelCodeSchema = z.enum(["telegram", "max", "vk"]);

export const userByPhoneChannelKindSchema = z.enum(["telegram", "vk", "max", "web"]);

export const messengerBindChannelSchema = z.enum(["telegram", "max"]);

export const messengerBindPurposeSchema = z.enum(["login", "profile_bind"]);

export const messengerBindStatusSchema = z.enum([
  "pending_contact",
  "otp_ready",
  "failed",
  "consumed",
  "expired",
]);

export const messengerIdentityResolutionHintsSchema = z.object({
  platformUserSub: z.string().trim().min(1).optional(),
  phoneNormalized: z.string().trim().min(1).optional(),
  integratorUserId: z.string().trim().min(1).optional(),
});

export const channelBindingLookupParamsSchema = z.object({
  channelCode: identityChannelCodeSchema,
  externalId: z.string().trim().min(1),
});

export const findOrCreateByChannelBindingParamsSchema = channelBindingLookupParamsSchema.extend({
  displayName: z.string().optional(),
  role: userRoleSchema.optional(),
  resolutionHints: messengerIdentityResolutionHintsSchema.optional(),
});

export const channelContextSchema = z.object({
  channel: userByPhoneChannelKindSchema,
  chatId: z.string().trim().min(1),
  displayName: z.string().optional(),
});

export const channelBindingRowSchema = z.object({
  channel_code: identityChannelCodeSchema.or(z.literal("vk")),
  external_id: z.string(),
});

export const platformUserSessionRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  first_name: z.string().nullable().optional(),
  role: z.string(),
  phone_normalized: z.string().nullable(),
});

export const platformUserProfileRowSchema = z.object({
  display_name: z.string().nullable(),
  role: z.string(),
  phone_normalized: z.string().nullable(),
});

export const phoneOnlyRowSchema = z.object({
  phone_normalized: z.string().nullable(),
});

export const emailVerifiedRowSchema = z.object({
  email: z.string().nullable(),
});

export const puMergeRowSchema = z.object({
  id: z.string(),
  phone_normalized: z.string().nullable(),
  integrator_user_id: z.string().nullable(),
  merged_into_id: z.string().nullable(),
  display_name: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.coerce.date(),
});

export const userIdRowSchema = z.object({
  user_id: z.string(),
});

export const platformUserIdRowSchema = z.object({
  id: z.string(),
});

export const platformUserPhoneRoleRowSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  role: z.string(),
});

export const platformUserInsertRowSchema = z.object({
  id: z.string(),
  display_name: z.string(),
});

export const bindingOwnerRowSchema = z.object({
  user_id: z.string(),
  integrator_user_id: z.string().nullable(),
});

export const auditLogRepeatRowSchema = z.object({
  id: z.string(),
  repeat_count: z.coerce.number(),
});

const phoneMessengerBindSecretRowSchema = z.object({
  id: z.string(),
  phone_normalized: z.string(),
  channel_code: messengerBindChannelSchema,
  purpose: messengerBindPurposeSchema,
  user_id: z.string().nullable(),
  status: messengerBindStatusSchema,
  challenge_id: z.string().nullable(),
  failure_code: z.string().nullable(),
  expires_at: z.union([z.coerce.date(), z.string()]),
  consumed_at: z.union([z.coerce.date(), z.string()]).nullable(),
});

export function parseIdentityRow<T>(schema: z.ZodType<T>, row: unknown, context: string): T {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw new Error(`${context}: invalid row shape`);
  }
  return parsed.data;
}

export function parseIdentityRows<T>(schema: z.ZodType<T>, rows: unknown[], context: string): T[] {
  return rows.map((row, index) => parseIdentityRow(schema, row, `${context}[${index}]`));
}

export function parseUserRole(role: string, context: string): UserRole {
  return parseIdentityRow(userRoleSchema, role, context);
}

export function parseChannelBindingLookupParams(
  params: { channelCode: string; externalId: string },
): z.infer<typeof channelBindingLookupParamsSchema> {
  return parseIdentityRow(channelBindingLookupParamsSchema, params, "channel_binding_lookup");
}

export function parseFindOrCreateByChannelBindingParams(
  params: z.input<typeof findOrCreateByChannelBindingParamsSchema>,
): z.infer<typeof findOrCreateByChannelBindingParamsSchema> {
  return parseIdentityRow(findOrCreateByChannelBindingParamsSchema, params, "find_or_create_by_channel_binding");
}

export function parseChannelContext(context: ChannelContext): ChannelContext {
  return parseIdentityRow(channelContextSchema, context, "channel_context");
}

export function parseMessengerIdentityResolutionHints(
  hints: MessengerIdentityResolutionHints | undefined,
): MessengerIdentityResolutionHints | undefined {
  if (hints == null) return undefined;
  return parseIdentityRow(messengerIdentityResolutionHintsSchema, hints, "resolution_hints");
}

export function bindingsFromRows(rows: unknown[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of parseIdentityRows(channelBindingRowSchema, rows, "channel_binding")) {
    const key =
      row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    bindings[key] = row.external_id;
  }
  return bindings;
}

function isoOrString(value: Date | string): string {
  return value instanceof Date ? toIsoStringSafe(value) : value;
}

export function mapPhoneMessengerBindSecretRow(row: unknown): PhoneMessengerBindSecretRow {
  const parsed = parseIdentityRow(phoneMessengerBindSecretRowSchema, row, "phone_messenger_bind_secret");
  return {
    id: parsed.id,
    phone_normalized: parsed.phone_normalized,
    channel_code: parsed.channel_code,
    purpose: parsed.purpose,
    user_id: parsed.user_id,
    status: parsed.status,
    challenge_id: parsed.challenge_id,
    failure_code: parsed.failure_code,
    expires_at: isoOrString(parsed.expires_at),
    consumed_at: parsed.consumed_at == null ? null : isoOrString(parsed.consumed_at),
  };
}
