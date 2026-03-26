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
 * Роль из env: Telegram / Max ID (ADMIN_TELEGRAM_ID, DOCTOR_TELEGRAM_IDS, ADMIN_MAX_IDS, DOCTOR_MAX_IDS)
 * и номера (ADMIN_PHONES / DOCTOR_PHONES после normalizePhone).
 * Приоритет: admin (telegram → max → phone) → doctor (telegram → max → phone) → client.
 */
export function resolveRoleFromEnv(ids: { phone?: string; telegramId?: string; maxId?: string }): UserRole {
  const tid = ids.telegramId?.trim();
  if (tid) {
    if (typeof env.ADMIN_TELEGRAM_ID === "number" && String(env.ADMIN_TELEGRAM_ID) === tid) {
      return "admin";
    }
  }

  const mid = ids.maxId?.trim();
  if (mid) {
    for (const s of (env.ADMIN_MAX_IDS ?? "").split(",")) {
      if (s.trim() === mid) return "admin";
    }
  }

  if (phoneInEnvList(ids.phone, env.ADMIN_PHONES ?? "")) return "admin";

  if (tid) {
    for (const s of (env.DOCTOR_TELEGRAM_IDS ?? "").split(",")) {
      if (s.trim() === tid) return "doctor";
    }
  }

  if (mid) {
    for (const s of (env.DOCTOR_MAX_IDS ?? "").split(",")) {
      if (s.trim() === mid) return "doctor";
    }
  }

  if (phoneInEnvList(ids.phone, env.DOCTOR_PHONES ?? "")) return "doctor";
  return "client";
}
