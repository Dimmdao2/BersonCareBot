import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { OtpUiChannel } from "@/modules/auth/otpChannelUi";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { buttonVariants } from "@/components/ui/button-variants";
import { AuthOtpChannelPreference } from "./AuthOtpChannelPreference";
import { DiaryDataPurgeSection } from "./DiaryDataPurgeSection";
import { LogoutSection } from "./LogoutSection";
import { PinSection } from "./PinSection";
import { ProfileAccordionSection } from "./ProfileAccordionSection";
import { ProfileForm } from "./ProfileForm";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";

const AUTH_OTP_ORDER: OtpUiChannel[] = ["telegram", "max", "email", "sms"];

function maskPhoneTail(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail ? `•••• ${tail}` : phone;
}

/** Профиль в onboarding-allowlist: `requirePatientAccess`, не `WithPhone` — см. `patientPhonePolicy.ts` PREFIX_ALLOWLIST и §11 SCENARIOS (остаток к фазе D). */
export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const platformEntry = await getPlatformEntry();
  const showPinSection = platformEntry !== "bot";
  const deps = buildAppDeps();
  const supportContactHref = await getSupportContactUrl();
  const pinRow = await deps.userPins.getByUserId(session.user.userId);
  const hasPin = pinRow != null;
  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
    {
      phone: session.user.phone,
      emailVerified: Boolean(emailFields.emailVerifiedAt),
    }
  );
  const phoneChannel = session.user.bindings.telegramId ? ("telegram" as const) : ("web" as const);
  const phoneChatId = session.user.bindings.telegramId ?? "";

  const authOtpOptions = AUTH_OTP_ORDER.flatMap((code) => {
    const card = channelCards.find((c) => c.code === code);
    if (!card?.isLinked || !card.isImplemented) return [];
    const label =
      code === "telegram" ? "Telegram" : code === "max" ? "MAX" : code === "email" ? "Email" : "SMS";
    return [{ code, label }];
  });

  const savedPreferred = await deps.channelPreferences.getPreferredAuthOtpChannel(session.user.userId);
  const initialAuthOtpSelection: "auto" | OtpUiChannel =
    savedPreferred && authOtpOptions.some((o) => o.code === savedPreferred) ? savedPreferred : "auto";
  const showAuthOtpBindHint = !authOtpOptions.some((o) => o.code !== "sms");

  const pinStatusIcon = hasPin ? (
    <CheckCircle2 className="size-4 shrink-0 text-green-500" aria-label="PIN создан" />
  ) : (
    <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="PIN не задан" />
  );

  return (
    <AppShell
      title="Мой профиль"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className="flex flex-col gap-3">
        <ProfileAccordionSection id="patient-profile-personal" title="Личные данные">
          <ProfileForm
            displayName={session.user.displayName}
            phone={session.user.phone ?? null}
            phoneChannel={phoneChannel}
            phoneChatId={phoneChatId}
            supportContactHref={supportContactHref}
            initialEmail={emailFields.email}
            emailVerified={Boolean(emailFields.emailVerifiedAt)}
          />
        </ProfileAccordionSection>

        {showPinSection ? (
          <ProfileAccordionSection
            id="patient-profile-pin"
            title="PIN для входа"
            statusIcon={pinStatusIcon}
          >
            <PinSection hasPin={hasPin} />
          </ProfileAccordionSection>
        ) : null}

        <ProfileAccordionSection id="patient-profile-otp" title="Подтверждение входа">
          <AuthOtpChannelPreference
            options={authOtpOptions}
            initialSelection={initialAuthOtpSelection}
            showBindHint={showAuthOtpBindHint}
          />
        </ProfileAccordionSection>

        <ProfileAccordionSection id="patient-profile-channels" title="Привязанные каналы">
          <ConnectMessengersBlock channelCards={channelCards} showHeading={false} />
        </ProfileAccordionSection>

        <ProfileAccordionSection id="patient-profile-notifications" title="Уведомления">
          <p className="text-muted-foreground text-sm">
            Настройте каналы доставки и темы рассылок: напоминания о приёме, упражнениях, симптомах и новостях.
          </p>
          <Link
            href={routePaths.notifications}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Настройки уведомлений
          </Link>
        </ProfileAccordionSection>

        {showPinSection ? (
          <ProfileAccordionSection id="patient-profile-diary-purge" title="Данные дневника">
            <DiaryDataPurgeSection hasPin={hasPin} phoneMasked={maskPhoneTail(session.user.phone)} />
          </ProfileAccordionSection>
        ) : null}

        {platformEntry !== "bot" ? <LogoutSection /> : null}
      </div>
    </AppShell>
  );
}
