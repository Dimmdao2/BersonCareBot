import type { MessengerSurfaceHint, PlatformEntry } from "@/shared/lib/platform";

export type AppEntryClassification =
  | "session_ok"
  | "token_exchange"
  | "telegram_miniapp"
  | "max_miniapp"
  | "browser_interactive";

export type UnauthenticatedAppEntryClassification = Exclude<AppEntryClassification, "session_ok">;

/**
 * Server-first классификация входа для `/app`:
 * - miniapp приоритетнее query-токена (в miniapp query JWT не основной канал);
 * - token_exchange только для standalone браузера с `?t=` / `?token=`.
 */
export function classifyUnauthenticatedAppEntry(input: {
  platformEntry: PlatformEntry;
  messengerSurface: MessengerSurfaceHint | null;
  token: string | null;
}): UnauthenticatedAppEntryClassification {
  if (input.platformEntry === "bot") {
    return input.messengerSurface === "max" ? "max_miniapp" : "telegram_miniapp";
  }
  if (input.token && input.token.trim().length > 0) {
    return "token_exchange";
  }
  return "browser_interactive";
}
