import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { AppSession } from "@/shared/types/session";
import { resolvePlatformAccessContext } from "./resolvePlatformAccessContext";

/**
 * Tier **patient** (доверенный телефон) — может смотреть разделы/страницы с `requires_auth`.
 * Onboarding без tier и гости — только публичные (`requires_auth = false`).
 */
export async function resolvePatientCanViewAuthOnlyContent(session: AppSession | null): Promise<boolean> {
  if (!session?.user || session.user.role !== "client") {
    return false;
  }
  if (!env.DATABASE_URL?.trim()) {
    return Boolean(session.user.phone?.trim());
  }
  try {
    const ctx = await resolvePlatformAccessContext(getPool(), {
      sessionUserId: session.user.userId,
      sessionRoleHint: session.user.role,
    });
    return ctx.tier === "patient";
  } catch {
    return false;
  }
}
