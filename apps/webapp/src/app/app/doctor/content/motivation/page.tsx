import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

export default async function DoctorContentMotivationPage() {
  await requireDoctorAccess();
  redirect("/app/doctor/content");
}
