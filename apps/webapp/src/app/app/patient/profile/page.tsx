import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { OtpUiChannel } from "@/modules/auth/otpChannelUi";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { AppShell } from "@/shared/ui/AppShell";
import { ConnectMessengersBlock } from "@/shared/ui/ConnectMessengersBlock";
import { AuthOtpChannelPreference } from "./AuthOtpChannelPreference";
import { LogoutSection } from "./LogoutSection";
import { PinSection } from "./PinSection";
import { ProfileForm } from "./ProfileForm";

const AUTH_OTP_ORDER: OtpUiChannel[] = ["telegram", "max", "email", "sms"];

export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const platformEntry = await getPlatformEntry();
  const showPinSection = platformEntry !== "bot";
  const deps = buildAppDeps();
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

  return (
    <AppShell
      title="Мой профиль"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Личные данные</h2>
        <ProfileForm
          displayName={session.user.displayName}
          phone={session.user.phone ?? null}
          phoneChannel={phoneChannel}
          phoneChatId={phoneChatId}
          initialEmail={emailFields.email}
          emailVerified={Boolean(emailFields.emailVerifiedAt)}
        />
      </section>

      {showPinSection ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
          <h2>PIN для входа</h2>
          <PinSection hasPin={hasPin} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Подтверждение входа</h2>
        <AuthOtpChannelPreference
          options={authOtpOptions}
          initialSelection={initialAuthOtpSelection}
          showBindHint={showAuthOtpBindHint}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Привязанные каналы</h2>
        <ConnectMessengersBlock channelCards={channelCards} showHeading={false} />
      </section>

      {platformEntry !== "bot" ? <LogoutSection /> : null}
    </AppShell>
  );
}
