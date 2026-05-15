/**
 * Рассылки кабинета специалиста («/app/doctor/broadcasts»).
 * Preview / подтверждение / запись в `broadcast_audit` (включая выбранные каналы и оценку аудитории).
 * Фактическая массовая доставка по каналам — вне `doctor-broadcasts.execute` (см. подпись ниже и docs/ARCHITECTURE/DOCTOR_BROADCASTS.md).
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { listBroadcastAuditAction } from "./actions";
import { BroadcastForm } from "./BroadcastForm";
import { BroadcastAuditLog } from "./BroadcastAuditLog";

export default async function DoctorBroadcastsPage() {
  const session = await requireDoctorAccess();
  const auditEntries = await listBroadcastAuditAction(50);

  return (
    <AppShell title="Рассылки" user={session.user} variant="doctor">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Отправка и журнал: запись в аудит с выбранными каналами и размером аудитории. Фактическая доставка по каналам
          (бот, SMS) подключается отдельным контуром интеграции; выбор каналов отражает намерение и историю.
        </p>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Новая рассылка</h2>
          <BroadcastForm />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Журнал рассылок</h2>
          <BroadcastAuditLog entries={auditEntries} />
        </section>
      </div>
    </AppShell>
  );
}
