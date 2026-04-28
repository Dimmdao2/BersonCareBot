/**
 * Чтение значений `patient_home_morning_ping_*` из `system_settings.value_json` для SSR/UI.
 * Семантика: Phase 8 PATIENT_HOME_REDESIGN_INITIATIVE (глобальная рассылка пациентам).
 */

/** Парсит `patient_home_morning_ping_enabled` из обёртки `{ value }` или примитива. */
export function parsePatientHomeMorningPingEnabled(valueJson: unknown): boolean {
  if (valueJson !== null && typeof valueJson === "object" && "value" in valueJson) {
    const v = (valueJson as { value: unknown }).value;
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return false;
}

/** Парсит `patient_home_morning_ping_local_time` как `HH:MM` в таймзоне приложения; fallback `09:00`. */
export function parsePatientHomeMorningPingLocalTime(valueJson: unknown): string {
  let raw: unknown = valueJson;
  if (valueJson !== null && typeof valueJson === "object" && "value" in valueJson) {
    raw = (valueJson as { value: unknown }).value;
  }
  if (typeof raw !== "string") return "09:00";
  const t = raw.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return "09:00";
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}
