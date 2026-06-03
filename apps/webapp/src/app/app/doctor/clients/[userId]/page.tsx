/**
 * Карточка клиента кабинета специалиста («/app/doctor/clients/[userId]»).
 */
import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ClientProfileCard } from "../ClientProfileCard";
import { loadDoctorClientProfileCardProps } from "../loadDoctorClientProfileCardProps";

type Props = { params: Promise<{ userId: string }> };

type SearchParams = Promise<{ scope?: string; chat?: string; pendingAttempt?: string }>;

export default async function DoctorClientProfilePage({
  params,
  searchParams,
}: Props & { searchParams: SearchParams }) {
  const session = await requireDoctorAccess();
  const { userId } = await params;
  const { scope: scopeParam, chat: chatParam, pendingAttempt: pendingAttemptParam } = await searchParams;
  const autoOpenChat = chatParam === "1";
  const focusPendingProgramAttemptId = pendingAttemptParam?.trim() || undefined;

  const loaded = await loadDoctorClientProfileCardProps({
    userId,
    doctorUserId: session.user.userId,
    scopeParam,
    autoOpenChat,
  });

  if (loaded.kind === "not_found") notFound();

  const { props } = loaded;

  return (
    <AppShell
      title={props.profile.identity.displayName}
      user={session.user}
      backHref={props.listBasePath}
      backLabel="Клиенты"
      variant="doctor"
    >
      <ClientProfileCard
        {...props}
        focusPendingProgramAttemptId={focusPendingProgramAttemptId}
        isAdmin={session.user.role === "admin"}
        canPermanentDelete={session.user.role === "admin" && Boolean(session.adminMode)}
        canEditClientProfile={session.user.role === "admin" && Boolean(session.adminMode)}
      />
    </AppShell>
  );
}
