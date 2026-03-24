/**
 * Клиенты с записями на приём (этап 9): только пользователи с строками в `appointment_records`.
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { CreateClientFromRecordStub } from "./CreateClientFromRecordStub";
import { ClientProfileCard } from "./ClientProfileCard";
import { DoctorClientsPanel } from "./DoctorClientsPanel";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    selected?: string;
  }>;
};

const BASE = "/app/doctor/clients";

export default async function DoctorClientsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const selected = params.selected;
  const [allClients, selectedData] = await Promise.all([
    deps.doctorClients.listClients({ onlyWithAppointmentRecords: true }),
    selected
      ? Promise.all([
          deps.doctorClients.getClientProfile(selected),
          deps.doctorMessaging.prepareMessageDraft({ userId: selected }),
          deps.doctorMessaging.listMessageHistory(selected, 10),
        ]).then(([profile, messageDraft, messageHistory]) =>
          profile ? { profile, messageDraft, messageHistory } : null,
        )
      : Promise.resolve(null),
  ]);

  const selectedProfile = selectedData?.profile ?? null;
  const selectedMessageDraft = selectedData?.messageDraft ?? null;
  const selectedMessageHistory = selectedData?.messageHistory ?? [];

  return (
    <AppShell title="Клиенты" user={session.user} variant="doctor">
      <CreateClientFromRecordStub />
      <div id="doctor-clients-master-detail" className="master-detail">
        <div id="doctor-clients-list-column" className="master-detail__list">
          <section id="doctor-clients-list-section" className="panel stack">
            <DoctorClientsPanel allClients={allClients} urlParams={params} basePath={BASE} />
          </section>
        </div>
        {selectedProfile ? (
          <div id="doctor-clients-detail-column" className="master-detail__detail">
            <ClientProfileCard
              profile={selectedProfile}
              messageDraft={selectedMessageDraft}
              messageHistory={selectedMessageHistory}
              userId={selected!}
              listBasePath={BASE}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
