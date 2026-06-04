/**
 * Persisted pending state for registration verify / password reset on the login surface.
 * Пароль намеренно не храним — только идентификаторы и подсказки cooldown.
 */

const STORAGE_KEY = "bc_auth_flow_pending_v1";

export type AuthFlowPendingStored =
  | {
      v: 1;
      mode: "register_verify";
      email: string;
      challengeId: string;
      attemptId?: string;
      retryAfterSeconds: number;
      savedAt: number;
      /** Отображение и resend через API */
      displayName: string;
    }
  | {
      v: 1;
      mode: "password_reset";
      email: string;
      retryAfterSeconds: number;
      savedAt: number;
      /** Если клиент уже знает challenge (редко — forgot не возвращает id) */
      challengeId?: string;
    };

function readRaw(): AuthFlowPendingStored | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return null;
    const o = JSON.parse(raw) as Partial<AuthFlowPendingStored>;
    if (o.v !== 1 || (o.mode !== "register_verify" && o.mode !== "password_reset")) return null;
    if (o.mode === "register_verify") {
      if (
        typeof o.email !== "string" ||
        typeof o.challengeId !== "string" ||
        typeof o.retryAfterSeconds !== "number" ||
        typeof o.displayName !== "string"
      ) {
        return null;
      }
    } else if (o.mode === "password_reset") {
      if (typeof o.email !== "string" || typeof o.retryAfterSeconds !== "number") return null;
    }
    const maxAgeMs = 1000 * 60 * 60 * 72;
    if (typeof o.savedAt !== "number" || Date.now() - o.savedAt > maxAgeMs) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return o as AuthFlowPendingStored;
  } catch {
    return null;
  }
}

export function readAuthFlowPending(): AuthFlowPendingStored | null {
  return readRaw();
}

export function clearAuthFlowPending(): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveRegisterVerifyPending(
  input: Omit<Extract<AuthFlowPendingStored, { mode: "register_verify" }>, "v" | "savedAt" | "mode">
): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  const payload: AuthFlowPendingStored = {
    v: 1,
    mode: "register_verify",
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function patchRegisterVerifyChallenge(challengeId: string, retryAfterSeconds: number): void {
  const cur = readRaw();
  if (!cur || cur.mode !== "register_verify") return;
  saveRegisterVerifyPending({
    email: cur.email,
    challengeId,
    retryAfterSeconds,
    displayName: cur.displayName,
  });
}

export function savePasswordResetPending(
  input: Omit<Extract<AuthFlowPendingStored, { mode: "password_reset" }>, "v" | "savedAt" | "mode">
): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  const payload: AuthFlowPendingStored = {
    v: 1,
    mode: "password_reset",
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
