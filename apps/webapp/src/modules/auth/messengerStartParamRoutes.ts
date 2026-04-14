import { routePaths } from "@/app-layer/routes/paths";
import { isSafeNext } from "@/modules/auth/redirectPolicy";

/**
 * Маппинг `start_param` / deep-link token из Mini App в безопасный путь `/app/patient/...`.
 * Ключи — без регистра; допускается полный путь, если он проходит `isSafeNext`.
 */
const START_PARAM_TO_PATH: Record<string, string> = {
  booking: routePaths.patientBooking,
  booking_new: routePaths.bookingNew,
  booking_city: routePaths.bookingNewCity,
  booking_service: routePaths.bookingNewService,
  booking_slot: routePaths.bookingNewSlot,
  booking_confirm: routePaths.bookingNewConfirm,
  cabinet: routePaths.cabinet,
  profile: routePaths.profile,
  messages: routePaths.patientMessages,
  support: routePaths.patientSupport,
  help: routePaths.patientHelp,
  install: routePaths.patientInstall,
  reminders: routePaths.patientReminders,
  notifications: routePaths.notifications,
  diary: routePaths.diary,
  lessons: routePaths.lessons,
  emergency: routePaths.emergency,
  intake_lfk: routePaths.intakeLfk,
  intake_nutrition: routePaths.intakeNutrition,
};

/**
 * Возвращает безопасный внутренний путь или `null`, если маппинг не задан / путь небезопасен.
 */
export function mapMaxStartParamToPatientPath(startParam: string | undefined): string | null {
  if (startParam == null) return null;
  const key = startParam.trim();
  if (!key) return null;

  if (key.startsWith("/")) {
    return isSafeNext(key) ? key : null;
  }

  const normalized = key.toLowerCase().replace(/-/g, "_");
  const mapped = START_PARAM_TO_PATH[normalized];
  if (mapped && isSafeNext(mapped)) return mapped;
  return null;
}
