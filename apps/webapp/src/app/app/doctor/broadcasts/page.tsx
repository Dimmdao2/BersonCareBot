/**
 * Рассылки кабинета специалиста («/app/doctor/broadcasts»).
 * Предпросмотр, подтверждение, запись в `broadcast_audit` и постановка строк в `outgoing_delivery_queue`;
 * доставку выполняет воркер интегратора (`dispatchOutgoing`).
 */
import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { listBroadcastAuditAction } from "./actions";
import { BroadcastForm } from "./BroadcastForm";
import { BroadcastAuditLog } from "./BroadcastAuditLog";
import {
  doctorInlineLinkClass,
  doctorPageStackClass,
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";

export default async function DoctorBroadcastsPage() {
  const session = await requireDoctorAccess();
  const auditEntries = await listBroadcastAuditAction(50);

  return (
    <DoctorAppShell title="Рассылки" user={session.user}>
      <div className={doctorPageStackClass}>
        <p className="text-sm text-muted-foreground">
          После отправки сообщения ставятся в очередь доставки; счётчики в журнале обновляются по мере работы воркера.{" "}
          <Link href="/app/doctor/broadcasts/archive" className={doctorInlineLinkClass}>
            Архив ошибок доставки
          </Link>
        </p>
        <section className={doctorSectionCardClass}>
          <h2 className={`mb-3 ${doctorSectionTitleClass}`}>Новая рассылка</h2>
          <BroadcastForm />
        </section>

        <section className={doctorSectionCardClass}>
          <h2 className={`mb-3 ${doctorSectionTitleClass}`}>Журнал рассылок</h2>
          <BroadcastAuditLog entries={auditEntries} />
        </section>
      </div>
    </DoctorAppShell>
  );
}
