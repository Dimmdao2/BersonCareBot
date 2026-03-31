import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

export default async function DoctorContentNewsPage() {
  await requireDoctorAccess();
  redirect("/app/doctor/content");
}
