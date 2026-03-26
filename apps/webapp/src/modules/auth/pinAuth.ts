import type { UserPinsPort } from "./userPinsPort";
import { verifyPinAgainstHash } from "./pinHash";

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

const PIN_DIGITS_RE = /^\d{4}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_DIGITS_RE.test(pin);
}

export type PinLoginVerifyResult =
  | { ok: true }
  | {
      ok: false;
      code: "no_pin" | "locked" | "invalid_pin";
      attemptsLeft?: number;
      lockedUntilIso?: string;
    };

export async function verifyPinForLogin(
  userId: string,
  pin: string,
  pinsPort: UserPinsPort
): Promise<PinLoginVerifyResult> {
  let row = await pinsPort.getByUserId(userId);
  if (!row) {
    return { ok: false, code: "no_pin" };
  }

  const now = new Date();
  if (row.lockedUntil && row.lockedUntil.getTime() <= now.getTime()) {
    await pinsPort.resetAttempts(userId);
    row = await pinsPort.getByUserId(userId);
    if (!row) {
      return { ok: false, code: "no_pin" };
    }
  }

  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      code: "locked",
      lockedUntilIso: row.lockedUntil.toISOString(),
    };
  }

  const match = await verifyPinAgainstHash(pin, row.pinHash);
  if (match) {
    await pinsPort.resetAttempts(userId);
    return { ok: true };
  }

  const after = await pinsPort.incrementFailed(userId, PIN_MAX_ATTEMPTS, PIN_LOCK_MINUTES);
  if (after.lockedUntil && after.attemptsFailed >= PIN_MAX_ATTEMPTS) {
    return {
      ok: false,
      code: "locked",
      attemptsLeft: 0,
      lockedUntilIso: after.lockedUntil.toISOString(),
    };
  }

  return {
    ok: false,
    code: "invalid_pin",
    attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - after.attemptsFailed),
  };
}
