/** Wave 3 phase 15B — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { PhoneChallengePayload, PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  parsePublicBookingIntent,
  type PublicBookingIntent,
} from "@/modules/public-booking/publicBookingIntent";

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

function profileBindUserIdFromRow(row: { channel_context: unknown }): string | undefined {
  const raw = row.channel_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = (raw as Record<string, unknown>).profileBindUserId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function profileBindOrganizationIdFromRow(row: { channel_context: unknown }): string | undefined {
  const raw = row.channel_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = (raw as Record<string, unknown>).profileBindOrganizationId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicBookingIntentFromRow(row: { channel_context: unknown }): PublicBookingIntent | undefined {
  const raw = row.channel_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return parsePublicBookingIntent((raw as Record<string, unknown>).publicBookingIntent) ?? undefined;
}

function mergeChannelContextJson(payload: PhoneChallengePayload): string | null {
  if (
    !payload.channelContext
    && !payload.deliveryChannel
    && !payload.profileBindUserId
    && !payload.profileBindOrganizationId
    && !payload.publicBookingIntent
  ) return null;
  const o: Record<string, unknown> = {};
  if (payload.channelContext) {
    Object.assign(o, payload.channelContext as Record<string, unknown>);
  }
  if (payload.deliveryChannel) {
    o.otpDelivery = payload.deliveryChannel;
  }
  if (payload.profileBindUserId) {
    o.profileBindUserId = payload.profileBindUserId;
  }
  if (payload.profileBindOrganizationId) {
    o.profileBindOrganizationId = payload.profileBindOrganizationId;
  }
  if (payload.publicBookingIntent) {
    o.publicBookingIntent = payload.publicBookingIntent;
  }
  return JSON.stringify(o);
}

export function createPgPhoneChallengeStore(): PhoneChallengeStore {
  return {
    async set(challengeId: string, payload: PhoneChallengePayload): Promise<void> {
      await runWebappPgText(
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
        ],
      );
    },
    async get(challengeId: string): Promise<PhoneChallengePayload | null> {
      const now = Math.floor(Date.now() / 1000);
      const r = await runWebappPgText<{
        phone: string;
        expires_at: number | string;
        code: string | null;
        channel_context: unknown;
        verify_attempts: number | string | null;
      }>(
        "SELECT phone, expires_at, code, channel_context, verify_attempts FROM phone_challenges WHERE challenge_id = $1",
        [challengeId],
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0]!;
      const expiresAt = Number(row.expires_at);
      if (expiresAt <= now) {
        await runWebappPgText("DELETE FROM phone_challenges WHERE challenge_id = $1", [challengeId]);
        return null;
      }
      const channelContext = channelContextFromRow(row);
      const deliveryChannel = otpDeliveryFromRow(row);
      const profileBindUserId = profileBindUserIdFromRow(row);
      const profileBindOrganizationId = profileBindOrganizationIdFromRow(row);
      const publicBookingIntent = publicBookingIntentFromRow(row);
      return {
        phone: row.phone,
        expiresAt,
        code: row.code ?? undefined,
        verifyAttempts: Number(row.verify_attempts ?? 0),
        channelContext,
        deliveryChannel,
        profileBindUserId,
        profileBindOrganizationId,
        publicBookingIntent,
      };
    },
    async delete(challengeId: string): Promise<void> {
      await runWebappPgText("DELETE FROM phone_challenges WHERE challenge_id = $1", [challengeId]);
    },
    async deleteByPhone(phone: string): Promise<void> {
      await runWebappPgText("DELETE FROM phone_challenges WHERE phone = $1", [phone]);
    },
    async incrementVerifyAttempts(challengeId: string): Promise<number | null> {
      // Atomic: a single `UPDATE ... SET verify_attempts = verify_attempts + 1 ... RETURNING`
      // round trip. Postgres serializes concurrent UPDATEs to the same row, so the second writer's
      // `+ 1` always applies to the first writer's already-committed value -- no separate SELECT
      // FOR UPDATE is needed the way 0232/0245's SECURITY DEFINER functions need one, because those
      // also branch on OTHER columns (code_hash, expiry) read in the same transaction; this call
      // only ever needs the relative increment itself. `expires_at > now` guards against
      // incrementing a row that is expired but not yet reaped by a concurrent `get()`.
      const now = Math.floor(Date.now() / 1000);
      const r = await runWebappPgText<{ verify_attempts: number | string }>(
        `UPDATE phone_challenges
         SET verify_attempts = verify_attempts + 1
         WHERE challenge_id = $1 AND expires_at > $2
         RETURNING verify_attempts`,
        [challengeId, now],
      );
      const row = r.rows[0];
      return row ? Number(row.verify_attempts) : null;
    },
  };
}
