/**
 * Клиенты с записями на приём (этап 9): только пользователи с строками в `appointment_records`.
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { env } from "@/config/env";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/shared/ui/AppShell";
import { ClientProfileCard } from "./ClientProfileCard";
import { DoctorClientsPanel } from "./DoctorClientsPanel";

type ClientsScope = "all" | "appointments" | "archived";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    treatmentProgram?: string;
    support?: string;
    visitedMonth?: string;
    selected?: string;
    scope?: string;
  }>;
};

function resolveSupportStatus(
  support: string | undefined,
): "on" | "programWithoutSupport" | undefined {
  if (support === "on") return "on";
  if (support === "programWithoutSupport") return "programWithoutSupport";
  return undefined;
}

const BASE = "/app/doctor/clients";

function buildClientsListBasePath(scope: ClientsScope, supportRaw?: string): string {
  const params = new URLSearchParams();
  params.set("scope", scope === "archived" ? "archived" : scope === "all" ? "all" : "appointments");
  const support = scope === "all" ? resolveSupportStatus(supportRaw) : undefined;
  if (support) params.set("support", support);
  return `${BASE}?${params.toString()}`;
}

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
  const supportStatus = scope === "all" ? resolveSupportStatus(params.support) : undefined;
  const [allClients, selectedData] = await Promise.all([
    deps.doctorClients.listClients(
      scope === "archived"
        ? { archivedOnly: true }
        : scope === "all"
          ? supportStatus ? { supportStatus } : {}
          : {
              onlyWithAppointmentRecords: true,
              visitedThisCalendarMonth: params.visitedMonth === "1",
            },
    ),
    selected
      ? Promise.all([
          deps.doctorClients.getClientProfile(selected),
          deps.doctorMessaging.listMessageHistory({ userId: selected, pageSize: 10 }),
          deps.treatmentProgram.listTemplates({ includeArchived: false, status: "published" }),
          deps.treatmentProgramProgress.listPendingTestEvaluationsForPatient(selected),
          Boolean(env.DATABASE_URL)
            ? deps.treatmentProgramInstance.listForPatientClinicalView(selected)
            : Promise.resolve([]),
        ]).then(
          ([profile, messageHistory, publishedTreatmentTemplates, pendingProgramTests, treatmentProgramInstances]) =>
            profile
              ? {
                  profile,
                  messageHistory: messageHistory.items,
                  publishedTreatmentTemplates,
                  pendingProgramTests,
                  treatmentProgramInstances,
                }
              : null,
        )
      : Promise.resolve(null),
  ]);

  const selectedProfile = selectedData?.profile ?? null;
  const selectedTreatmentProgramInstances = selectedData?.treatmentProgramInstances ?? [];
  const selectedMessageHistory = selectedData?.messageHistory ?? [];
  const selectedPublishedTreatmentTemplates =
    selectedData?.publishedTreatmentTemplates?.map((t) => ({ id: t.id, title: t.title })) ?? [];
  const selectedPendingProgramTests = selectedData?.pendingProgramTests ?? [];
  const listBasePathWithScope = buildClientsListBasePath(scope, params.support);

  return (
    <AppShell title="Клиенты" user={session.user} variant="doctor">
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
              messageHistory={selectedMessageHistory}
              userId={selected!}
              listBasePath={listBasePathWithScope}
              isAdmin={session.user.role === "admin"}
              canPermanentDelete={session.user.role === "admin" && Boolean(session.adminMode)}
              canEditClientProfile={session.user.role === "admin" && Boolean(session.adminMode)}
              publishedTreatmentProgramTemplates={selectedPublishedTreatmentTemplates}
              assignTreatmentProgramEnabled={Boolean(env.DATABASE_URL)}
              profileListScope={scope}
              pendingProgramTestEvaluations={selectedPendingProgramTests}
              treatmentProgramInstancesInitial={
                Boolean(env.DATABASE_URL) ? selectedTreatmentProgramInstances : undefined
              }
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
