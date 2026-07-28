import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';

export default async function DoctorUsageAnalyticsPage() {
  const session = await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Использование" user={session.user}>
      <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Аналитика платформы будет доступна в следующем этапе. Данные пациентов и клиническая
        активность на этой странице не отображаются.
      </section>
    </DoctorAppShell>
  );
}
