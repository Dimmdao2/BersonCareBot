/**
 * Подписчики — все пользователи role=client (этап 9).
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ClientProfileCard } from "../clients/ClientProfileCard";
import { DoctorClientsPanel } from "../clients/DoctorClientsPanel";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    visitedMonth?: string;
    selected?: string;
  }>;
};

const BASE = "/app/doctor/subscribers";

export default async function DoctorSubscribersPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const selected = params.selected;
  const [allClients, selectedData] = await Promise.all([
    deps.doctorClients.listClients({}),
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
    <AppShell title="Подписчики" user={session.user} variant="doctor">
      <div id="doctor-subscribers-master-detail" className="block md:grid md:grid-cols-[1fr_2fr] md:gap-4">
        <div id="doctor-subscribers-list-column">
          <section id="doctor-subscribers-list-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
            <DoctorClientsPanel allClients={allClients} urlParams={params} basePath={BASE} />
          </section>
        </div>
        {selectedProfile ? (
          <div id="doctor-subscribers-detail-column" className="hidden md:block">
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
