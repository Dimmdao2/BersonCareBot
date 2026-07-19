import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorBookingMergePage() {
  const session = await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Объединение профилей" user={session.user}>
      <DoctorPageHeader title="Объединение профилей" />
      <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Глобальное объединение и восстановление профилей пациентов недоступно.
      </section>
    </DoctorAppShell>
  );
}
