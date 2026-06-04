import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { ProductAnalyticsSection } from "./ProductAnalyticsSection";

export default async function DoctorUsageAnalyticsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }

  return (
    <DoctorAppShell title="Использование" user={session.user}>
      <ProductAnalyticsSection />
    </DoctorAppShell>
  );
}
