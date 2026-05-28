import { randomBytes, randomUUID } from "node:crypto";
import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "./channelContext";
import type { PhoneChallengeStore } from "./phoneChallengeStore";
import type { PhoneOtpDelivery, SmsPort } from "./smsPort";
import type { UserByPhonePort } from "./userByPhonePort";
import { getRedirectPathForRole } from "./redirectPolicy";
import { normalizePhone } from "./phoneNormalize";
import { isValidPhoneE164 } from "./phoneValidation";
import { assertPhoneCanStartChallenge } from "./phoneOtpLimits";
import { generateSmsCode } from "./smsCode";

export { normalizePhone } from "./phoneNormalize";

const CHALLENGE_TTL_SEC = 600; // 10 min

/** Default context when challenge has no channelContext (e.g. legacy or web-only flow). */
function defaultWebContext(): ChannelContext {
  return { channel: "web", chatId: randomUUID(), displayName: undefined };
}

export type PhoneAuthDeps = {
  smsPort: SmsPort;
  challengeStore: PhoneChallengeStore;
  userByPhonePort: UserByPhonePort;
};

export type StartPhoneAuthResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: string; retryAfterSeconds?: number };

export type ConfirmPhoneAuthResult =
  | {
      ok: true;
      user: SessionUser;
      redirectTo: string;
      deliveryChannel?: "sms" | "telegram" | "max" | "email";
      wasCreated: boolean;
      registrationAttemptId?: string;
    }
  | { ok: false; code: string; retryAfterSeconds?: number };

export type StartPhoneAuthOptions = {
  delivery?: PhoneOtpDelivery;
  registrationAttemptId?: string;
  isRegistrationIntent?: boolean;
};

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

/** Создаёт OTP-челлендж без отправки (код возвращается вызывающему для кастомного сообщения бота). */
export async function createPhoneOtpChallenge(
  phone: string,
  context: ChannelContext,
  deps: PhoneAuthDeps,
  options?: Pick<StartPhoneAuthOptions, "registrationAttemptId" | "isRegistrationIntent">,
): Promise<
  | { ok: true; challengeId: string; code: string; retryAfterSeconds?: number }
  | { ok: false; code: string; retryAfterSeconds?: number }
> {
  const normalized = normalizePhone(phone);
  if (!isValidPhoneE164(normalized)) {
    return { ok: false, code: "invalid_phone" };
  }

  const gate = await assertPhoneCanStartChallenge(normalized);
  if (gate.ok !== true) {
    return {
      ok: false,
      code: gate.code,
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }

  await deps.challengeStore.deleteByPhone?.(normalized);

  const challengeId = generateChallengeId();
  const code = generateSmsCode();
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;

  await deps.challengeStore.set(challengeId, {
    phone: normalized,
    expiresAt,
    code,
    verifyAttempts: 0,
    deliveryChannel:
      context.channel === "telegram" || context.channel === "max" ? context.channel : "telegram",
    channelContext: context,
    ...(options?.registrationAttemptId?.trim()
      ? { registrationAttemptId: options.registrationAttemptId.trim() }
      : {}),
    ...(options?.isRegistrationIntent === true ? { isRegistrationIntent: true } : {}),
  });

  return { ok: true, challengeId, code, retryAfterSeconds: 60 };
}

export async function startPhoneAuth(
  phone: string,
  context: ChannelContext,
  deps: PhoneAuthDeps,
  options?: StartPhoneAuthOptions
): Promise<StartPhoneAuthResult> {
  const normalized = normalizePhone(phone);
  if (!isValidPhoneE164(normalized)) {
    return { ok: false, code: "invalid_phone" };
  }

  const sendResult = await deps.smsPort.sendCode(normalized, CHALLENGE_TTL_SEC, options?.delivery);
  if (!sendResult.ok) {
    return {
      ok: false,
      code: sendResult.code,
      retryAfterSeconds: sendResult.retryAfterSeconds,
    };
  }

  const existing = await deps.challengeStore.get(sendResult.challengeId);
  if (existing) {
    await deps.challengeStore.set(sendResult.challengeId, {
      ...existing,
      channelContext: context,
      ...(options?.registrationAttemptId?.trim()
        ? { registrationAttemptId: options.registrationAttemptId.trim() }
        : {}),
      ...(options?.isRegistrationIntent === true ? { isRegistrationIntent: true } : {}),
    });
  }

  return {
    ok: true,
    challengeId: sendResult.challengeId,
    retryAfterSeconds: sendResult.retryAfterSeconds,
  };
}

/**
 * Confirms phone code. Channel context is taken only from the challenge (set at start);
 * request body must not supply channel/chatId/displayName for binding.
 */
export async function confirmPhoneAuth(
  challengeId: string,
  code: string,
  deps: PhoneAuthDeps
): Promise<ConfirmPhoneAuthResult> {
  const challenge = await deps.challengeStore.get(challengeId);
  if (!challenge) {
    return { ok: false, code: "expired_code" };
  }

  const deliveryChannel = challenge.deliveryChannel ?? "sms";

  const verifyResult = await deps.smsPort.verifyCode(challengeId, code);
  if (!verifyResult.ok) {
    return {
      ok: false,
      code: verifyResult.code,
      retryAfterSeconds: verifyResult.retryAfterSeconds,
    };
  }

  const context = challenge.channelContext ?? defaultWebContext();
  const bindResult = await deps.userByPhonePort.createOrBind(challenge.phone, context);
  return {
    ok: true,
    user: bindResult.user,
    redirectTo: getRedirectPathForRole(bindResult.user.role),
    deliveryChannel,
    wasCreated: bindResult.wasCreated,
    registrationAttemptId: challenge.registrationAttemptId,
  };
}

/** Удаляет OTP-челлендж после успешного confirm (verify + bind + post-steps). */
export async function consumePhoneOtpChallenge(
  challengeId: string,
  deps: Pick<PhoneAuthDeps, "challengeStore">,
): Promise<void> {
  await deps.challengeStore.delete(challengeId);
}
