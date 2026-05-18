export const PUSH_PROMPT_DISMISSED_STORAGE_KEY = "bersoncare_push_prompt_dismissed_at";

/** Days before showing the standalone onboarding card again after «Не сейчас». */
export const PUSH_PROMPT_DISMISS_COOLDOWN_DAYS = 14;

export function readPushPromptDismissedAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PUSH_PROMPT_DISMISSED_STORAGE_KEY);
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writePushPromptDismissedAt(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUSH_PROMPT_DISMISSED_STORAGE_KEY, iso);
  } catch {
    /* ignore quota / private mode */
  }
}

export function isPushPromptDismissalActive(dismissedAtIso: string | null, now: Date, cooldownDays: number): boolean {
  if (!dismissedAtIso) return false;
  const dismissedAt = Date.parse(dismissedAtIso);
  if (Number.isNaN(dismissedAt)) return false;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  return now.getTime() - dismissedAt < cooldownMs;
}
