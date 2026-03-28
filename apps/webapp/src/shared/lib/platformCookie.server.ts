import { cookies } from "next/headers";
import type { PlatformEntry } from "@/shared/lib/platform";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

/** Читает cookie платформы, установленную middleware (`?ctx=bot`) или клиентом (fallback Mini App). */
export async function getPlatformEntry(): Promise<PlatformEntry> {
  const store = await cookies();
  return store.get(PLATFORM_COOKIE_NAME)?.value === "bot" ? "bot" : "standalone";
}
