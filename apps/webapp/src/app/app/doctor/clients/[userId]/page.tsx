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
  const [profile, messageDraft, messageHistory, publishedLfkTemplates] = await Promise.all([
    deps.doctorClients.getClientProfile(userId),
    deps.doctorMessaging.prepareMessageDraft({ userId }),
    deps.doctorMessaging.listMessageHistory({ userId, pageSize: 10 }),
    deps.lfkTemplates.listTemplates({ status: "published" }),
  ]);

  if (!profile) notFound();

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
        messageDraft={messageDraft}
        messageHistory={messageHistory.items}
        userId={userId}
        listBasePath={listBasePath}
        isAdmin={session.user.role === "admin"}
        canPermanentDelete={session.user.role === "admin" && Boolean(session.adminMode)}
        canEditClientProfile={session.user.role === "admin" && Boolean(session.adminMode)}
        publishedLfkTemplates={publishedLfkTemplates.map((t) => ({ id: t.id, title: t.title }))}
        assignLfkEnabled={Boolean(env.DATABASE_URL)}
      />
    </AppShell>
  );
}
