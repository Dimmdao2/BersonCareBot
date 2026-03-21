import { env } from "@/config/env";
import type { UserRole } from "@/shared/types/session";
import { normalizePhone } from "./phoneAuth";

/** Нормализованные номера из env (whitelist для входа по телефону в токене). */
export function getNormalizedWhitelistedPhonesFromEnv(): Set<string> {
  const set = new Set<string>();
  for (const raw of [env.ADMIN_PHONES, env.DOCTOR_PHONES, env.ALLOWED_PHONES]) {
    for (const s of (raw ?? "").split(",")) {
      const t = s.trim();
      if (t) set.add(normalizePhone(t));
    }
  }
  return set;
}

function phoneInEnvList(phone: string | undefined, listRaw: string): boolean {
  if (!phone?.trim()) return false;
  const n = normalizePhone(phone);
  for (const s of listRaw.split(",")) {
    const t = s.trim();
    if (!t) continue;
    if (normalizePhone(t) === n) return true;
  }
  return false;
}

/**
 * Роль из env только по номеру телефона (совпадение после normalizePhone).
 * Приоритет: admin > doctor > client.
 * Telegram / Max ID в env для роли не используются.
 */
export function resolveRoleFromEnv(ids: { phone?: string }): UserRole {
  if (phoneInEnvList(ids.phone, env.ADMIN_PHONES ?? "")) return "admin";
  if (phoneInEnvList(ids.phone, env.DOCTOR_PHONES ?? "")) return "doctor";
  return "client";
}
