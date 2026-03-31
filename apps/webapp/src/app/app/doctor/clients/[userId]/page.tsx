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
  const { scope } = await searchParams;
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
      backHref={scope === "all" ? "/app/doctor/clients?scope=all" : "/app/doctor/clients?scope=appointments"}
      backLabel="Клиенты"
      variant="doctor"
    >
      <div id={`doctor-client-profile-page-${userId}`}>
      <ClientProfileCard
        profile={profile}
        messageDraft={messageDraft}
        messageHistory={messageHistory.items}
        userId={userId}
        listBasePath={scope === "all" ? "/app/doctor/clients?scope=all" : "/app/doctor/clients?scope=appointments"}
        isAdmin={session.user.role === "admin"}
        publishedLfkTemplates={publishedLfkTemplates.map((t) => ({ id: t.id, title: t.title }))}
        assignLfkEnabled={Boolean(env.DATABASE_URL)}
      />
      </div>
    </AppShell>
  );
}
