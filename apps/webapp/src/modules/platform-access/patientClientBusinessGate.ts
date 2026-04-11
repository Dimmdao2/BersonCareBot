import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import type { AppSession } from "@/shared/types/session";
import { resolvePlatformAccessContext } from "./resolvePlatformAccessContext";

export type PatientBusinessGate = "allow" | "need_activation" | "stale_session";

/**
 * Для `client`: при наличии `DATABASE_URL` — только `tier === "patient"` (`resolvePlatformAccessContext`);
 * иначе onboarding / legacy cookie не проходят (DoD §2 / SPEC §4). При ошибке БД — **fail-safe** `need_activation` (не поднимать доступ по snapshot при неизвестном tier).
 * Для прочих ролей — `allow` (их политика — отдельные guards).
 */
export async function patientClientBusinessGate(session: AppSession): Promise<PatientBusinessGate> {
  if (session.user.role !== "client") return "allow";

  if (env.DATABASE_URL?.trim()) {
    try {
      const ctx = await resolvePlatformAccessContext(getPool(), {
        sessionUserId: session.user.userId,
        sessionRoleHint: session.user.role,
      });
      if (ctx.resolution === "session_user_missing") return "stale_session";
      if (ctx.tier !== "patient") return "need_activation";
      return "allow";
    } catch {
      return "need_activation";
    }
  }

  return session.user.phone?.trim() ? "allow" : "need_activation";
}
