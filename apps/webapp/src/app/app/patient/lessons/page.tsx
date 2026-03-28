import { redirect } from "next/navigation";

/** Обратная совместимость: старый URL ведёт на динамический раздел. */
export default function PatientLessonsLegacyRedirect() {
  redirect("/app/patient/sections/lessons");
}
