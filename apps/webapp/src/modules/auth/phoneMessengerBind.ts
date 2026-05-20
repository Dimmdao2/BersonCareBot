import { createHash, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindPurpose,
  PhoneMessengerBindPort,
  PhoneMessengerBindStatus,
} from "./phoneMessengerBind.ports";
import { normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import type { ChannelContext } from "./channelContext";
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

let registeredPhoneMessengerBindPort: PhoneMessengerBindPort | null = null;

/** Composition root registers the PG port once at module load. */
export function registerPhoneMessengerBindPort(port: PhoneMessengerBindPort | null): void {
  registeredPhoneMessengerBindPort = port;
}

function resolveBindPort(port?: PhoneMessengerBindPort): PhoneMessengerBindPort | null {
  if (port) return port;
  if (!env.DATABASE_URL?.trim()) return null;
  return registeredPhoneMessengerBindPort;
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
  | {
      ok: true;
      purpose: "login";
      otpCode: string;
      accountCreated: boolean;
      challengeId: string;
      replay?: boolean;
    }
  | { ok: true; purpose: "profile_bind"; replay?: boolean }
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
    await port.updateFailed(row.id, "phone_mismatch");
    return { ok: false, code: "phone_mismatch" };
  }

  const bindPurpose = row.purpose as PhoneMessengerBindPurpose;

  if (row.status === "otp_ready" && row.challenge_id) {
    if (bindPurpose === "profile_bind") {
      await port.markConsumed(row.id);
      logger.info({
        event: "phone_messenger_bind_complete_ok",
        metric: "phone_messenger_bind_complete_ok",
        channelCode: params.channelCode,
        purpose: bindPurpose,
        replay: true,
        phoneSuffix: phoneSuffixForLog(contactPhone),
      });
      return { ok: true, purpose: "profile_bind", replay: true };
    }
    const stored = await phoneAuthDeps.challengeStore.get(row.challenge_id);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!stored?.code || stored.expiresAt < nowSec) {
      return { ok: false, code: "challenge_expired" };
    }
    logger.info({
      event: "phone_messenger_bind_complete_ok",
      metric: "phone_messenger_bind_complete_ok",
      channelCode: params.channelCode,
      purpose: bindPurpose,
      replay: true,
      phoneSuffix: phoneSuffixForLog(contactPhone),
    });
    return {
      ok: true,
      purpose: "login",
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

  try {
    return await port.withTransaction(async (client) => {
      const pre = await port.applyMessengerContactPreOtp(client, {
        phoneNormalized: contactPhone,
        channelCode: params.channelCode,
        externalId: params.externalId.trim(),
        purpose: row.purpose as PhoneMessengerBindPurpose,
        sessionUserId: row.user_id,
      });
      if (!pre.ok) {
        await port.updateFailed(row.id, pre.code, client);
        logger.warn({
          event: "phone_messenger_bind_complete_fail",
          metric: "phone_messenger_bind_complete_fail",
          channelCode: params.channelCode,
          purpose: bindPurpose,
          failure_code: pre.code,
          phoneSuffix: phoneSuffixForLog(contactPhone),
        });
        return { ok: false as const, code: pre.code };
      }

      if (bindPurpose === "profile_bind") {
        await port.markConsumed(row.id, client);
        logger.info({
          event: "phone_messenger_bind_complete_ok",
          metric: "phone_messenger_bind_complete_ok",
          channelCode: params.channelCode,
          purpose: bindPurpose,
          replay: false,
          accountCreated: false,
          phoneSuffix: phoneSuffixForLog(contactPhone),
        });
        return { ok: true as const, purpose: "profile_bind" };
      }

      const challenge = await createPhoneOtpChallenge(contactPhone, context, phoneAuthDeps);
      if (!challenge.ok) {
        await port.updateFailed(row.id, challenge.code, client);
        logger.warn({
          event: "phone_messenger_bind_complete_fail",
          metric: "phone_messenger_bind_complete_fail",
          channelCode: params.channelCode,
          purpose: bindPurpose,
          failure_code: challenge.code,
          phoneSuffix: phoneSuffixForLog(contactPhone),
        });
        return { ok: false as const, code: challenge.code };
      }

      await port.updateOtpReady(row.id, challenge.challengeId, client);

      logger.info({
        event: "phone_messenger_bind_complete_ok",
        metric: "phone_messenger_bind_complete_ok",
        channelCode: params.channelCode,
        purpose: bindPurpose,
        replay: false,
        accountCreated: pre.accountCreated,
        phoneSuffix: phoneSuffixForLog(contactPhone),
      });

      return {
        ok: true as const,
        purpose: "login",
        otpCode: challenge.code,
        accountCreated: pre.accountCreated,
        challengeId: challenge.challengeId,
      };
    });
  } catch {
    logger.warn({
      event: "phone_messenger_bind_complete_fail",
      metric: "phone_messenger_bind_complete_fail",
      channelCode: params.channelCode,
      failure_code: "server_error",
    });
    return { ok: false, code: "server_error" };
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

export async function getPhoneMessengerBindStatus(
  setupToken: string,
  bindPort?: PhoneMessengerBindPort,
): Promise<PhoneMessengerBindStatusResult> {
  const trimmed = setupToken.trim();
  if (!/^auth_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: false, code: "invalid_token" };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, code: "database_unavailable" };
  }

  const port = resolveBindPort(bindPort);
  if (!port) {
    return { ok: false, code: "database_unavailable" };
  }

  const row = await port.findByTokenHash(hashToken(trimmed));
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
export async function markPhoneMessengerBindConsumedByChallenge(
  challengeId: string,
  bindPort?: PhoneMessengerBindPort,
): Promise<void> {
  const port = resolveBindPort(bindPort);
  if (!port) return;
  await port.markConsumedByChallenge(challengeId);
}

export type { PhoneMessengerBindPort } from "./phoneMessengerBind.ports";
