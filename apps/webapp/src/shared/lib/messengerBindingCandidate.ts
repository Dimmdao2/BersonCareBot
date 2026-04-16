/**
 * Сохранение «позднего» initData как сигнала для post-auth binding / восстановления сессии в Mini App,
 * когда интерактивный вход уже начат и auto `telegram-init` / `max-init` из bootstrap намеренно не вызывается.
 * Данные только в sessionStorage текущего origin; не логируем строку целиком.
 */

const STORAGE_KEY = "bersoncare_messenger_binding_candidate_v1";
const MAX_AGE_MS = 45 * 60 * 1000;

export type MessengerBindingCandidateChannel = "telegram" | "max";

export type MessengerBindingCandidateStored = {
  v: 1;
  channel: MessengerBindingCandidateChannel;
  initData: string;
  savedAt: number;
  correlationId?: string | null;
};

function parseStored(raw: string | null): MessengerBindingCandidateStored | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<MessengerBindingCandidateStored>;
    if (o?.v !== 1) return null;
    if (o.channel !== "telegram" && o.channel !== "max") return null;
    if (typeof o.initData !== "string" || o.initData.trim().length === 0) return null;
    if (typeof o.savedAt !== "number" || !Number.isFinite(o.savedAt)) return null;
    return {
      v: 1,
      channel: o.channel,
      initData: o.initData.trim(),
      savedAt: o.savedAt,
      correlationId: typeof o.correlationId === "string" ? o.correlationId : null,
    };
  } catch {
    return null;
  }
}

export function persistMessengerBindingCandidate(input: {
  channel: MessengerBindingCandidateChannel;
  initData: string;
  correlationId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const initData = input.initData.trim();
  if (!initData) return;
  const payload: MessengerBindingCandidateStored = {
    v: 1,
    channel: input.channel,
    initData,
    savedAt: Date.now(),
    correlationId: input.correlationId ?? null,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readMessengerBindingCandidate(): MessengerBindingCandidateStored | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  const parsed = parseStored(raw);
  if (!parsed) return null;
  if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
    clearMessengerBindingCandidate();
    return null;
  }
  return parsed;
}

export function clearMessengerBindingCandidate(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
