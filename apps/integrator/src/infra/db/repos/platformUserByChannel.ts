import { and, eq, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  orgEnrollments,
  platformUsers,
  userChannelBindings,
  userContacts,
} from '../schema/integratorPublicProduct.js';

/** Match webapp canonical merge-chain guard (`pgCanonicalPlatformUser.ts`). */
const MAX_MERGE_CHAIN_DEPTH = 5;

export async function resolveCanonicalPlatformUserIdFromId(
  db: DbPort,
  startId: string,
): Promise<string> {
  const d = getIntegratorDrizzleSession(db);
  let current = startId;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (seen.has(current)) {
      console.warn('[canonical] merged_into_id cycle detected at', current);
      return startId;
    }
    seen.add(current);
    const rows = await d
      .select({ mergedIntoId: platformUsers.mergedIntoId })
      .from(platformUsers)
      .where(eq(platformUsers.id, current))
      .limit(1);
    const next = rows[0]?.mergedIntoId ?? null;
    if (next == null) return current;
    current = next;
  }
  console.warn('[canonical] merged_into_id chain exceeded max depth from', startId);
  return current;
}

/**
 * Канонический `platform_users.id` по привязке мессенджера (public.user_channel_bindings).
 */
export async function resolveCanonicalPlatformUserIdByChannel(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const bindings = await d
    .select({ userId: userChannelBindings.userId })
    .from(userChannelBindings)
    .innerJoin(platformUsers, eq(platformUsers.id, userChannelBindings.userId))
    .where(
      and(
        eq(userChannelBindings.channelCode, input.channelCode),
        eq(userChannelBindings.externalId, input.externalId),
      ),
    )
    .limit(1);
  const startId = bindings[0]?.userId;
  if (!startId) return null;
  const canonical = await resolveCanonicalPlatformUserIdFromId(db, startId);
  return canonical.trim() ? canonical.trim() : null;
}

export type ChannelBindingLinkData = {
  /** Canonical public platform user UUID. */
  userId: string;
  channelId: string;
  chatId: number;
  username: string | null;
  phoneNormalized: string | null;
};

/** Canonical replacement for the former identities/telegram_state link-data read. */
export async function getChannelBindingLinkData(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<ChannelBindingLinkData | null> {
  const platformUserId = await resolveCanonicalPlatformUserIdByChannel(db, input);
  if (!platformUserId) return null;
  const d = getIntegratorDrizzleSession(db);
  const [userRows, bindingRows] = await Promise.all([
    d
      .select({ phoneNormalized: userContacts.valueNormalized })
      .from(userContacts)
      .where(and(eq(userContacts.platformUserId, platformUserId), eq(userContacts.contactKind, 'phone'), eq(userContacts.isPrimary, true)))
      .limit(1),
    d
      .select({ displayHandle: userChannelBindings.displayHandle })
      .from(userChannelBindings)
      .where(
        and(
          eq(userChannelBindings.channelCode, input.channelCode),
          eq(userChannelBindings.externalId, input.externalId),
        ),
      )
      .limit(1),
  ]);
  const chatId = Number(input.externalId);
  return {
    userId: platformUserId,
    channelId: input.externalId,
    chatId: Number.isFinite(chatId) ? chatId : 0,
    username: bindingRows[0]?.displayHandle ?? null,
    phoneNormalized: userRows[0]?.phoneNormalized?.trim() || null,
  };
}

/** Resolve a channel recipient from the canonical confirmed phone, never from integrator contacts. */
export async function findChannelBindingByPhone(
  db: DbPort,
  input: { channelCode: string; phoneNormalized: string },
): Promise<ChannelBindingLinkData | null> {
  const channelCode = input.channelCode === 'channel' ? 'telegram' : input.channelCode;
  const res = await runIntegratorSql<{
    user_id: string;
    external_id: string;
    display_handle: string | null;
    phone_normalized: string | null;
  }>(
    db,
    sql`SELECT pu.id::text AS user_id,
               ucb.external_id,
               ucb.display_handle,
               uc.value_normalized AS phone_normalized
        FROM public.platform_users pu
        INNER JOIN public.user_contacts uc ON uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary
        INNER JOIN public.user_channel_bindings ucb ON ucb.user_id = pu.id
        WHERE uc.value_normalized = ${input.phoneNormalized}
          AND pu.merged_into_id IS NULL
          AND ucb.channel_code = ${channelCode}
        ORDER BY ucb.external_id
        LIMIT 2`,
  );
  if (res.rows.length !== 1 || !res.rows[0]) return null;
  const row = res.rows[0];
  const chatId = Number(row.external_id);
  return {
    userId: row.user_id,
    channelId: row.external_id,
    chatId: Number.isFinite(chatId) ? chatId : 0,
    username: row.display_handle,
    phoneNormalized: row.phone_normalized?.trim() || null,
  };
}

/** Exact active organization for a channel binding; zero or ambiguity fails closed. */
export async function resolveActiveOrganizationIdForChannel(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<string | null> {
  const platformUserId = await resolveCanonicalPlatformUserIdByChannel(db, input);
  if (!platformUserId) return null;
  const rows = await getIntegratorDrizzleSession(db)
    .selectDistinct({ organizationId: orgEnrollments.organizationId })
    .from(orgEnrollments)
    .where(
      and(eq(orgEnrollments.platformUserId, platformUserId), eq(orgEnrollments.status, 'active')),
    );
  return rows.length === 1 ? (rows[0]?.organizationId ?? null) : null;
}
