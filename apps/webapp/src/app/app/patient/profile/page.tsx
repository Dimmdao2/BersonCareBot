import Link from 'next/link';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { ConnectMessengersBlock } from '@/shared/ui/patient/ConnectMessengersBlock';
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import { getSupportContactUrl } from '@/modules/system-settings/supportContactUrl';
import { LogoutSection } from './LogoutSection';
import { PatientCalendarTimezoneSection } from './PatientCalendarTimezoneSection';
import { PatientProfileHero } from './PatientProfileHero';
import { formatPatientGreetingName, type StructuredFio } from '@/shared/lib/fio';
import { getAuthChannelPolicy, getClientVisibleAuthChannelPolicy } from '@/modules/auth/authChannelPolicy';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { PasskeySection } from './PasskeySection';
import { AuthOtpChannelPreference, type AuthOtpOption } from './AuthOtpChannelPreference';
import type { OtpUiChannel } from '@/modules/auth/otpChannelUi';

const AUTH_OTP_CHANNEL_ORDER: readonly OtpUiChannel[] = ['telegram', 'max', 'email', 'sms'];
const AUTH_OTP_CHANNEL_LABEL: Record<OtpUiChannel, string> = {
  telegram: 'Telegram',
  max: 'Max',
  email: 'Email',
  sms: 'SMS',
};

/** Профиль в onboarding-allowlist: `requirePatientAccess`, не `WithPhone` — см. `patientRouteApiPolicy.ts` (`patientPageMinAccessTier` → onboarding). */
export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  const [supportContactHref, emailFields, authChannelPolicy, passkeyEnabled] = await Promise.all([
    getSupportContactUrl(),
    deps.userProjection.getProfileEmailFields(session.user.userId),
    getAuthChannelPolicy(),
    isIndependentAuthMethodEnabled('passkey'),
  ]);
  const emailVerified = Boolean(emailFields.emailVerifiedAt);
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings,
    {
      phone: session.user.phone,
      emailVerified,
    },
  );
  const [clientVisiblePolicy, resolvedAuthOtpChannel] = await Promise.all([
    getClientVisibleAuthChannelPolicy(),
    deps.channelPreferences.resolveAuthOtpChannel(session.user.userId),
  ]);
  const authOtpOptions: AuthOtpOption[] = AUTH_OTP_CHANNEL_ORDER.filter((code) => {
    const card = channelCards.find((c) => c.code === code);
    return Boolean(card?.isLinked && card?.isImplemented && clientVisiblePolicy[code]);
  }).map((code) => ({ code, label: AUTH_OTP_CHANNEL_LABEL[code] }));
  const authOtpShowBindHint =
    authOtpOptions.length > 0 && authOtpOptions.every((o) => o.code === 'sms');
  const fallbackDisplayName =
    (emailFields.email && emailFields.email.trim()) ||
    (session.user.phone && session.user.phone.trim()) ||
    '.';

  return (
    <PatientAppShell
      title="Мой профиль"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
    >
      <div className={patientInnerPageStackClass}>
        <PatientProfileHero
          displayName={formatPatientGreetingName(
            {
              lastName: session.user.lastName ?? null,
              firstName: session.user.firstName ?? null,
              patronymic: session.user.patronymic ?? null,
            } satisfies StructuredFio,
            session.user.displayName ?? '',
          )}
          phone={session.user.phone ?? null}
          supportContactHref={supportContactHref}
          fallbackDisplayName={fallbackDisplayName}
          initialEmail={emailFields.email}
          emailVerified={emailVerified}
        />

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Организации</h2>
          <p className={patientMutedTextClass}>
            Здесь можно посмотреть доступные организации и выбрать, чьи данные открывать в
            приложении.
          </p>
          <Link
            href={routePaths.patientOrganizations}
            className="mt-2 inline-flex shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Мои организации
          </Link>
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Мессенджеры</h2>
          <ConnectMessengersBlock
            channelCards={channelCards}
            channelPolicy={authChannelPolicy}
            showHeading={false}
          />
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Вход по телефону</h2>
          <AuthOtpChannelPreference
            options={authOtpOptions}
            initialSelection={resolvedAuthOtpChannel}
            showBindHint={authOtpShowBindHint}
          />
        </section>

        <section className={patientSectionSurfaceClass}>
          <h2 className={patientSectionTitleClass}>Уведомления</h2>
          <p className={patientMutedTextClass}>
            Каналы доставки и типы уведомлений настраиваются на отдельной странице.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href={routePaths.notificationSettings}
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

        {passkeyEnabled ? (
          <section className={patientSectionSurfaceClass}>
            <h2 className={patientSectionTitleClass}>Ключи доступа</h2>
            <PasskeySection />
          </section>
        ) : null}

        <LogoutSection />
      </div>
    </PatientAppShell>
  );
}
