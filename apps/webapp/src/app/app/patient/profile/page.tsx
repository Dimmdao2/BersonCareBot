import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import {
  patientInnerPageStackClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { parseNotificationsTopics } from "@/modules/patient-notifications/notificationsTopics";
import { buildProfileNotificationTopicModels } from "@/modules/patient-notifications/profileTopicChannelsModel";
import { LogoutSection } from "./LogoutSection";
import { PatientProfileHero } from "./PatientProfileHero";
import { PatientProfileShareCabinetTile } from "./PatientProfileShareCabinetTile";
import { ProfileExtraSection } from "./ProfileExtraSection";
import { ProfileNotificationsSection } from "./ProfileNotificationsSection";

/** Профиль в onboarding-allowlist: `requirePatientAccess`, не `WithPhone` — см. `patientRouteApiPolicy.ts` (`patientPageMinAccessTier` → onboarding). */
export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const platformEntry = await getPlatformEntry();
  const deps = buildAppDeps();
  const supportContactHref = await getSupportContactUrl();
  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const emailVerified = Boolean(emailFields.emailVerifiedAt);
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
    {
      phone: session.user.phone,
      emailVerified,
    },
  );
  const telegramId = session.user.bindings.telegramId ?? "";
  const maxId = session.user.bindings.maxId ?? "";

  const fallbackDisplayName =
    (emailFields.email && emailFields.email.trim()) ||
    (session.user.phone && session.user.phone.trim()) ||
    ".";

  const notificationsTopicsSetting = await deps.systemSettings.getSetting("notifications_topics", "admin");
  const subscriptionTopics = parseNotificationsTopics(notificationsTopicsSetting?.valueJson ?? null);
  const prefRows = await deps.topicChannelPrefs.listByUserId(session.user.userId);
  const notificationModels = buildProfileNotificationTopicModels(subscriptionTopics, prefRows, {
    hasTelegram: Boolean(telegramId.trim()),
    hasMax: Boolean(maxId.trim()),
    emailVerified,
  });

  return (
    <AppShell title="Мой профиль" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <div className={patientInnerPageStackClass}>
        <PatientProfileHero
          displayName={session.user.displayName ?? ""}
          phone={session.user.phone ?? null}
          telegramId={telegramId}
          maxId={maxId}
          supportContactHref={supportContactHref}
          fallbackDisplayName={fallbackDisplayName}
          initialEmail={emailFields.email}
          emailVerified={emailVerified}
        />

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Мессенджеры</h2>
          <ConnectMessengersBlock channelCards={channelCards} showHeading={false} />
        </section>

        <ProfileNotificationsSection initialTopics={notificationModels} />

        <ProfileExtraSection />

        <PatientProfileShareCabinetTile />

        {platformEntry !== "bot" ? <LogoutSection /> : null}
      </div>
    </AppShell>
  );
}
