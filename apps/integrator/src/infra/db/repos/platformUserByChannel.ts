import { and, eq } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { platformUsers, userChannelBindings } from '../schema/integratorPublicProduct.js';

/** Match webapp canonical merge-chain guard (`pgCanonicalPlatformUser.ts`). */
const MAX_MERGE_CHAIN_DEPTH = 5;

async function followPlatformUserMergedIntoChain(
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
  const canonical = await followPlatformUserMergedIntoChain(db, startId);
  return canonical.trim() ? canonical.trim() : null;
}
