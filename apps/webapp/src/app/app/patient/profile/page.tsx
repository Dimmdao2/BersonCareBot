import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { ChannelLinksBlock } from "./ChannelLinksBlock";
import { ProfileForm } from "./ProfileForm";

export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
  );

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
        <ProfileForm displayName={session.user.displayName} phone={session.user.phone ?? null} />
      </section>

      <section className="panel stack">
        <h2>Привязанные каналы</h2>
        <ChannelLinksBlock channelCards={channelCards} />
      </section>

      <section className="stack" style={{ marginTop: 16 }}>
        <a href="/api/auth/logout" className="button button--danger-outline">
          Выйти из аккаунта
        </a>
      </section>
    </AppShell>
  );
}
