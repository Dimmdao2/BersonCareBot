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

type ClientsScope = "all" | "archived";

type Props = {
  searchParams: Promise<{
    q?: string;
    segment?: string;
    telegram?: string;
    max?: string;
    email?: string;
    phone?: string;
    visitedMonth?: string;
    cancellations?: string;
    reschedules?: string;
    selected?: string;
    scope?: string;
  }>;
};

const BASE = "/app/doctor/clients";

function listPathForScope(scope: ClientsScope): string {
  if (scope === "all") return `${BASE}?scope=all`;
  return `${BASE}?scope=archived`;
}

export default async function DoctorClientsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const scope: ClientsScope = params.scope === "archived" ? "archived" : "all";

  const selected = params.selected?.trim();
  if (selected) {
    if (!z.string().uuid().safeParse(selected).success) {
      redirect(listPathForScope(scope));
    }
    const qs = `?scope=${encodeURIComponent(scope)}`;
    redirect(`${BASE}/${encodeURIComponent(selected)}${qs}`);
  }

  const { selected: _legacySelected, ...listUrlParams } = params;

  const allClients = await deps.doctorClients.listClients({
    archivedOnly: scope === "archived",
    viewerUserId: session.user.userId,
  });

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
        />
      </section>
    </DoctorAppShell>
  );
}
