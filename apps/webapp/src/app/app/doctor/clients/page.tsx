/**
 * Клиенты с записями на приём (этап 9): только пользователи с строками в `appointment_records`.
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorClientsPanel } from "./DoctorClientsPanel";
import { doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";

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

const BASE = "/app/doctor/clients";

function listPathForScope(scope: ClientsScope): string {
  if (scope === "all") return `${BASE}?scope=all`;
  if (scope === "archived") return `${BASE}?scope=archived`;
  return `${BASE}?scope=appointments`;
}

export default async function DoctorClientsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const scope: ClientsScope =
    params.scope === "all" ? "all" : params.scope === "archived" ? "archived" : "appointments";

  const selected = params.selected?.trim();
  if (selected) {
    if (!z.string().uuid().safeParse(selected).success) {
      redirect(listPathForScope(scope));
    }
    const qs = `?scope=${encodeURIComponent(scope)}`;
    redirect(`${BASE}/${encodeURIComponent(selected)}${qs}`);
  }

  const { selected: _legacySelected, ...listUrlParams } = params;

  const supportStatus =
    scope === "all" &&
    (params.support === "on" || params.support === "programWithoutSupport")
      ? params.support
      : undefined;

  const allClients = await deps.doctorClients.listClients(
    scope === "archived"
      ? { archivedOnly: true }
      : scope === "all"
        ? supportStatus
          ? { supportStatus }
          : {}
        : {
            onlyWithAppointmentRecords: true,
            visitedThisCalendarMonth: params.visitedMonth === "1",
          },
  );

  return (
    <DoctorAppShell title="Клиенты" user={session.user}>
      <section
        id="doctor-clients-list-section"
        className={doctorSectionCardClass}
      >
        <DoctorClientsPanel
          allClients={allClients}
          urlParams={listUrlParams}
          basePath={BASE}
          showAdminNameMatchHintsLink={session.user.role === "admin" && Boolean(session.adminMode)}
        />
      </section>
    </DoctorAppShell>
  );
}
