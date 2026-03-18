import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "./channelContext";
import type { PhoneChallengeStore } from "./phoneChallengeStore";
import type { SmsPort } from "./smsPort";
import type { UserByPhonePort } from "./userByPhonePort";

const CHALLENGE_TTL_SEC = 600; // 10 min

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length >= 10 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+7${digits}`;
  return `+${digits}`;
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
  _context: ChannelContext,
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

  return {
    ok: true,
    challengeId: sendResult.challengeId,
    retryAfterSeconds: sendResult.retryAfterSeconds,
  };
}

export async function confirmPhoneAuth(
  challengeId: string,
  code: string,
  context: ChannelContext,
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

  const user = await deps.userByPhonePort.createOrBind(challenge.phone, context);
  const redirectTo = user.role === "doctor" || user.role === "admin" ? "/app/doctor" : "/app/patient";

  return { ok: true, user, redirectTo };
}
