import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { ConnectMessengersBlock } from "@/shared/ui/patient/ConnectMessengersBlock";
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { LogoutSection } from "./LogoutSection";
import { PatientCalendarTimezoneSection } from "./PatientCalendarTimezoneSection";
import { PatientProfileHero } from "./PatientProfileHero";

/** Профиль в onboarding-allowlist: `requirePatientAccess`, не `WithPhone` — см. `patientRouteApiPolicy.ts` (`patientPageMinAccessTier` → onboarding). */
export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
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
  const fallbackDisplayName =
    (emailFields.email && emailFields.email.trim()) ||
    (session.user.phone && session.user.phone.trim()) ||
    ".";

  return (
    <PatientAppShell title="Мой профиль" user={session.user} backHref={routePaths.patient} backLabel="Меню">
      <div className={patientInnerPageStackClass}>
        <PatientProfileHero
          displayName={session.user.displayName ?? ""}
          phone={session.user.phone ?? null}
          supportContactHref={supportContactHref}
          fallbackDisplayName={fallbackDisplayName}
          initialEmail={emailFields.email}
          emailVerified={emailVerified}
        />

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Мессенджеры</h2>
          <ConnectMessengersBlock channelCards={channelCards} showHeading={false} />
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Уведомления</h2>
          <p className={patientMutedTextClass}>
            Каналы доставки и типы уведомлений настраиваются на отдельной странице.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href={routePaths.notifications}
              className="inline-flex shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Настройка
            </Link>
            <Link
              href={routePaths.patientReminders}
              prefetch={false}
              className="inline-flex shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Расписание
            </Link>
          </div>
        </section>

        <section className={patientSectionSurfaceClass}>
          <PatientCalendarTimezoneSection />
        </section>

        <LogoutSection />
      </div>
    </PatientAppShell>
  );
}
