import { getConfigBool, getConfigValue } from "@/modules/system-settings/configAdapter";
import type { PatientBusinessGate } from "@/modules/platform-access";
import { patientPathsAllowedDuringPhoneActivation } from "@/modules/platform-access";

export const DEFAULT_PATIENT_MAINTENANCE_MESSAGE =
  "Приложение в разработке, функционал частично недоступен.";

export const DEFAULT_PATIENT_BOOKING_URL = "https://dmitryberson.rubitime.ru";

const PATIENT_MAINTENANCE_MESSAGE_MAX = 500;

export function normalizePatientMaintenanceMessage(raw: string): string {
  const t = raw.trim();
  if (t.length === 0) return DEFAULT_PATIENT_MAINTENANCE_MESSAGE;
  return t.length > PATIENT_MAINTENANCE_MESSAGE_MAX ? t.slice(0, PATIENT_MAINTENANCE_MESSAGE_MAX) : t;
}

/**
 * Normalizes booking URL from DB; empty or invalid → default Rubitime URL.
 */
export function normalizePatientBookingUrl(raw: string): string {
  const t = raw.trim();
  if (t.length === 0) return DEFAULT_PATIENT_BOOKING_URL;
  try {
    const u = new URL(t);
    if (u.protocol === "http:" || u.protocol === "https:") return t;
  } catch {
    /* fall through */
  }
  return DEFAULT_PATIENT_BOOKING_URL;
}

export type PatientMaintenanceConfig = {
  enabled: boolean;
  message: string;
  bookingUrl: string;
};

/**
 * Решение о полной замене patient shell на экран техработ.
 * Гейт по роли `client` остаётся в layout — врач/админ сюда не передаются.
 */
export function patientMaintenanceReplacesPatientShell(
  maintenanceEnabled: boolean,
  skipOverlayForPath: boolean,
): boolean {
  return maintenanceEnabled && !skipOverlayForPath;
}

/**
 * DB-backed patient maintenance flags (scope admin). No env fallbacks for these keys.
 * При выключенном режиме не читает message/booking из БД (одно чтение флага).
 * При включённом — параллельно читает message и URL.
 */
export async function getPatientMaintenanceConfig(): Promise<PatientMaintenanceConfig> {
  const enabled = await getConfigBool("patient_app_maintenance_enabled", false);
  if (!enabled) {
    return {
      enabled: false,
      message: DEFAULT_PATIENT_MAINTENANCE_MESSAGE,
      bookingUrl: DEFAULT_PATIENT_BOOKING_URL,
    };
  }
  const [messageRaw, bookingRaw] = await Promise.all([
    getConfigValue("patient_app_maintenance_message", DEFAULT_PATIENT_MAINTENANCE_MESSAGE),
    getConfigValue("patient_booking_url", DEFAULT_PATIENT_BOOKING_URL),
  ]);
  return {
    enabled: true,
    message: normalizePatientMaintenanceMessage(messageRaw),
    bookingUrl: normalizePatientBookingUrl(bookingRaw),
  };
}

/**
 * Paths that must not be covered by the full-screen maintenance overlay (bind-phone, support, phone-activation allowlist).
 */
export function patientMaintenanceSkipsPath(params: {
  pathname: string;
  gate: PatientBusinessGate;
  legacyNoDatabase: boolean;
  sessionPhoneTrimmed: string | undefined;
}): boolean {
  const pathOnly = params.pathname.trim().split("?")[0] ?? "";
  if (
    pathOnly.startsWith("/app/patient/bind-phone") ||
    pathOnly.startsWith("/app/patient/help") ||
    pathOnly.startsWith("/app/patient/support")
  ) {
    return true;
  }

  if (params.gate === "need_activation" && patientPathsAllowedDuringPhoneActivation(params.pathname)) {
    return true;
  }

  if (
    params.legacyNoDatabase &&
    !params.sessionPhoneTrimmed &&
    patientPathsAllowedDuringPhoneActivation(params.pathname)
  ) {
    return true;
  }

  return false;
}
