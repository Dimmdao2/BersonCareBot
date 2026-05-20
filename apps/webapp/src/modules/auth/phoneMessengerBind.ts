import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";
import { createPgPhoneMessengerBindPort } from "@/infra/repos/pgPhoneMessengerBind";
import { findCanonicalUserIdByPhone, resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindPurpose,
  PhoneMessengerBindPort,
  PhoneMessengerBindSecretRow,
  PhoneMessengerBindStatus,
} from "./phoneMessengerBind.ports";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import { channelToBindingKey, type ChannelContext } from "./channelContext";
import { createPhoneOtpChallenge, type PhoneAuthDeps } from "./phoneAuth";
import { normalizePhone } from "./phoneNormalize";
import { isValidPhoneE164 } from "./phoneValidation";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { logger } from "@/infra/logging/logger";

const SECRET_TTL_MIN = 15;

function phoneSuffixForLog(phoneNormalized: string): string {
  const digits = phoneNormalized.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "****";
}

export type {
  PhoneMessengerBindPurpose,
  PhoneMessengerBindChannel,
  PhoneMessengerBindStatus,
} from "./phoneMessengerBind.ports";

function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}:${integratorWebhookSecret() || "dev-phone-messenger-bind"}`)
    .digest("hex");
}

function buildDeepLink(params: {
  channelCode: PhoneMessengerBindChannel;
  startPayload: string;
  botUsername: string;
  maxBotNickname?: string;
}): { url: string; manualCommand?: string } {
  if (params.channelCode === "telegram") {
    return {
      url: `https://t.me/${params.botUsername}?start=${encodeURIComponent(params.startPayload)}`,
    };
  }
  const nick = normalizeMaxBotNicknameInput(params.maxBotNickname ?? "");
  if (nick && params.startPayload.length <= 128) {
    try {
      const u = new URL(`https://max.ru/${encodeURIComponent(nick)}`);
      u.searchParams.set("start", params.startPayload);
      return { url: u.toString(), manualCommand: `/start ${params.startPayload}` };
    } catch {
      /* fall through */
    }
  }
  return { url: "https://max.ru/", manualCommand: `/start ${params.startPayload}` };
}

function resolveBindPort(port?: PhoneMessengerBindPort): PhoneMessengerBindPort | null {
  if (port) return port;
  if (!env.DATABASE_URL?.trim()) return null;
  return createPgPhoneMessengerBindPort();
}

async function applyMessengerContactPreOtp(
  client: PoolClient,
  params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    purpose: PhoneMessengerBindPurpose;
    sessionUserId?: string | null;
  },
): Promise<{ ok: true; accountCreated: boolean } | { ok: false; code: string }> {
  const channelCode = params.channelCode;
  const key = channelToBindingKey(channelCode);
  if (!key) return { ok: false, code: "unsupported_channel" };

  const existingByPhone = await client.query<{ id: string }>(
    `SELECT id FROM platform_users WHERE phone_normalized = $1 AND merged_into_id IS NULL FOR UPDATE`,
    [params.phoneNormalized],
  );

  if (params.purpose === "profile_bind") {
    const sessionId = params.sessionUserId?.trim();
    if (!sessionId) return { ok: false, code: "session_required" };
    const canonicalSession = (await resolveCanonicalUserId(client, sessionId)) ?? sessionId;
    if (existingByPhone.rows.length > 0 && existingByPhone.rows[0]!.id !== canonicalSession) {
      return { ok: false, code: "phone_owned_by_other_user" };
    }
    await client.query(
      `UPDATE platform_users SET phone_normalized = $1, updated_at = now() WHERE id = $2::uuid`,
      [params.phoneNormalized, canonicalSession],
    );
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: canonicalSession,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
    const ins = await client.query(
      `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING user_id`,
      [canonicalSession, channelCode, params.externalId],
    );
    if (ins.rows[0]?.user_id && ins.rows[0].user_id !== canonicalSession) {
      return { ok: false, code: "channel_owned_by_other_user" };
    }
    await upsertBroadcastDefaultsAfterChannelBind(client, canonicalSession, channelCode);
    return { ok: true, accountCreated: false };
  }

  let userId: string;
  let accountCreated = false;
  if (existingByPhone.rows.length > 0) {
    userId = existingByPhone.rows[0]!.id;
  } else {
    const insert = await client.query<{ id: string }>(
      `INSERT INTO platform_users (phone_normalized, display_name, role)
       VALUES ($1, $2, 'client') RETURNING id`,
      [params.phoneNormalized, params.phoneNormalized],
    );
    userId = insert.rows[0]!.id;
    accountCreated = true;
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
  }

  const bindingOwner = await client.query<{ user_id: string }>(
    `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
    [channelCode, params.externalId],
  );
  if (bindingOwner.rows.length > 0 && bindingOwner.rows[0]!.user_id !== userId) {
    const ownerCanonical = (await resolveCanonicalUserId(client, bindingOwner.rows[0]!.user_id)) ?? bindingOwner.rows[0]!.user_id;
    const userCanonical = (await resolveCanonicalUserId(client, userId)) ?? userId;
    if (ownerCanonical !== userCanonical) {
      return { ok: false, code: "channel_owned_by_other_user" };
    }
  }

  await client.query(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, channelCode, params.externalId],
  );
  await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
  return { ok: true, accountCreated };
}

export type StartPhoneMessengerBindResult =
  | {
      ok: true;
      setupToken: string;
      url: string;
      expiresAtIso: string;
      manualCommand?: string;
    }
  | { ok: false; code: string };

export async function startPhoneMessengerBind(
  params: {
    phone: string;
    channelCode: PhoneMessengerBindChannel;
    purpose: PhoneMessengerBindPurpose;
    botUsername: string;
    maxBotNickname?: string;
    sessionUserId?: string | null;
  },
  bindPort?: PhoneMessengerBindPort,
): Promise<StartPhoneMessengerBindResult> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!isValidPhoneE164(phoneNormalized)) {
    return { ok: false, code: "invalid_phone" };
  }

  const plain = randomBytes(24).toString("base64url");
  const startPayload = `auth_${plain}`;
  const setupToken = startPayload;
  const expiresAt = new Date(Date.now() + SECRET_TTL_MIN * 60 * 1000);
  const link = buildDeepLink({
    channelCode: params.channelCode,
    startPayload,
    botUsername: params.botUsername.replace(/^@/, ""),
    maxBotNickname: params.maxBotNickname,
  });

  if (!env.DATABASE_URL?.trim()) {
    return {
      ok: true,
      setupToken,
      url: link.url,
      expiresAtIso: expiresAt.toISOString(),
      ...(link.manualCommand ? { manualCommand: link.manualCommand } : {}),
    };
  }

  const port = resolveBindPort(bindPort);
  if (!port) {
    return { ok: false, code: "database_unavailable" };
  }

  const userId =
    params.purpose === "profile_bind" && params.sessionUserId?.trim() ? params.sessionUserId.trim() : null;

  await port.deletePending(phoneNormalized, params.channelCode, params.purpose);
  await port.insertSecret({
    tokenHash: hashToken(startPayload),
    phoneNormalized,
    channelCode: params.channelCode,
    purpose: params.purpose,
    userId,
    expiresAtIso: expiresAt.toISOString(),
  });

  logger.info({
    event: "phone_messenger_bind_start",
    metric: "phone_messenger_bind_start",
    purpose: params.purpose,
    channelCode: params.channelCode,
    phoneSuffix: phoneSuffixForLog(phoneNormalized),
  });

  return {
    ok: true,
    setupToken,
    url: link.url,
    expiresAtIso: expiresAt.toISOString(),
    ...(link.manualCommand ? { manualCommand: link.manualCommand } : {}),
  };
}

export type CompletePhoneMessengerBindResult =
  | { ok: true; otpCode: string; accountCreated: boolean; challengeId: string; replay?: boolean }
  | { ok: false; code: string };

export async function completePhoneMessengerBindFromIntegrator(
  params: {
    setupToken: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    contactPhoneNormalized: string;
  },
  phoneAuthDeps: PhoneAuthDeps,
  bindPort?: PhoneMessengerBindPort,
): Promise<CompletePhoneMessengerBindResult> {
  const trimmed = params.setupToken.trim();
  if (!/^auth_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: false, code: "invalid_token" };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, code: "database_unavailable" };
  }

  const contactPhone = normalizeRuPhoneE164(params.contactPhoneNormalized);
  if (!contactPhone || !isValidPhoneE164(contactPhone)) {
    return { ok: false, code: "invalid_contact_phone" };
  }

  const port = resolveBindPort(bindPort);
  if (!port) {
    return { ok: false, code: "database_unavailable" };
  }

  const row = await port.findByTokenHash(hashToken(trimmed));
  if (!row) {
    return { ok: false, code: "unknown_or_expired" };
  }

  if (row.consumed_at || row.status === "consumed") {
    return { ok: false, code: "used_token" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await port.updateExpired(row.id);
    return { ok: false, code: "expired" };
  }

  if (row.channel_code !== params.channelCode) {
    return { ok: false, code: "channel_mismatch" };
  }

  if (contactPhone !== row.phone_normalized) {
    await pool.query(
      `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = 'phone_mismatch' WHERE id = $1`,
      [row.id],
    );
    return { ok: false, code: "phone_mismatch" };
  }

  if (row.status === "otp_ready" && row.challenge_id) {
    const stored = await phoneAuthDeps.challengeStore.get(row.challenge_id);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!stored?.code || stored.expiresAt < nowSec) {
      return { ok: false, code: "challenge_expired" };
    }
    logger.info({
      event: "phone_messenger_bind_complete_ok",
      metric: "phone_messenger_bind_complete_ok",
      channelCode: params.channelCode,
      purpose: row.purpose,
      replay: true,
      phoneSuffix: phoneSuffixForLog(contactPhone),
    });
    return {
      ok: true,
      otpCode: stored.code,
      accountCreated: false,
      challengeId: row.challenge_id,
      replay: true,
    };
  }

  const context: ChannelContext = {
    channel: params.channelCode,
    chatId: params.externalId.trim(),
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pre = await applyMessengerContactPreOtp(client, {
      phoneNormalized: contactPhone,
      channelCode: params.channelCode,
      externalId: params.externalId.trim(),
      purpose: row.purpose as PhoneMessengerBindPurpose,
      sessionUserId: row.user_id,
    });
    if (!pre.ok) {
      await client.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = $2 WHERE id = $1`,
        [row.id, pre.code],
      );
      await client.query("COMMIT");
      logger.warn({
        event: "phone_messenger_bind_complete_fail",
        metric: "phone_messenger_bind_complete_fail",
        channelCode: params.channelCode,
        purpose: row.purpose,
        failure_code: pre.code,
        phoneSuffix: phoneSuffixForLog(contactPhone),
      });
      return { ok: false, code: pre.code };
    }

    const challenge = await createPhoneOtpChallenge(contactPhone, context, phoneAuthDeps);
    if (!challenge.ok) {
      await client.query(
        `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = $2 WHERE id = $1`,
        [row.id, challenge.code],
      );
      await client.query("COMMIT");
      logger.warn({
        event: "phone_messenger_bind_complete_fail",
        metric: "phone_messenger_bind_complete_fail",
        channelCode: params.channelCode,
        purpose: row.purpose,
        failure_code: challenge.code,
        phoneSuffix: phoneSuffixForLog(contactPhone),
      });
      return { ok: false, code: challenge.code };
    }

    await client.query(
      `UPDATE phone_messenger_bind_secrets
       SET status = 'otp_ready', challenge_id = $2, failure_code = NULL
       WHERE id = $1`,
      [row.id, challenge.challengeId],
    );
    await client.query("COMMIT");

    logger.info({
      event: "phone_messenger_bind_complete_ok",
      metric: "phone_messenger_bind_complete_ok",
      channelCode: params.channelCode,
      purpose: row.purpose,
      replay: false,
      accountCreated: pre.accountCreated,
      phoneSuffix: phoneSuffixForLog(contactPhone),
    });

    return {
      ok: true,
      otpCode: challenge.code,
      accountCreated: pre.accountCreated,
      challengeId: challenge.challengeId,
    };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.warn({
      event: "phone_messenger_bind_complete_fail",
      metric: "phone_messenger_bind_complete_fail",
      channelCode: params.channelCode,
      failure_code: "server_error",
    });
    return { ok: false, code: "server_error" };
  } finally {
    client.release();
  }
}

export type PhoneMessengerBindStatusResult =
  | {
      ok: true;
      status: "pending_contact" | "otp_ready";
      challengeId?: string;
      retryAfterSeconds?: number;
    }
  | { ok: true; status: "expired" | "failed" | "consumed"; error?: string }
  | { ok: false; code: string };

export async function getPhoneMessengerBindStatus(setupToken: string): Promise<PhoneMessengerBindStatusResult> {
  const trimmed = setupToken.trim();
  if (!/^auth_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: false, code: "invalid_token" };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, code: "database_unavailable" };
  }

  const pool = getPool();
  const row = await loadSecretByHash(pool, hashToken(trimmed));
  if (!row) {
    return { ok: false, code: "not_found" };
  }

  if (new Date(row.expires_at).getTime() < Date.now() && row.status !== "otp_ready") {
    return { ok: true, status: "expired" };
  }

  if (row.status === "failed") {
    return { ok: true, status: "failed", error: row.failure_code ?? "failed" };
  }

  if (row.status === "consumed") {
    return { ok: true, status: "consumed" };
  }

  if (row.status === "otp_ready" && row.challenge_id) {
    return {
      ok: true,
      status: "otp_ready",
      challengeId: row.challenge_id,
      retryAfterSeconds: 60,
    };
  }

  return { ok: true, status: "pending_contact" };
}

/** Помечает secret consumed после успешного phone/confirm (по challengeId). */
export async function markPhoneMessengerBindConsumedByChallenge(challengeId: string): Promise<void> {
  if (!env.DATABASE_URL?.trim()) return;
  const pool = getPool();
  await pool.query(
    `UPDATE phone_messenger_bind_secrets SET status = 'consumed', consumed_at = now()
     WHERE challenge_id = $1 AND status = 'otp_ready'`,
    [challengeId],
  );
}

export async function findPhoneMessengerBindChallengeOwner(phone: string): Promise<string | null> {
  if (!env.DATABASE_URL?.trim()) return null;
  const normalized = normalizePhone(phone);
  const pool = getPool();
  return findCanonicalUserIdByPhone(pool, normalized);
}
