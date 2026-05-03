/**
 * Карточка клиента кабинета специалиста («/app/doctor/clients/[userId]»).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ClientProfileCard } from "../ClientProfileCard";

type Props = { params: Promise<{ userId: string }> };

type SearchParams = Promise<{ scope?: string }>;

export default async function DoctorClientProfilePage({
  params,
  searchParams,
}: Props & { searchParams: SearchParams }) {
  const session = await requireDoctorAccess();
  const { userId } = await params;
  const { scope: scopeParam } = await searchParams;
  const listBasePath =
    scopeParam === "all"
      ? "/app/doctor/clients?scope=all"
      : scopeParam === "archived"
        ? "/app/doctor/clients?scope=archived"
        : "/app/doctor/clients?scope=appointments";
  const deps = buildAppDeps();
  const [profile, messageHistory, publishedLfkTemplates, publishedTreatmentTemplates, pendingProgramTests] =
    await Promise.all([
      deps.doctorClients.getClientProfile(userId),
      deps.doctorMessaging.listMessageHistory({ userId, pageSize: 10 }),
      deps.lfkTemplates.listTemplates({ status: "published" }),
      deps.treatmentProgram.listTemplates({ includeArchived: false, status: "published" }),
      deps.treatmentProgramProgress.listPendingTestEvaluationsForPatient(userId),
    ]);

  if (!profile) notFound();

  const lfkComplexIds = profile.lfkComplexes.map((c) => c.id);
  const lfkExerciseLinesByComplexId =
    Boolean(env.DATABASE_URL) && lfkComplexIds.length > 0
      ? await deps.diaries.listLfkComplexExerciseLinesForUser({
          userId,
          complexIds: lfkComplexIds,
        })
      : {};

  return (
    <AppShell
      title={profile.identity.displayName}
      user={session.user}
      backHref={listBasePath}
      backLabel="Клиенты"
      variant="doctor"
    >
      <ClientProfileCard
        profile={profile}
        messageHistory={messageHistory.items}
        userId={userId}
        listBasePath={listBasePath}
        profileListScope={scopeParam}
        isAdmin={session.user.role === "admin"}
        canPermanentDelete={session.user.role === "admin" && Boolean(session.adminMode)}
        canEditClientProfile={session.user.role === "admin" && Boolean(session.adminMode)}
        publishedLfkTemplates={publishedLfkTemplates.map((t) => ({ id: t.id, title: t.title }))}
        assignLfkEnabled={Boolean(env.DATABASE_URL)}
        publishedTreatmentProgramTemplates={publishedTreatmentTemplates.map((t) => ({
          id: t.id,
          title: t.title,
        }))}
        assignTreatmentProgramEnabled={Boolean(env.DATABASE_URL)}
        pendingProgramTestEvaluations={pendingProgramTests}
        lfkExerciseLinesByComplexId={lfkExerciseLinesByComplexId}
      />
    </AppShell>
  );
}
