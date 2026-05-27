import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ProductAnalyticsSection } from "./ProductAnalyticsSection";

export default async function DoctorUsageAnalyticsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }

  return (
    <AppShell title="Использование" user={session.user} variant="doctor">
      <ProductAnalyticsSection />
    </AppShell>
  );
}
