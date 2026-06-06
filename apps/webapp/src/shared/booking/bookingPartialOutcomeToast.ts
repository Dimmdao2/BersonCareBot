import toast from "react-hot-toast";
import type { PatientBookingPartialOutcome } from "@/modules/patient-booking/types";

export function parsePatientBookingPartialOutcome(
  json: Record<string, unknown>,
): PatientBookingPartialOutcome | undefined {
  if (json.rubitimeMirrorFailed === true) {
    return { rubitimeMirrorFailed: true };
  }
  return undefined;
}

export function showBookingPartialOutcomeToast(partial: PatientBookingPartialOutcome | undefined): void {
  if (!partial?.rubitimeMirrorFailed) return;
  toast("Запись обновлена. Синхронизация с расписанием может занять время.", {
    icon: "⚠️",
    style: {
      background: "rgb(254 243 199)",
      color: "rgb(146 64 14)",
    },
  });
}
