/**
 * Клиенты с записями на приём (этап 9): только пользователи с строками в `appointment_records`.
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/shared/ui/AppShell";
import { CreateClientFromRecordStub } from "./CreateClientFromRecordStub";
import { ClientProfileCard } from "./ClientProfileCard";
import { DoctorClientsPanel } from "./DoctorClientsPanel";

type ClientsScope = "all" | "appointments" | "archived";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    visitedMonth?: string;
    selected?: string;
    scope?: string;
  }>;
};

const BASE = "/app/doctor/clients";

export default async function DoctorClientsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const scope: ClientsScope =
    params.scope === "all" ? "all" : params.scope === "archived" ? "archived" : "appointments";
  const selected = params.selected;
  if (selected && !z.string().uuid().safeParse(selected).success) {
    redirect(
      scope === "all" ? `${BASE}?scope=all` : scope === "archived" ? `${BASE}?scope=archived` : BASE,
    );
  }
  const [allClients, selectedData] = await Promise.all([
    deps.doctorClients.listClients(
      scope === "archived"
        ? { archivedOnly: true }
        : scope === "all"
          ? {}
          : {
              onlyWithAppointmentRecords: true,
              visitedThisCalendarMonth: params.visitedMonth === "1",
            },
    ),
    selected
      ? Promise.all([
          deps.doctorClients.getClientProfile(selected),
          deps.doctorMessaging.prepareMessageDraft({ userId: selected }),
          deps.doctorMessaging.listMessageHistory({ userId: selected, pageSize: 10 }),
        ]).then(([profile, messageDraft, messageHistory]) =>
          profile ? { profile, messageDraft, messageHistory: messageHistory.items } : null,
        )
      : Promise.resolve(null),
  ]);

  const selectedProfile = selectedData?.profile ?? null;
  const selectedMessageDraft = selectedData?.messageDraft ?? null;
  const selectedMessageHistory = selectedData?.messageHistory ?? [];
  const listBasePathWithScope =
    scope === "all"
      ? `${BASE}?scope=all`
      : scope === "archived"
        ? `${BASE}?scope=archived`
        : `${BASE}?scope=appointments`;

  return (
    <AppShell title="Клиенты" user={session.user} variant="doctor">
      {scope === "appointments" ? <CreateClientFromRecordStub /> : null}
      <div id="doctor-clients-master-detail" className="md:grid md:grid-cols-[1fr_2fr] md:gap-4">
        <div id="doctor-clients-list-column">
          <section
            id="doctor-clients-list-section"
            className="rounded-xl border border-border/60 bg-background p-4 shadow-sm flex flex-col gap-4"
          >
            <DoctorClientsPanel
              allClients={allClients}
              urlParams={params}
              basePath={BASE}
              showAdminNameMatchHintsLink={session.user.role === "admin" && Boolean(session.adminMode)}
            />
          </section>
        </div>
        {selectedProfile ? (
          <div id="doctor-clients-detail-column" className="hidden md:block">
            <ClientProfileCard
              profile={selectedProfile}
              messageDraft={selectedMessageDraft}
              messageHistory={selectedMessageHistory}
              userId={selected!}
              listBasePath={listBasePathWithScope}
              isAdmin={session.user.role === "admin"}
              canPermanentDelete={
                session.user.role === "admin" && Boolean(session.adminMode)
              }
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
