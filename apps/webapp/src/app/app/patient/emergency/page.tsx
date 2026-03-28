import { redirect } from "next/navigation";

/** Обратная совместимость: старый URL ведёт на динамический раздел. */
export default function PatientEmergencyLegacyRedirect() {
  redirect("/app/patient/sections/emergency");
}
