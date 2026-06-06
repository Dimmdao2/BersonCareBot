import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { RECIPIENT_BLOCKED_BOT_REASON } from '../../delivery/recipientBotBlocked.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

const MESSENGER_CHANNELS = new Set(['telegram', 'max']);

function normalizeChannel(channel: string): 'telegram' | 'max' | null {
  const c = channel.trim().toLowerCase();
  return MESSENGER_CHANNELS.has(c) ? (c as 'telegram' | 'max') : null;
}

function normalizeExternalId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

/** Resolve platform user id from queue row / intent (broadcast stores uuid in meta.userId). */
export function resolvePlatformUserIdForBotBlockedMarker(input: {
  metaUserId?: unknown;
  payloadJson?: Record<string, unknown>;
}): string | null {
  const fromPayload =
    typeof input.payloadJson?.clientUserId === 'string' ? input.payloadJson.clientUserId.trim() : '';
  if (fromPayload && /^[0-9a-f-]{36}$/i.test(fromPayload)) return fromPayload;
  const fromMeta = typeof input.metaUserId === 'string' ? input.metaUserId.trim() : '';
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) return fromMeta;
  return null;
}

export async function markUserChannelBotBlocked(
  db: DbPort,
  input: { platformUserId?: string | null; channel: string; externalId?: string | null },
): Promise<void> {
  const channel = normalizeChannel(input.channel);
  if (!channel) return;
  const platformUserId = input.platformUserId?.trim() || null;
  const externalId = normalizeExternalId(input.externalId);
  if (platformUserId && externalId) {
    await runIntegratorSql(
      db,
      sql`INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, bot_blocked_at, bot_blocked_reason)
          VALUES (${platformUserId}::uuid, ${channel}, ${externalId}, now(), ${RECIPIENT_BLOCKED_BOT_REASON})
          ON CONFLICT (channel_code, external_id) DO UPDATE SET
            bot_blocked_at = now(),
            bot_blocked_reason = ${RECIPIENT_BLOCKED_BOT_REASON}`,
    );
    return;
  }
  if (platformUserId) {
    await runIntegratorSql(
      db,
      sql`UPDATE public.user_channel_bindings
          SET bot_blocked_at = now(),
              bot_blocked_reason = ${RECIPIENT_BLOCKED_BOT_REASON}
          WHERE user_id = ${platformUserId}::uuid
            AND channel_code = ${channel}`,
    );
    return;
  }
  if (!externalId) return;
  await runIntegratorSql(
    db,
    sql`UPDATE public.user_channel_bindings
        SET bot_blocked_at = now(),
            bot_blocked_reason = ${RECIPIENT_BLOCKED_BOT_REASON}
        WHERE channel_code = ${channel}
          AND external_id = ${externalId}`,
  );
}

export async function clearUserChannelBotBlocked(
  db: DbPort,
  input: { platformUserId?: string | null; channel: string; externalId?: string | null },
): Promise<void> {
  const channel = normalizeChannel(input.channel);
  if (!channel) return;
  const platformUserId = input.platformUserId?.trim() || null;
  const externalId = normalizeExternalId(input.externalId);
  if (platformUserId) {
    await runIntegratorSql(
      db,
      sql`UPDATE public.user_channel_bindings
          SET bot_blocked_at = NULL,
              bot_blocked_reason = NULL
          WHERE user_id = ${platformUserId}::uuid
            AND channel_code = ${channel}`,
    );
    return;
  }
  if (!externalId) return;
  await runIntegratorSql(
    db,
    sql`UPDATE public.user_channel_bindings
        SET bot_blocked_at = NULL,
            bot_blocked_reason = NULL
        WHERE channel_code = ${channel}
          AND external_id = ${externalId}`,
  );
}
