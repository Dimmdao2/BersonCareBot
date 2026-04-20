import type { MessengerSurfaceHint, PlatformEntry } from "@/shared/lib/platform";

export type AppEntryClassification =
  | "session_ok"
  | "token_exchange"
  | "telegram_miniapp"
  | "max_miniapp"
  | "browser_interactive";

export type UnauthenticatedAppEntryClassification = Exclude<AppEntryClassification, "session_ok">;

export function isDevBypassToken(token: string | null | undefined): boolean {
  return (token ?? "").trim().startsWith("dev:");
}

export function shouldAllowStandaloneTokenExchange(input: {
  token: string | null;
  switchParam?: string | null;
}): boolean {
  const token = input.token?.trim() || "";
  if (!token) return false;
  if (!isDevBypassToken(token)) return true;
  return (input.switchParam ?? "").trim() === "1";
}

/**
 * Server-first классификация входа для `/app`:
 * - miniapp приоритетнее query-токена (в miniapp query JWT не основной канал);
 * - token_exchange только для standalone браузера с `?t=` / `?token=`.
 */
export function classifyUnauthenticatedAppEntry(input: {
  platformEntry: PlatformEntry;
  messengerSurface: MessengerSurfaceHint | null;
  token: string | null;
  allowStandaloneTokenExchange?: boolean;
}): UnauthenticatedAppEntryClassification {
  if (input.platformEntry === "bot") {
    return input.messengerSurface === "max" ? "max_miniapp" : "telegram_miniapp";
  }
  if (input.allowStandaloneTokenExchange !== false && input.token && input.token.trim().length > 0) {
    return "token_exchange";
  }
  return "browser_interactive";
}
