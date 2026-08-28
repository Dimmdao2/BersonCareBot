import { z } from 'zod';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { PhoneMessengerBindClaimRow, PhoneMessengerBindSecretRow } from '@/modules/auth/phoneMessengerBind.ports';
import type { MessengerIdentityResolutionHints } from '@/modules/auth/identityResolutionPort';
import type { ChannelContext } from '@/modules/auth/channelContext';
import type { ChannelBindings, SessionIdentityContact } from '@/shared/types/session';
import type { UserRole } from '@/shared/types/session';

const userRoleSchema = z.enum(['client', 'doctor', 'admin']);

export const identityChannelCodeSchema = z.enum(['telegram', 'max', 'vk']);

export const userByPhoneChannelKindSchema = z.enum(['telegram', 'vk', 'max', 'web']);

export const messengerBindChannelSchema = z.enum(['telegram', 'max']);

export const messengerBindPurposeSchema = z.enum(['login', 'profile_bind']);

export const messengerBindStatusSchema = z.enum([
  'pending_contact',
  'otp_ready',
  'failed',
  'consumed',
  'expired',
]);

export const messengerIdentityResolutionHintsSchema = z.object({
  /** Canonical `platform_users.id`; Track D (#987) dropped the retired `integratorUserId` hint. */
  platformUserSub: z.string().trim().min(1).optional(),
  phoneNormalized: z.string().trim().min(1).optional(),
});

export const channelBindingLookupParamsSchema = z.object({
  channelCode: identityChannelCodeSchema,
  externalId: z.string().trim().min(1),
});

export const resolveByChannelBindingParamsSchema = channelBindingLookupParamsSchema.extend({
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
  channel_code: identityChannelCodeSchema.or(z.literal('vk')),
  external_id: z.string(),
});

export const sessionIdentityContactRowSchema = z.object({
  contact_kind: z.enum(['phone', 'email']),
  value_normalized: z.string().trim().min(1),
  is_primary: z.coerce.boolean(),
  confirmed_at: z.union([z.date(), z.string()]).nullable(),
  /**
   * `user_contacts.source_origin` (D15b/6, migration 20260821T040000_cut_over_canonical_contacts).
   * The forward migration dropped `user_contacts_source_origin_check` and re-added it restricted to
   * `'direct' | 'oauth'` after collapsing every existing row (including the old
   * `platform_users`/`oauth_binding`/`phone_history` tags) into one of these two values. Every row this
   * query can ever see now satisfies that CHECK, so the old three-value enum here always rejected the
   * live physical row shape — fail-closed straight into a 500 on every login.
   */
  source_origin: z.enum(['direct', 'oauth']),
});

export const platformUserSessionRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  patronymic: z.string().nullable().optional(),
  role: z.string(),
  /**
   * `platform_users.session_epoch` — the revocation counter (C-1, 2026-07-26, migration 0243).
   * REQUIRED and `>= 1`, with no `.optional()` and no `.default()`, on purpose: the column is
   * `NOT NULL DEFAULT 1 CHECK (session_epoch >= 1)`, so every live row has one. If a SELECT that
   * feeds this schema ever stops listing the column, parsing throws and the session is rejected —
   * which is the fail-closed direction. The previous `security_version` field defaulted to 0 when
   * absent, and that default is exactly how the old check passed for every user without a
   * `staff_security_profiles` row.
   */
  session_epoch: z.coerce.number().int().min(1),
  /**
   * Legacy account-level archive flag. Patient archive is now clinic-scoped in `org_enrollments`;
   * the forward migration clears this flag for clients, but parsing it remains fail-closed while
   * old/non-client rows still exist.
   */
  is_archived: z.coerce.boolean(),
  /** Global account block. Required on every session-producing path. */
  is_blocked: z.coerce.boolean(),
  security_factor_required: z.coerce.boolean().optional().default(false),
});

/**
 * `app.pre_session_find_session_user_by_phone(text)` jsonb payload (D15b/6 repair). The `found:
 * true` branch reuses {@link platformUserSessionRowSchema} for the base identity fields — same
 * columns `loadSessionIdentityUser`'s first relation read used to produce — plus the two arrays
 * its follow-up relation reads used to assemble, now returned by the same door call.
 */
export const preSessionPhoneSessionLookupSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  platformUserSessionRowSchema.extend({
    found: z.literal(true),
    contacts: z.array(sessionIdentityContactRowSchema),
    bindings: z.array(channelBindingRowSchema),
  }),
]);

/**
 * `app.pre_session_phone_confirm_resolve(text,text,boolean,text)` jsonb payload (D15b/6 confirm-path
 * correction). `outcome: 'conflict'` covers both an invalid phone shape and the fail-closed
 * ambiguous-live-duplicate case — same "не догадка" doctrine as `resolve_public_booking_client_by_phone`
 * — never a pick to guess at TypeScript's side. `outcome: 'resolved'` reuses
 * {@link platformUserSessionRowSchema} plus `was_created`, the same shape
 * {@link preSessionPhoneSessionLookupSchema} already established for the sibling read-only root.
 */
export const preSessionPhoneConfirmResolveSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('conflict') }),
  platformUserSessionRowSchema.extend({
    outcome: z.literal('resolved'),
    was_created: z.coerce.boolean(),
    contacts: z.array(sessionIdentityContactRowSchema),
    bindings: z.array(channelBindingRowSchema),
  }),
]);

/**
 * `app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)` jsonb payload (D15b/6
 * messenger confirm-path correction). Same shape as {@link preSessionPhoneConfirmResolveSchema} —
 * `outcome: 'conflict'` covers an invalid phone/external id AND the fail-closed case where the
 * channel-binding owner, phone owner and/or session owner disagree (a real merge decision this root
 * does not attempt — see the migration header). `candidate_ids` is present only for the latter; the
 * root itself already records the `messenger_phone_bind_blocked` case for the manual-merge review
 * path (D15b/6 conflict-audit correction — no caller-side write).
 */
export const preSessionMessengerChannelResolveSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('conflict'), candidate_ids: z.array(z.string()).optional() }),
  platformUserSessionRowSchema.extend({
    outcome: z.literal('resolved'),
    was_created: z.coerce.boolean(),
    contacts: z.array(sessionIdentityContactRowSchema),
    bindings: z.array(channelBindingRowSchema),
  }),
]);

export const platformUserProfileRowSchema = z.object({
  display_name: z.string().nullable(),
  role: z.string(),
  phone_normalized: z.string().nullable(),
});

export const preSessionChannelBindingSessionRowSchema = platformUserProfileRowSchema.extend({
  // DEV fixture principals intentionally use stable UUID-shaped all-zero ids;
  // PostgreSQL already enforces the column type, so do not re-impose RFC version bits here.
  user_id: z.string(),
  channel_code: identityChannelCodeSchema,
  external_id: z.string(),
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

/** Scalar lock-accessor row: one row always, `user_id` null means no binding. */
export const nullableLockedBindingUserIdRowSchema = z.object({
  user_id: z.string().nullable(),
});

/**
 * Map `app.auth_phone_bind_lock_channel_binding` result to an existing owner id.
 * Unlike a table `SELECT … FOR UPDATE`, the accessor always returns one row.
 */
export function lockedBindingUserIdFromAccessorRow(row: unknown): string | null {
  const parsed = nullableLockedBindingUserIdRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error('binding_lock: invalid row shape');
  }
  return parsed.data.user_id;
}

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

const phoneMessengerBindSecretRowSchema = z.object({
  id: z.string(),
  phone_normalized: z.string(),
  channel_code: messengerBindChannelSchema,
  purpose: messengerBindPurposeSchema,
  user_id: z.string().nullable(),
  status: messengerBindStatusSchema,
  challenge_id: z.string().nullable(),
  failure_code: z.string().nullable(),
  claimed_external_id: z.union([z.string(), z.null()]).optional().default(null),
  claimed_at: z.union([z.coerce.date(), z.string(), z.null()]).optional().default(null),
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

export function parseChannelBindingLookupParams(params: {
  channelCode: string;
  externalId: string;
}): z.infer<typeof channelBindingLookupParamsSchema> {
  return parseIdentityRow(channelBindingLookupParamsSchema, params, 'channel_binding_lookup');
}

export function parseResolveByChannelBindingParams(
  params: z.input<typeof resolveByChannelBindingParamsSchema>,
): z.infer<typeof resolveByChannelBindingParamsSchema> {
  return parseIdentityRow(
    resolveByChannelBindingParamsSchema,
    params,
    'resolve_by_channel_binding',
  );
}

export function parseChannelContext(context: ChannelContext): ChannelContext {
  return parseIdentityRow(channelContextSchema, context, 'channel_context');
}

export function parseMessengerIdentityResolutionHints(
  hints: MessengerIdentityResolutionHints | undefined,
): MessengerIdentityResolutionHints | undefined {
  if (hints == null) return undefined;
  return parseIdentityRow(messengerIdentityResolutionHintsSchema, hints, 'resolution_hints');
}

export function bindingsFromRows(rows: unknown[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of parseIdentityRows(channelBindingRowSchema, rows, 'channel_binding')) {
    const key =
      row.channel_code === 'telegram'
        ? 'telegramId'
        : row.channel_code === 'max'
          ? 'maxId'
          : 'vkId';
    bindings[key] = row.external_id;
  }
  return bindings;
}

export function sessionIdentityContactsFromRows(rows: unknown[]): SessionIdentityContact[] {
  return parseIdentityRows(sessionIdentityContactRowSchema, rows, 'session_identity_contact').map(
    (row) => ({
      kind: row.contact_kind,
      value: row.value_normalized,
      isPrimary: row.is_primary,
      ...(row.confirmed_at === null ? {} : { confirmedAt: isoOrString(row.confirmed_at) }),
      sourceOrigin: row.source_origin,
    }),
  );
}

function isoOrString(value: Date | string): string {
  return value instanceof Date ? toIsoStringSafe(value) : value;
}

export function mapPhoneMessengerBindSecretRow(row: unknown): PhoneMessengerBindSecretRow {
  const parsed = parseIdentityRow(
    phoneMessengerBindSecretRowSchema,
    row,
    'phone_messenger_bind_secret',
  );
  return {
    id: parsed.id,
    phone_normalized: parsed.phone_normalized,
    channel_code: parsed.channel_code,
    purpose: parsed.purpose,
    user_id: parsed.user_id,
    status: parsed.status,
    challenge_id: parsed.challenge_id,
    failure_code: parsed.failure_code,
    claimed_external_id: parsed.claimed_external_id,
    claimed_at: parsed.claimed_at == null ? null : isoOrString(parsed.claimed_at),
    expires_at: isoOrString(parsed.expires_at),
    consumed_at: parsed.consumed_at == null ? null : isoOrString(parsed.consumed_at),
  };
}

export function mapPhoneMessengerBindClaimRow(row: unknown): PhoneMessengerBindClaimRow {
  const parsed = parseIdentityRow(
    phoneMessengerBindSecretRowSchema.extend({ token_hash: z.string().min(1) }),
    row,
    'phone_messenger_bind_claimed_secret',
  );
  return {
    ...mapPhoneMessengerBindSecretRow(parsed),
    token_hash: parsed.token_hash,
  };
}
