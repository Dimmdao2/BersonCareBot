import { getPool } from "@/infra/db/client";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { PhoneChallengePayload, PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";

const OTP_DELIVERY_KEYS = new Set(["sms", "telegram", "max", "email"]);

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

function otpDeliveryFromRow(row: { channel_context: unknown }): PhoneChallengePayload["deliveryChannel"] {
  const raw = row.channel_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = (raw as Record<string, unknown>).otpDelivery;
  if (typeof v !== "string" || !OTP_DELIVERY_KEYS.has(v)) return undefined;
  return v as PhoneChallengePayload["deliveryChannel"];
}

function mergeChannelContextJson(payload: PhoneChallengePayload): string | null {
  if (!payload.channelContext && !payload.deliveryChannel) return null;
  const o: Record<string, unknown> = {};
  if (payload.channelContext) {
    Object.assign(o, payload.channelContext as Record<string, unknown>);
  }
  if (payload.deliveryChannel) {
    o.otpDelivery = payload.deliveryChannel;
  }
  return JSON.stringify(o);
}

export function createPgPhoneChallengeStore(): PhoneChallengeStore {
  return {
    async set(challengeId: string, payload: PhoneChallengePayload): Promise<void> {
      const pool = getPool();
      await pool.query(
        `INSERT INTO phone_challenges (challenge_id, phone, expires_at, code, channel_context, verify_attempts)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challenge_id) DO UPDATE SET
           phone = EXCLUDED.phone,
           expires_at = EXCLUDED.expires_at,
           code = EXCLUDED.code,
           channel_context = EXCLUDED.channel_context,
           verify_attempts = EXCLUDED.verify_attempts`,
        [
          challengeId,
          payload.phone,
          payload.expiresAt,
          payload.code ?? null,
          mergeChannelContextJson(payload),
          payload.verifyAttempts ?? 0,
        ]
      );
    },
    async get(challengeId: string): Promise<PhoneChallengePayload | null> {
      const pool = getPool();
      const now = Math.floor(Date.now() / 1000);
      const r = await pool.query(
        "SELECT phone, expires_at, code, channel_context, verify_attempts FROM phone_challenges WHERE challenge_id = $1",
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
      const deliveryChannel = otpDeliveryFromRow(row);
      return {
        phone: row.phone,
        expiresAt,
        code: row.code ?? undefined,
        verifyAttempts: Number(row.verify_attempts ?? 0),
        channelContext,
        deliveryChannel,
      };
    },
    async delete(challengeId: string): Promise<void> {
      const pool = getPool();
      await pool.query("DELETE FROM phone_challenges WHERE challenge_id = $1", [challengeId]);
    },
    async deleteByPhone(phone: string): Promise<void> {
      const pool = getPool();
      await pool.query("DELETE FROM phone_challenges WHERE phone = $1", [phone]);
    },
  };
}
