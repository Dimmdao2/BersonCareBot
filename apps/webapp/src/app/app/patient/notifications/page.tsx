import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { serializeSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import { ChatView } from "@/modules/messaging/components/ChatView";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import {
  patientInnerPageStackClass,
  patientSectionSurfaceClass,
} from "@/shared/ui/patient/patientVisual";

export default async function PatientNotificationsPage() {
  const session = await requirePatientAccessWithPhone(routePaths.notifications);
  const deps = buildAppDeps();
  const inbox = await deps.messaging.patientNotifications.bootstrap(session.user.userId);
  await deps.messaging.patientNotifications.markRead(session.user.userId);
  const messages = inbox.messages.map(serializeSupportMessage);

  return (
    <PatientAppShell
      title="Уведомления"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Назад"
    >
      <div className={patientInnerPageStackClass}>
        <section className={`${patientSectionSurfaceClass} flex min-h-[60dvh] flex-col overflow-hidden`}>
          <ChatView
            variant="patient"
            relativeFooters
            messages={messages}
            emptyText="Пока нет уведомлений."
            className="min-h-0 flex-1"
          />
        </section>
      </div>
    </PatientAppShell>
  );
}
