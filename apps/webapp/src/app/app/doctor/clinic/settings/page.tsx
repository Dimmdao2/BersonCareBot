import { redirect } from "next/navigation";

/** Legacy deep link: organization settings now live in the role-authorized settings hub. */
export default function DoctorClinicSettingsPage() {
  redirect("/app/settings?tab=organization");
}
