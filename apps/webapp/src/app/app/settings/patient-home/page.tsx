import { redirect } from "next/navigation";

/** Legacy URL: настройки главной пациента перенесены в кабинет врача. */
export default function PatientHomeSettingsRedirectPage() {
  redirect("/app/doctor/patient-home");
}
