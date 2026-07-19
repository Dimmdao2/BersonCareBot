import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { ProductAnalyticsSection } from "@/app/app/doctor/usage/ProductAnalyticsSection";

export default async function DoctorUsageAnalyticsPage() {
  const session = await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Использование" user={session.user}>
      <ProductAnalyticsSection />
    </DoctorAppShell>
  );
}
