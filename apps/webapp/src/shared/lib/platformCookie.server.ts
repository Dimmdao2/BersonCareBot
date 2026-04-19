import { cookies } from "next/headers";
import type { MessengerSurfaceHint, PlatformEntry } from "@/shared/lib/platform";
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

/** Читает cookie платформы, установленную middleware (`?ctx=bot`) или клиентом (fallback Mini App). */
export async function getPlatformEntry(): Promise<PlatformEntry> {
  const store = await cookies();
  return store.get(PLATFORM_COOKIE_NAME)?.value === "bot" ? "bot" : "standalone";
}

/** Канал mini app после `?ctx=bot|max` (middleware); иначе `null` (прямой заход без параметра). */
export async function getMessengerSurfaceHint(): Promise<MessengerSurfaceHint | null> {
  const store = await cookies();
  const raw = store.get(MESSENGER_SURFACE_COOKIE_NAME)?.value;
  return raw === "max" || raw === "telegram" ? raw : null;
}
