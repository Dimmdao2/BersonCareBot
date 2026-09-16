import type { ReactNode } from 'react';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { storagePackageOffersBody } from '@/app/api/clinic/billing/storagePackagePurchase';
import { DoctorAccountEmailSection } from '@/app/app/settings/DoctorAccountEmailSection';
import { BillingSection } from '@/app/app/settings/BillingSection';
import { DoctorScreensToggleSection } from '@/app/app/settings/DoctorScreensToggleSection';
import { OrgBrandingSection } from '@/app/app/settings/OrgBrandingSection';
import { SettingsForm } from '@/app/app/settings/SettingsForm';
import { describeCommercialAccessState } from '@/app/app/settings/billingCommercialState';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { resolveDoctorWorkspaceComposition } from '@/modules/doctor-workspace/composition';
import { resolveOwnOrgQuotaProjections } from '@/modules/org-entitlements/service';
import { MECHANIC_REGISTRY } from '@/modules/org-entitlements/types';
import { StaffPwaInstallSection } from '@/shared/ui/doctor/pwa/StaffPwaInstallSection';
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
import { orgBrandLogoUrl, type OrgBrandingManagementContext } from '@/modules/org-branding/service';

/**
 * Ровно те поля рабочего пространства, которые нужны личным разделам. Именно набор, а не полный
 * `DoctorWorkspaceContext`: разделы рисуются и со страницы `/app/account`, и из настроек, а там
 * на руках `DoctorWorkspaceAccessContext` — в нём нет ни имени организации, ни
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
type AccountBillingWorkspace = Pick<
  DoctorWorkspaceAccessContext,
  'organizationId' | 'membershipRole'
>;
import type { StaffAccountPageContext } from './accountContext';

/**
 * Личные разделы сотрудника, вынесенные из `/app/account/page.tsx`.
 *
 * Зачем вынесены. Владелец 15.09.2026: «надо перенести ВСЕ настройки для СОЛО в блок аккаунта… все
 * в одно место». Страница `/app/account` обязана остаться для персонала клиники БЕЗ права управлять
 * организацией — им в организационные настройки нельзя. Общая загрузка личных разделов живёт здесь,
 * а не копиями в разных страницах.
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

export async function loadOrganizationContent(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
  workspaceContext: AccountSectionsWorkspace | null,
): Promise<ReactNode> {
  if (!workspaceContext?.canManageOrganization) return null;

  const brandingContext: OrgBrandingManagementContext = {
    organizationId: workspaceContext.organizationId,
    actorPlatformUserId: userId,
    hasOrganizationManagementCapability: true,
  };
  const brandingState = await withDoctorWorkspacePrincipal(
    workspaceContext,
    'app.account.org-branding.read',
    () => deps.orgBranding.getManagementState(brandingContext),
  );
  if (!brandingState.brandingVisible) return null;

  const publishedBrand = brandingState.published;
  return (
    <OrgBrandingSection
      scope="organization"
      brandingMutationAvailable={brandingState.brandingMutationAvailable}
      coreDisplayName={brandingState.effective.core.displayName}
      hasPublishedRevision={publishedBrand !== null}
      publishedDisplayName={publishedBrand?.displayName ?? null}
      publishedLogoMediaId={publishedBrand?.logoMediaId ?? null}
      publishedLogoUrl={
        publishedBrand?.logoMediaReady && publishedBrand.logoMediaId
          ? orgBrandLogoUrl(publishedBrand.logoMediaId)
          : null
      }
      publishedAppIconMediaId={publishedBrand?.appIconMediaId ?? null}
      publishedAppIconUrl={
        publishedBrand?.appIconMediaReady && publishedBrand.appIconMediaId
          ? orgBrandLogoUrl(publishedBrand.appIconMediaId)
          : null
      }
      usesOwnPatientApp={false}
    />
  );
}

/**
 * Тариф принадлежит личному аккаунту владельца/администратора организации. Сравнение и выбор
 * остаются отдельной страницей `/app/settings/tariffs`; здесь только действующая сводка и биллинг.
 */
export async function loadTariffContent(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
  workspace: AccountBillingWorkspace | null,
): Promise<ReactNode> {
  if (
    workspace === null ||
    (workspace.membershipRole !== 'owner' && workspace.membershipRole !== 'admin')
  ) {
    return null;
  }

  const [teamEntitlement, seatStatus] = await Promise.all([
    requireEntitlementForReadAction({ organizationId: workspace.organizationId }, 'clinic_team'),
    deps.clinicSeats.getSeatStatus(workspace.organizationId, userId),
  ]);
  const composition = resolveDoctorWorkspaceComposition({
    clinicTeamEntitled: teamEntitlement.ok,
    seats: seatStatus,
  });

  // Обычный снимок читается штатным staff-принципалом страницы. Биллинг последовательно сужается
  // до роли администратора клиники: параллельные запросы могли бы разделить подменённую роль одного
  // соединения.
  const snapshot = await deps.orgEntitlements.getSnapshot(workspace.organizationId);
  const billing = await runWithDbClinicBillingPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: userId,
      source: 'clinic-billing-account-read',
    },
    () => deps.saasBilling.getOrganizationBillingOverview(workspace.organizationId),
  );
  const tariffChange = await runWithDbClinicBillingPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: userId,
      source: 'clinic-billing-account-tariff-change-read',
    },
    () => deps.saasBilling.getOwnTariffChangeState(workspace.organizationId),
  );
  const selectedTariffChoice =
    tariffChange.choices.find((choice) => choice.id === tariffChange.currentTariffId) ?? null;
  const tariffDetails = snapshot.tariff
    ? {
        mechanics: snapshot.tariff.mechanics,
        quotas: snapshot.tariff.quotas,
        includedSeats: snapshot.tariff.includedSeats,
      }
    : selectedTariffChoice
      ? {
          mechanics: selectedTariffChoice.mechanics ?? {},
          quotas: selectedTariffChoice.quotas ?? {},
          includedSeats: null,
        }
      : null;
  const storage = storagePackageOffersBody(
    workspace.organizationId,
    await runWithDbClinicBillingPrincipal(
      {
        organizationId: workspace.organizationId,
        platformUserId: userId,
        source: 'clinic-billing-account-read',
      },
      () => deps.saasBilling.listStoragePackageOffers(workspace.organizationId),
    ),
  );
  const quotaUsage = (
    await resolveOwnOrgQuotaProjections(deps.orgEntitlements, workspace.organizationId)
  )
    .filter((projection) => projection.mechanic !== 'clinic_team' || composition !== 'solo')
    .map((projection) => ({ ...projection, label: MECHANIC_REGISTRY[projection.mechanic].label }));

  return (
    <BillingSection
      tariffName={snapshot.tariff?.name ?? null}
      commercialStateLabel={describeCommercialAccessState(snapshot.access)}
      quotaUsage={quotaUsage}
      billing={billing}
      tariffChange={tariffChange}
      tariffDetails={tariffDetails}
      storage={storage}
    />
  );
}

export async function loadProfileContent(
  deps: ReturnType<typeof buildAppDeps>,
  workspaceContext: AccountSectionsWorkspace | null,
  options?: {
    /**
     * Соло-специалист: владелец 15.09 велел убрать у него SMS-fallback и «показывать мне врачебные
     * экраны» — у одного человека этих понятий нет. Выключатель остаётся персоналу клиники.
     */
    hideSoloOnlyToggles?: boolean;
  },
): Promise<ReactNode> {
  const hideSoloOnlyToggles = options?.hideSoloOnlyToggles === true;
  const doctorSettings =
    !hideSoloOnlyToggles && workspaceContext?.canAccessClinicalWorkspace
      ? await deps.systemSettings.listSettingsByScope('doctor', {
          organizationId: workspaceContext.organizationId,
        })
      : [];
  return (
    <>
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
    </>
  );
}

export async function loadAccountEmailContent(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
): Promise<ReactNode> {
  const accountEmail = await deps.userProjection.getProfileEmailFields(userId);
  return (
    <DoctorAccountEmailSection
      initialEmail={accountEmail.email}
      emailVerified={Boolean(accountEmail.emailVerifiedAt)}
    />
  );
}

export async function loadSecurityContent(
  deps: ReturnType<typeof buildAppDeps>,
  session: StaffAccountPageContext['session'],
  workspaceContext: AccountSectionsWorkspace | null,
  recoveryOnly: boolean,
  isPlatformConsole: boolean,
): Promise<ReactNode> {
  const [[storedStatus, accountEmail], passkeyEnabled, loginDevices] = await Promise.all([
    runWithStaffSecuritySelfPrincipal(session.user.userId, 'app/account:security-self', () =>
      Promise.all([
        deps.staffSecurity.getStatus(),
        deps.userProjection.getProfileEmailFields(session.user.userId),
      ]),
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
        verifiedEmail={accountEmail.emailVerifiedAt ? accountEmail.email : null}
        showSpecialistFirstRun={false}
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
