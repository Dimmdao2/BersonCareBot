import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

/** Легаси-путь: канонический экран — `/app/doctor/patient-home` (см. README инициативы CMS workflow). */
export default function SettingsPatientHomeLegacyRedirectPage() {
  redirect(routePaths.doctorPatientHome);
}
