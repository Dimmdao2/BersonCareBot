import type { AppSession } from "@/shared/types/session";

export function getCurrentUser(session: AppSession | null) {
  return session?.user ?? null;
}
