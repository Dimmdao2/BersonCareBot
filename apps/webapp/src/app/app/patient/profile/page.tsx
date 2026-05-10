import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import {
  patientInfoLinkTileClass,
  patientInnerPageStackClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { DiaryDataPurgeSection } from "./DiaryDataPurgeSection";
import { LogoutSection } from "./LogoutSection";
import { PatientProfileHero } from "./PatientProfileHero";
import { ProfileExtraSection } from "./ProfileExtraSection";

function maskPhoneTail(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail ? `•••• ${tail}` : phone;
}

/** Профиль в onboarding-allowlist: `requirePatientAccess`, не `WithPhone` — см. `patientRouteApiPolicy.ts` (`patientPageMinAccessTier` → onboarding). */
export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const platformEntry = await getPlatformEntry();
  const deps = buildAppDeps();
  const supportContactHref = await getSupportContactUrl();
  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
    {
      phone: session.user.phone,
      emailVerified: Boolean(emailFields.emailVerifiedAt),
    },
  );
  const telegramId = session.user.bindings.telegramId ?? "";
  const maxId = session.user.bindings.maxId ?? "";

  const fallbackDisplayName =
    (emailFields.email && emailFields.email.trim()) ||
    (session.user.phone && session.user.phone.trim()) ||
    ".";

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
        />

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Email</h2>
          <EmailAccountPanel
            initialEmail={emailFields.email}
            emailVerified={Boolean(emailFields.emailVerifiedAt)}
            supportContactHref={supportContactHref}
            embeddedInTitledSection
          />
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Мессенджеры</h2>
          <ConnectMessengersBlock channelCards={channelCards} showHeading={false} />
        </section>

        <Link
          href={routePaths.notifications}
          className={cn(patientInfoLinkTileClass, "flex items-center justify-between min-h-11")}
        >
          <span>Подписки на уведомления</span>
          <ChevronRight className="size-4 shrink-0 text-[var(--patient-text-muted)]" aria-hidden />
        </Link>

        <ProfileExtraSection />

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Удаление данных дневника</h2>
          <DiaryDataPurgeSection phoneMasked={maskPhoneTail(session.user.phone)} />
        </section>

        {platformEntry !== "bot" ? <LogoutSection /> : null}
      </div>
    </AppShell>
  );
}
