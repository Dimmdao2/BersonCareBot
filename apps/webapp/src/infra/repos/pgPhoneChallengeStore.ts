import { getPool } from "@/infra/db/client";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { PhoneChallengePayload, PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";

function channelContextFromRow(row: { channel_context: unknown }): ChannelContext | undefined {
  const raw = row.channel_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const channel = o.channel;
  const chatId = o.chatId;
  if (typeof channel !== "string" || typeof chatId !== "string") return undefined;
  if (channel !== "telegram" && channel !== "vk" && channel !== "max" && channel !== "web") return undefined;
  return {
    channel: channel as ChannelContext["channel"],
    chatId,
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
  };
}

export function createPgPhoneChallengeStore(): PhoneChallengeStore {
  return {
    async set(challengeId: string, payload: PhoneChallengePayload): Promise<void> {
      const pool = getPool();
      await pool.query(
        `INSERT INTO phone_challenges (challenge_id, phone, expires_at, code, channel_context)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (challenge_id) DO UPDATE SET
           phone = EXCLUDED.phone,
           expires_at = EXCLUDED.expires_at,
           code = EXCLUDED.code,
           channel_context = EXCLUDED.channel_context`,
        [
          challengeId,
          payload.phone,
          payload.expiresAt,
          payload.code ?? null,
          payload.channelContext ? JSON.stringify(payload.channelContext) : null,
        ]
      );
    },
    async get(challengeId: string): Promise<PhoneChallengePayload | null> {
      const pool = getPool();
      const now = Math.floor(Date.now() / 1000);
      const r = await pool.query(
        "SELECT phone, expires_at, code, channel_context FROM phone_challenges WHERE challenge_id = $1",
        [challengeId]
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0];
      const expiresAt = Number(row.expires_at);
      if (expiresAt <= now) {
        await pool.query("DELETE FROM phone_challenges WHERE challenge_id = $1", [challengeId]);
        return null;
      }
      const channelContext = channelContextFromRow(row);
      return {
        phone: row.phone,
        expiresAt,
        code: row.code ?? undefined,
        channelContext,
      };
    },
    async delete(challengeId: string): Promise<void> {
      const pool = getPool();
      await pool.query("DELETE FROM phone_challenges WHERE challenge_id = $1", [challengeId]);
    },
  };
}
