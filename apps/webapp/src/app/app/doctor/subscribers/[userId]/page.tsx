/**
 * Карточка подписчика (полный экран) — «/app/doctor/subscribers/[userId]».
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { SubscriberProfileCard } from "../SubscriberProfileCard";

type Props = { params: Promise<{ userId: string }> };

const BASE = "/app/doctor/subscribers";

export default async function DoctorSubscriberProfilePage({ params }: Props) {
  const session = await requireDoctorAccess();
  const { userId } = await params;
  const deps = buildAppDeps();
  const [profile, messageDraft, messageHistory] = await Promise.all([
    deps.doctorClients.getClientProfile(userId),
    deps.doctorMessaging.prepareMessageDraft({ userId }),
    deps.doctorMessaging.listMessageHistory(userId, 10),
  ]);

  if (!profile) notFound();

  return (
    <AppShell
      title={profile.identity.displayName}
      user={session.user}
      backHref={BASE}
      backLabel="Подписчики"
      variant="doctor"
    >
      <div id={`doctor-subscriber-profile-page-${userId}`}>
        <SubscriberProfileCard
          profile={profile}
          messageHistory={messageHistory}
          userId={userId}
          listBasePath={BASE}
          isAdmin={session.user.role === "admin"}
        />
      </div>
    </AppShell>
  );
}
