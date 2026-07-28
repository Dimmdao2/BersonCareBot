import { createHash } from "node:crypto";
import { getAuthRateLimitDbPort } from "@/modules/auth/authRateLimits";

const IDENTIFIER_FAILURE_SCOPE = "auth.password_identifier_failure";
const IDENTIFIER_LOCK_SCOPE = "auth.password_identifier_lock";
const ACCOUNT_FAILURE_SCOPE = "auth.password_account_failure";
const LOCK_MS = 15 * 60 * 1000;
const FAILURE_WINDOW_MS = LOCK_MS;

export const PASSWORD_LOCK_ATTEMPTS = 10;
export const PASSWORD_LOCK_SECONDS = LOCK_MS / 1000;

type MemoryEvent = { failures: number[]; lockedAt: number | null };
const memoryEvents = new Map<string, MemoryEvent>();

export type PasswordFailureState = {
  attempts: number;
  delaySeconds: number;
  locked: boolean;
  retryAfterSeconds?: number;
};

export type PasswordVerificationResult =
  | { ok: true; userId: string; emailVerified: boolean }
  | ({ ok: false; accountUserId?: string } & PasswordFailureState);

function isUnboundPortError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("AuthRateLimitDbPort is not bound.");
}

function identifierKey(emailNormalized: string): string {
  return `password-email:v1:${createHash("sha256").update(emailNormalized).digest("hex")}`;
}

/** Stable non-account UUID so unknown identifiers take the same principal/account-write path. */
export function passwordFailurePrincipalId(emailNormalized: string): string {
  const hex = createHash("sha256").update(`password-principal:v1:${emailNormalized}`).digest("hex");
  const chars = hex.slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function passwordFailureDelaySeconds(attempts: number): number {
  if (attempts < 5 || attempts >= PASSWORD_LOCK_ATTEMPTS) return 0;
  return 30 * (2 ** (attempts - 5));
}

function memoryState(key: string, now = Date.now()): MemoryEvent {
  const previous = memoryEvents.get(key) ?? { failures: [], lockedAt: null };
  const lockedAt =
    previous.lockedAt !== null && previous.lockedAt + LOCK_MS > now
      ? previous.lockedAt
      : null;
  const failures = previous.failures.filter((at) => at > now - FAILURE_WINDOW_MS);
  const next = { failures, lockedAt };
  memoryEvents.set(key, next);
  return next;
}

function memoryInspect(key: string): PasswordFailureState | null {
  const now = Date.now();
  const state = memoryState(key, now);
  if (state.lockedAt === null) return null;
  return {
    attempts: PASSWORD_LOCK_ATTEMPTS,
    delaySeconds: 0,
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((state.lockedAt + LOCK_MS - now) / 1000)),
  };
}

function memoryRecordFailure(key: string): PasswordFailureState {
  const now = Date.now();
  const state = memoryState(key, now);
  if (state.lockedAt !== null) return memoryInspect(key)!;
  state.failures = state.failures.map(() => now);
  state.failures.push(now);
  const attempts = state.failures.length;
  if (attempts >= PASSWORD_LOCK_ATTEMPTS) {
    state.failures = [];
    state.lockedAt = now;
    return {
      attempts: PASSWORD_LOCK_ATTEMPTS,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: PASSWORD_LOCK_SECONDS,
    };
  }
  return {
    attempts,
    delaySeconds: passwordFailureDelaySeconds(attempts),
    locked: false,
  };
}

/** Read-only lock gate shared by real and nonexistent email identifiers. */
export async function inspectPasswordIdentifierLock(
  emailNormalized: string,
): Promise<PasswordFailureState | null> {
  const key = identifierKey(emailNormalized);
  try {
    const activeLocks = await getAuthRateLimitDbPort().countActive({
      scope: IDENTIFIER_LOCK_SCOPE,
      key,
      windowMs: LOCK_MS,
    });
    if (activeLocks === 0) return null;
    return {
      attempts: PASSWORD_LOCK_ATTEMPTS,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: PASSWORD_LOCK_SECONDS,
    };
  } catch (error) {
    if (!isUnboundPortError(error)) throw error;
    return memoryInspect(key);
  }
}

/** Account-keyed lock gate. Unlike the identifier gate, it survives a verified email change. */
export async function inspectPasswordAccountLock(
  accountPrincipalId: string,
): Promise<PasswordFailureState | null> {
  const activeFailures = await getAuthRateLimitDbPort().countActive({
    scope: ACCOUNT_FAILURE_SCOPE,
    key: accountPrincipalId,
    windowMs: LOCK_MS,
  });
  if (activeFailures < PASSWORD_LOCK_ATTEMPTS) return null;
  return {
    attempts: PASSWORD_LOCK_ATTEMPTS,
    delaySeconds: 0,
    locked: true,
    retryAfterSeconds: PASSWORD_LOCK_SECONDS,
  };
}

/** Records an indistinguishable failed identifier attempt and derives the accepted backoff. */
export async function recordPasswordIdentifierFailure(
  emailNormalized: string,
): Promise<PasswordFailureState> {
  const key = identifierKey(emailNormalized);
  const db = getAuthRateLimitDbPort();
  try {
    const recorded = await db.recordAndCount({
      scope: IDENTIFIER_FAILURE_SCOPE,
      key,
      windowMs: FAILURE_WINDOW_MS,
      maxPerWindow: PASSWORD_LOCK_ATTEMPTS,
    });
    const attempts = Math.min(PASSWORD_LOCK_ATTEMPTS, recorded.attempts);
    if (attempts >= PASSWORD_LOCK_ATTEMPTS) {
      await db.reset({ scope: IDENTIFIER_FAILURE_SCOPE, key });
      await db.recordAndCount({
        scope: IDENTIFIER_LOCK_SCOPE,
        key,
        windowMs: LOCK_MS,
        maxPerWindow: 1,
      });
      return {
        attempts: PASSWORD_LOCK_ATTEMPTS,
        delaySeconds: 0,
        locked: true,
        retryAfterSeconds: PASSWORD_LOCK_SECONDS,
      };
    }
    return {
      attempts,
      delaySeconds: passwordFailureDelaySeconds(attempts),
      locked: false,
    };
  } catch (error) {
    if (!isUnboundPortError(error)) throw error;
    return memoryRecordFailure(key);
  }
}

export async function resetPasswordIdentifierFailures(emailNormalized: string): Promise<void> {
  const key = identifierKey(emailNormalized);
  memoryEvents.delete(key);
  const db = getAuthRateLimitDbPort();
  await Promise.all([
    db.reset({ scope: IDENTIFIER_FAILURE_SCOPE, key }),
    db.reset({ scope: IDENTIFIER_LOCK_SCOPE, key }),
  ]);
}

export async function recordPasswordAccountFailure(userId: string): Promise<void> {
  await getAuthRateLimitDbPort().recordAndCount({
    scope: ACCOUNT_FAILURE_SCOPE,
    key: userId,
    windowMs: FAILURE_WINDOW_MS,
    maxPerWindow: 100,
  });
}

export async function resetPasswordAccountFailureEvents(userId: string): Promise<void> {
  await getAuthRateLimitDbPort().reset({ scope: ACCOUNT_FAILURE_SCOPE, key: userId });
}

export async function waitForPasswordFailureDelay(delaySeconds: number): Promise<void> {
  if (delaySeconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delaySeconds * 1000));
}

export function resetPasswordLoginProtectionMemoryForTests(): void {
  memoryEvents.clear();
}
