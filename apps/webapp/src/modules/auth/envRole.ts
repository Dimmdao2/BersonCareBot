import { env } from "@/config/env";
import type { UserRole } from "@/shared/types/session";
import { normalizePhone } from "./phoneAuth";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

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

/** Parse a JSON array of strings from a system_settings value_json string. */
function parseIdListFromDbValue(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
  } catch {
    // raw is a plain comma-separated string fallback
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function idInList(id: string, list: string[]): boolean {
  return list.some((s) => s.trim() === id.trim());
}

function phoneInList(phone: string | undefined, list: string[]): boolean {
  if (!phone?.trim()) return false;
  const n = normalizePhone(phone);
  return list.some((s) => {
    const t = s.trim();
    return t && normalizePhone(t) === n;
  });
}

/**
 * Async role resolver: DB (system_settings) → env fallback.
 * Uses configAdapter (60s TTL cache). Falls back to resolveRoleFromEnv on any error.
 * Priority: admin (telegram → max → phone) → doctor (telegram → max → phone) → client.
 */
export async function resolveRoleAsync(ids: {
  phone?: string;
  telegramId?: string;
  maxId?: string;
}): Promise<UserRole> {
  try {
    const [
      adminTelegramRaw,
      adminMaxRaw,
      adminPhonesRaw,
      doctorTelegramRaw,
      doctorMaxRaw,
      doctorPhonesRaw,
    ] = await Promise.all([
      getConfigValue("admin_telegram_ids", String(env.ADMIN_TELEGRAM_ID ?? "")),
      getConfigValue("admin_max_ids", env.ADMIN_MAX_IDS ?? ""),
      getConfigValue("admin_phones", env.ADMIN_PHONES ?? ""),
      getConfigValue("doctor_telegram_ids", env.DOCTOR_TELEGRAM_IDS ?? ""),
      getConfigValue("doctor_max_ids", env.DOCTOR_MAX_IDS ?? ""),
      getConfigValue("doctor_phones", env.DOCTOR_PHONES ?? ""),
    ]);

    const adminTelegramIds = parseIdListFromDbValue(adminTelegramRaw);
    const adminMaxIds = parseIdListFromDbValue(adminMaxRaw);
    const adminPhones = parseIdListFromDbValue(adminPhonesRaw);
    const doctorTelegramIds = parseIdListFromDbValue(doctorTelegramRaw);
    const doctorMaxIds = parseIdListFromDbValue(doctorMaxRaw);
    const doctorPhones = parseIdListFromDbValue(doctorPhonesRaw);

    const tid = ids.telegramId?.trim() ?? "";
    const mid = ids.maxId?.trim() ?? "";

    if (tid && idInList(tid, adminTelegramIds)) return "admin";
    if (mid && idInList(mid, adminMaxIds)) return "admin";
    if (phoneInList(ids.phone, adminPhones)) return "admin";
    if (tid && idInList(tid, doctorTelegramIds)) return "doctor";
    if (mid && idInList(mid, doctorMaxIds)) return "doctor";
    if (phoneInList(ids.phone, doctorPhones)) return "doctor";

    return "client";
  } catch {
    return resolveRoleFromEnv(ids);
  }
}

/**
 * Async whitelist checker: are these IDs whitelisted for webapp entry?
 * Checks allowed_telegram_ids, allowed_max_ids, allowed_phones + all role lists.
 */
export async function isWhitelistedAsync(ids: {
  phone?: string;
  telegramId?: string;
  maxId?: string;
}): Promise<boolean> {
  try {
    const role = await resolveRoleAsync(ids);
    if (role === "admin" || role === "doctor") return true;

    const [allowedTelegramRaw, allowedMaxRaw, allowedPhonesRaw] = await Promise.all([
      getConfigValue("allowed_telegram_ids", env.ALLOWED_TELEGRAM_IDS ?? ""),
      getConfigValue("allowed_max_ids", env.ALLOWED_MAX_IDS ?? ""),
      getConfigValue("allowed_phones", env.ALLOWED_PHONES ?? ""),
    ]);

    const allowedTelegram = parseIdListFromDbValue(allowedTelegramRaw);
    const allowedMax = parseIdListFromDbValue(allowedMaxRaw);
    const allowedPhones = parseIdListFromDbValue(allowedPhonesRaw);

    const tid = ids.telegramId?.trim() ?? "";
    const mid = ids.maxId?.trim() ?? "";

    if (tid && idInList(tid, allowedTelegram)) return true;
    if (mid && idInList(mid, allowedMax)) return true;
    if (phoneInList(ids.phone, allowedPhones)) return true;

    return false;
  } catch {
    return false;
  }
}
