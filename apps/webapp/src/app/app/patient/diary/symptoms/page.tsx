import { redirect } from "next/navigation";

/** Совместимость: старый URL ведёт на единую страницу дневника. */
export default function LegacySymptomDiaryRedirect() {
  redirect("/app/patient/diary?tab=symptoms");
}
