import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { ChannelLinksBlock } from "./ChannelLinksBlock";
import { LogoutSection } from "./LogoutSection";
import { ProfileForm } from "./ProfileForm";

export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
  );
  const phoneChannel = session.user.bindings.telegramId ? ("telegram" as const) : ("web" as const);
  const phoneChatId = session.user.bindings.telegramId ?? "";

  return (
    <AppShell
      title="Мой профиль"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className="panel stack">
        <h2>Личные данные</h2>
        <ProfileForm
          displayName={session.user.displayName}
          phone={session.user.phone ?? null}
          phoneChannel={phoneChannel}
          phoneChatId={phoneChatId}
        />
      </section>

      <section className="panel stack">
        <h2>Привязанные каналы</h2>
        <ChannelLinksBlock channelCards={channelCards} />
      </section>

      <LogoutSection />
    </AppShell>
  );
}
