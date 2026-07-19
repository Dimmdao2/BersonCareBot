import { redirect } from "next/navigation";

/** Legacy deep link: preserve the one guarded organization-settings writer. */
export default function DoctorClinicSettingsPage() {
  redirect("/app/settings?tab=organization");
}
