/**
 * Рассылки кабинета специалиста («/app/doctor/broadcasts»).
 * Предпросмотр, подтверждение, запись в `broadcast_audit` и постановка строк в `outgoing_delivery_queue`;
 * доставку выполняет воркер интегратора (`dispatchOutgoing`).
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
          После отправки сообщения ставятся в очередь доставки; счётчики в журнале обновляются по мере работы воркера.
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
