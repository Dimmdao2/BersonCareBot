import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "./channelContext";
import type { PhoneChallengeStore } from "./phoneChallengeStore";
import type { SmsPort } from "./smsPort";
import type { UserByPhonePort } from "./userByPhonePort";
import { getRedirectPathForRole } from "./redirectPolicy";
import { normalizePhone } from "./phoneNormalize";

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
  | { ok: true; user: SessionUser; redirectTo: string }
  | { ok: false; code: string; retryAfterSeconds?: number };

export async function startPhoneAuth(
  phone: string,
  context: ChannelContext,
  deps: PhoneAuthDeps
): Promise<StartPhoneAuthResult> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) {
    return { ok: false, code: "invalid_phone" };
  }

  const sendResult = await deps.smsPort.sendCode(normalized, CHALLENGE_TTL_SEC);
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

  const verifyResult = await deps.smsPort.verifyCode(challengeId, code);
  if (!verifyResult.ok) {
    return {
      ok: false,
      code: verifyResult.code,
      retryAfterSeconds: verifyResult.retryAfterSeconds,
    };
  }

  await deps.challengeStore.delete(challengeId);

  const context = challenge.channelContext ?? defaultWebContext();
  const user = await deps.userByPhonePort.createOrBind(challenge.phone, context);
  return { ok: true, user, redirectTo: getRedirectPathForRole(user.role) };
}
