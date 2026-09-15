import type { ReactNode } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAccountEmailSection } from '@/app/app/settings/DoctorAccountEmailSection';
import { DoctorScreensToggleSection } from '@/app/app/settings/DoctorScreensToggleSection';
import { SettingsForm } from '@/app/app/settings/SettingsForm';
import { LogoutForm } from '@/shared/ui/LogoutForm';
import { StaffPwaInstallSection } from '@/shared/ui/doctor/pwa/StaffPwaInstallSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { StaffSecuritySection } from './StaffSecuritySection';
import { StaffPasskeySection } from './StaffPasskeySection';
import { LoginDevicesCard } from '@/shared/ui/security/LoginDevicesCard';
import { loadOwnLoginDevices } from '@/app-layer/identity/ownLoginDevices';
import { runWithStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

/**
 * Ровно те поля рабочего пространства, которые нужны личным разделам. Именно набор, а не полный
 * `DoctorWorkspaceContext`: разделы рисуются и со страницы `/app/account`, и из «Профиля и
 * настроек», а там на руках `DoctorWorkspaceAccessContext` — в нём нет ни имени организации, ни
 * выбранного специалиста, и требовать их было бы требованием ради типа.
 */
export type AccountSectionsWorkspace = Pick<
  DoctorWorkspaceContext,
  | 'organizationId'
  | 'canManageOrganization'
  | 'canAccessClinicalWorkspace'
  | 'specialistId'
  | 'doctorScreensDisabled'
>;
import type { StaffAccountPageContext } from './accountContext';

/**
 * Личные разделы сотрудника, вынесенные из `/app/account/page.tsx`.
 *
 * Зачем вынесены. Владелец 15.09.2026: «надо перенести ВСЕ настройки для СОЛО в блок аккаунта… все
 * в одно место». У соло-специалиста «Аккаунт» стал вкладкой «Профиля и настроек», но страница
 * `/app/account` обязана остаться для персонала клиники БЕЗ права управлять организацией — им в
 * настройки организации нельзя. Один и тот же раздел рисуют оба места, поэтому он живёт здесь, а
 * не копией: второй такой же экран разъехался бы с первым на первой же правке.
 */

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
    ? ((valueJson as Record<string, unknown>).value as T)
    : fallback;
}

export function InstallSection() {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Установка на устройство</DoctorSectionTitle>
      </DoctorSectionHeader>
      <StaffPwaInstallSection />
    </DoctorSection>
  );
}

export function LogoutSection() {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Сеанс</DoctorSectionTitle>
      </DoctorSectionHeader>
      <LogoutForm>
        <Button type="submit" variant="destructive">
          Выйти
        </Button>
      </LogoutForm>
    </DoctorSection>
  );
}

export async function loadProfileContent(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
  workspaceContext: AccountSectionsWorkspace | null,
  options?: {
    /**
     * Соло-специалист: владелец 15.09 велел убрать у него SMS-fallback и «показывать мне врачебные
     * экраны» — у одного человека этих понятий нет. Выключатель остаётся персоналу клиники.
     */
    hideSoloOnlyToggles?: boolean;
    /** Выход рисует вызывающий сам, когда ему нужен другой порядок разделов. */
    withLogout?: boolean;
  },
): Promise<ReactNode> {
  const hideSoloOnlyToggles = options?.hideSoloOnlyToggles === true;
  const withLogout = options?.withLogout !== false;
  const accountEmail = await deps.userProjection.getProfileEmailFields(userId);
  const doctorSettings =
    !hideSoloOnlyToggles && workspaceContext?.canAccessClinicalWorkspace
      ? await deps.systemSettings.listSettingsByScope('doctor', {
          organizationId: workspaceContext.organizationId,
        })
      : [];
  return (
    <>
      <DoctorAccountEmailSection
        initialEmail={accountEmail.email}
        emailVerified={Boolean(accountEmail.emailVerifiedAt)}
      />
      {!hideSoloOnlyToggles &&
      workspaceContext?.canManageOrganization &&
      workspaceContext.specialistId != null ? (
        <DoctorScreensToggleSection initialDisabled={workspaceContext.doctorScreensDisabled} />
      ) : null}
      {!hideSoloOnlyToggles && workspaceContext?.canAccessClinicalWorkspace ? (
        <SettingsForm
          patientLabel="пациент"
          smsFallbackEnabled={valueOf(
            doctorSettings.find(
              (setting) =>
                setting.key === 'sms_fallback_enabled' &&
                setting.organizationId === workspaceContext.organizationId,
            )?.valueJson,
            false,
          )}
          supportCommentsWithoutSupportDefault={false}
          supportMediaWithoutSupportDefault={false}
          showPatientLabel={false}
          showSmsFallback
          showSupportDefaults={false}
        />
      ) : null}
      {withLogout ? <LogoutSection /> : null}
    </>
  );
}

export async function loadSecurityContent(
  deps: ReturnType<typeof buildAppDeps>,
  session: StaffAccountPageContext['session'],
  workspaceContext: AccountSectionsWorkspace | null,
  recoveryOnly: boolean,
  isPlatformConsole: boolean,
): Promise<ReactNode> {
  const [storedStatus, passkeyEnabled, loginDevices] = await Promise.all([
    runWithStaffSecuritySelfPrincipal(session.user.userId, 'app/account:security-self', () =>
      deps.staffSecurity.getStatus(),
    ),
    recoveryOnly ? Promise.resolve(false) : isIndependentAuthMethodEnabled('passkey'),
    // Во время восстановления защиты экран урезан до самого восстановления — список устройств там
    // лишний шум, а не помощь. См. ветку `recoveryOnly` в `AccountPage`.
    recoveryOnly ? Promise.resolve(null) : loadOwnLoginDevices(),
  ]);
  const status = storedStatus ?? {
    enrolled: false,
    recoveryConfirmed: false,
    replacementRequired: false,
    lockedUntil: null,
    sessionVersion: 0,
  };
  return (
    <>
      <StaffSecuritySection
        initialStatus={status}
        hasProfileName={Boolean(session.user.displayName.trim())}
        hasOrganization={workspaceContext !== null}
        hasSpecialistBinding={workspaceContext?.specialistId != null}
        showSpecialistFirstRun={!isPlatformConsole}
        recoveryOnly={recoveryOnly}
      />
      {passkeyEnabled ? <StaffPasskeySection /> : null}
      {/*
        #1112, Л-6д. Решение владельца 14.09: «раскатывай в Учетку -> Безопасность». Кнопки
        «завершить другие сеансы» здесь НЕ добавляется — она уже есть выше, в `StaffSecuritySection`,
        и вторая копия читалась бы как второе, другое действие.
      */}
      {loginDevices ? (
        <LoginDevicesCard devices={loginDevices.devices} loadFailed={loginDevices.loadFailed} />
      ) : null}
    </>
  );
}
