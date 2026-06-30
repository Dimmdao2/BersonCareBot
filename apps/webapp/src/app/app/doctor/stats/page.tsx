import { redirect } from "next/navigation";

export default async function DoctorStatsRedirectPage() {
  redirect("/app/doctor/analytics?tab=clients");
}
