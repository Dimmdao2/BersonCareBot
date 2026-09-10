import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
  isMechanicIncluded,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { isCabinetEntryBlocked } from '@/app-layer/guards/cabinetAccessGate';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { isSeatConsumingMember } from '@/modules/clinic-seats/service';
import { resolveDoctorWorkspaceComposition } from '@/modules/doctor-workspace/composition';
import {
  entitlementsFromSnapshot,
  resolveOwnOrgQuotaProjections,
} from '@/modules/org-entitlements/service';
import { MECHANIC_REGISTRY, MECHANICS } from '@/modules/org-entitlements/types';
import { orgBrandLogoUrl, type OrgBrandingManagementContext } from '@/modules/org-branding/service';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from './adminSettingsData';
import { AppointmentReminderSettingsSection } from './AppointmentReminderSettingsSection';
import { GoogleCalendarSection } from './GoogleCalendarSection';
import { BillingSection, type BillingMechanicRow } from './BillingSection';
import { describeCommercialAccessState } from './billingCommercialState';
import { DoctorTodayPreferencesSection } from './DoctorTodayPreferencesSection';
import { ClinicSlugSection } from './ClinicSlugSection';
import { ClinicPublicCardSection } from './ClinicPublicCardSection';
import { ClinicBookingLinkSection } from './ClinicBookingLinkSection';
import { BookingPaymentsSection } from './BookingPaymentsSection';
import { ClinicDeliveryChannelsSection } from './ClinicDeliveryChannelsSection';
import { OrgBrandingSection } from './OrgBrandingSection';
import { OrgCustomDomainSection } from './OrgCustomDomainSection';
import { SettingsForm } from './SettingsForm';
import { ClinicStaffSecuritySection } from './ClinicStaffSecuritySection';
import { SettingsTabsNav } from './SettingsTabsNav';
import type { SettingsTabId } from './settingsTabs';
import { TeamSection } from './TeamSection';
import { BookingSoloSpecialistsSection } from './BookingSoloSpecialistsSection';
import { ManagementBookingSections } from '../manage/ManagementBookingSections';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import { parseDoctorTodayPreferences } from '@/modules/system-settings/doctorTodayPreferences';
import { isPlatformIntegrationAvailable } from '@/modules/system-settings/platformIntegrationAvailability';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';
import { shouldShowGoogleCalendarSettings } from './googleCalendarVisibility';
import { type AppointmentReminderSpecialistSettings } from '@/modules/booking-notifications/appointmentReminderPresets';
import { parseClinicDeliveryReadiness } from '@/modules/system-settings/clinicDeliveryReadiness';
import { parseClinicBotPublicConfig } from '@/modules/system-settings/clinicBotConfig';
import { parseBookingPaymentSettingsValue } from '@/modules/payments/bookingPaymentSettings';
import { redactAdminSettingsForClient } from '@/modules/system-settings/webPushVapidRuntime';
import {
  parseDoctorWorkspaceClientDefaults,
  parseDoctorWorkspaceComposition,
  type WorkspaceModuleAvailability,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import {
  normalizeSupportGroupLabel,
  SUPPORT_GROUP_LABEL_KEY,
} from '@/modules/system-settings/patientTerms';
import { DoctorPatientTermsProvider } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type LegacySettingsTab = 'specialist' | 'organization' | 'booking' | 'team' | 'billing' | 'install';

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
    ? ((valueJson as Record<string, unknown>).value as T)
    : fallback;
}

function dedicatedBotWebhookPath(channel: 'telegram' | 'max', valueJson: unknown): string | null {
  const credential = String(valueOf(valueJson, '') ?? '').trim();
  if (!credential) return null;
  const fingerprint = createHash('sha256').update(credential).digest('hex');
  return `/webhook/${channel}/dedicated/${fingerprint}`;
}

function parseTab(raw: string | string[] | undefined): LegacySettingsTab | null {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (value === undefined) return null;
  return value === 'organization' ||
    value === 'booking' ||
    value === 'team' ||
    value === 'billing' ||
    value === 'install'
    ? value
    : 'specialist';
}

function clinicTechnicalRootUrl(slug: string): string {
  const patientOrigin = new URL(PATIENT_DEFAULT_SURFACE.origin);
  patientOrigin.hostname = `${slug}.${patientOrigin.hostname}`;
  patientOrigin.pathname = '/';
  patientOrigin.search = '';
  patientOrigin.hash = '';
  return patientOrigin.toString();
}

function clinicBookingUrl(slug: string): string {
  return new URL(`/book/${encodeURIComponent(slug)}`, PATIENT_DEFAULT_SURFACE.origin).toString();
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tab?: string | string[];
    adminTab?: string | string[];
    probe?: string | string[];
  }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const legacyAdminTab = typeof sp.adminTab === 'string' ? sp.adminTab : sp.adminTab?.[0];
  if (legacyAdminTab && ADMIN_TAB_REDIRECTS[legacyAdminTab]) {
    const target = ADMIN_TAB_REDIRECTS[legacyAdminTab];
    const probe = parseHealthArchiveProbeParam(sp.probe);
    redirect(probe ? `${target}?probe=${encodeURIComponent(probe)}` : target);
  }

  const tab = parseTab(sp.tab);
  if (tab === 'install') redirect(`${routePaths.account}?tab=install`);

  const workspace = await requireOrganizationWorkspaceContext({ allowCabinetRecovery: true });
  const cabinetAccess = await buildAppDeps().orgEntitlements.resolveCabinetAccess(
    workspace.organizationId,
  );
  if (isCabinetEntryBlocked(cabinetAccess) && tab !== 'billing') {
    redirect(`${routePaths.settings}?tab=billing`);
  }
  const isGlobalAdmin = workspace.session.user.role === 'admin';
  const canManageOrganization = workspace.canManageOrganization || isGlobalAdmin;
  if (!canManageOrganization) redirect(routePaths.account);

  // Resolved once up front (not just inside the "team"/"billing" branches) so every rendered tab
  // can show the same nav with only the sections this viewer may actually open — Defect #1
  // 2026-07-25: the page had no nav at all, so `?tab=team`/`?tab=billing` were reachable only by
  // typing the URL.
  const depsForComposition = buildAppDeps();
  const [teamEntitlement, seatStatus] = await Promise.all([
    requireEntitlementForReadAction({ organizationId: workspace.organizationId }, 'clinic_team'),
    depsForComposition.clinicSeats.getSeatStatus(
      workspace.organizationId,
      workspace.session.user.userId,
    ),
  ]);
  const composition = resolveDoctorWorkspaceComposition({
    clinicTeamEntitled: teamEntitlement.ok,
    seats: seatStatus,
  });
  // §29 владельца: биллинг клиники видит владелец И администратор клиники («админ клиники или соло-специалист
  // — равноценно»), а обычный персонал не видит. Условие потеряно лидом при разрешении конфликта слияния
  // 28.07 и возвращено: тест «shows billing to owner and clinic admin» падал на редиректе админа.
  const canAccessBilling =
    workspace.membershipRole === 'owner' || workspace.membershipRole === 'admin' || isGlobalAdmin;
  const visibleTabs: SettingsTabId[] = [
    'organization',
    // Owner ruling 2026-09-10: solo has no cabinet-mode switch, so the booking writers that clinic
    // management owns under `/app/manage` are reached here instead — one settings place, no mode.
    ...(composition === 'solo' ? (['booking'] as const) : []),
    ...(composition === 'solo' && workspace.specialistId !== null ? (['specialist'] as const) : []),
    ...(composition === 'clinic' && teamEntitlement.ok ? (['team'] as const) : []),
    ...(canAccessBilling ? (['billing'] as const) : []),
  ];

  if (tab === 'specialist') {
    if (composition !== 'solo' || workspace.specialistId === null) {
      redirect(`${routePaths.settings}?tab=${composition === 'clinic' ? 'team' : 'organization'}`);
    }
    return (
      <DoctorAppShell title="Профиль специалиста" user={workspace.session.user}>
        <DoctorPageHeader title="Профиль специалиста" />
        <SettingsTabsNav activeTab="specialist" visibleTabs={visibleTabs} />
        <BookingSoloSpecialistsSection variant="solo-profile" />
      </DoctorAppShell>
    );
  }

  if (tab === 'booking') {
    // Clinic composition keeps these writers in its own management workspace; only the solo hub
    // hosts them here, so the section never exists in two navigations at once.
    if (composition !== 'solo') redirect('/app/manage/online-booking');
    const [notificationTemplatesVisibility, doctorStatisticsVisibility] = await Promise.all([
      getMechanicSurfaceVisibility(workspace, 'branding'),
      getMechanicSurfaceVisibility(workspace, 'doctor_statistics'),
    ]);
    return (
      <DoctorAppShell title="Онлайн-запись" user={workspace.session.user} layout="full-height">
        <DoctorPageHeader title="Онлайн-запись" />
        <SettingsTabsNav activeTab="booking" visibleTabs={visibleTabs} />
        <ManagementBookingSections
          basePath={routePaths.settings}
          notificationTemplatesVisible={notificationTemplatesVisibility.specialistNavigation}
          doctorStatisticsEnabled={doctorStatisticsVisibility.specialistNavigation}
          // Memberships stay with the solo specialist's own «Расписание» writer, and the single
          // specialist is edited in the tab next door — one place per writer, no duplicates.
          packagesVisible={false}
          specialistsVisible={false}
        />
      </DoctorAppShell>
    );
  }

  if (tab === null || tab === 'organization') {
    const deps = buildAppDeps();
    // The RSC render already gated this whole tab on `canManageOrganization` above, so this context
    // is built directly from the resolved workspace rather than re-running the guard a second time.
    // `requireOrgBrandingManagementContext()` remains the ONLY way to obtain this context for a
    // mutation (see brandingActions.ts) — it is never trusted from a client payload.
    const brandingCtx: OrgBrandingManagementContext = {
      organizationId: workspace.organizationId,
      actorPlatformUserId: workspace.session.user.userId,
      hasOrganizationManagementCapability: true,
    };
    const canManageCustomDomain = workspace.membershipRole === 'owner' || isGlobalAdmin;
    const [
      doctorSettings,
      clinicAdminSettings,
      integrationAvailability,
      brandingState,
      slugState,
      cardSettings,
      bookingLinkOptions,
      customDomainSurface,
      customDomainMutation,
      customDomainBinding,
      paymentsVisibility,
      paymentsMutation,
      mailingsVisibility,
      analyticsVisibility,
      videoMeetingsVisibility,
    ] = await Promise.all([
      deps.systemSettings.listSettingsByScope('doctor', {
        organizationId: workspace.organizationId,
      }),
      deps.systemSettings.listSettingsByScope('admin', {
        organizationId: workspace.organizationId,
      }),
      deps.systemSettings.getClinicPlatformIntegrationAvailability(),
      withDoctorWorkspacePrincipal(workspace, 'app.settings.org-branding.read', () =>
        deps.orgBranding.getManagementState(brandingCtx),
      ),
      workspace.canManageOrganization && deps.clinicDirectory
        ? deps.clinicDirectory.getSlugManagementState(workspace.organizationId)
        : Promise.resolve(null),
      workspace.canManageOrganization && deps.clinicPublicCard
        ? withDoctorWorkspacePrincipal(workspace, 'app.settings.clinic-public-card.read', () =>
            deps.clinicPublicCard!.readCardSettings(workspace.organizationId),
          )
        : Promise.resolve(null),
      workspace.canManageOrganization && deps.bookingEngine
        ? withDoctorWorkspacePrincipal(workspace, 'app.settings.booking-link.read', async () => {
            const [branches, specialists] = await Promise.all([
              deps.bookingEngine!.catalog.listBranches(workspace.organizationId),
              deps.bookingEngine!.catalog.listSpecialists(workspace.organizationId),
            ]);
            return {
              branches: branches
                .filter((branch) => branch.isActive)
                .map((branch) => ({ id: branch.id, title: branch.title })),
              specialists: specialists
                .filter((specialist) => specialist.isActive)
                .map((specialist) => ({ id: specialist.id, title: specialist.fullName })),
            };
          })
        : Promise.resolve(null),
      canManageCustomDomain
        ? getMechanicSurfaceVisibility(workspace, 'custom_domain')
        : Promise.resolve(null),
      canManageCustomDomain
        ? getMechanicMutationAvailability(workspace, 'custom_domain')
        : Promise.resolve(null),
      canManageCustomDomain && deps.customDomainBinding
        ? deps.customDomainBinding.getBindingState(workspace.organizationId)
        : Promise.resolve(null),
      getMechanicSurfaceVisibility(workspace, 'payments'),
      getMechanicMutationAvailability(workspace, 'payments'),
      getMechanicSurfaceVisibility(workspace, 'mailings'),
      getMechanicSurfaceVisibility(workspace, 'doctor_statistics'),
      getMechanicSurfaceVisibility(workspace, 'video_meetings'),
    ]);
    const publishedBrand = brandingState.published;
    const publishedLogoUrl =
      publishedBrand?.logoMediaReady && publishedBrand.logoMediaId
        ? orgBrandLogoUrl(publishedBrand.logoMediaId)
        : null;
    // Предпросмотр иконки в кабинете берёт ИСХОДНИК через ту же сессионную дверь медиа, что и
    // логотип: готовые размеры — для пациентской поверхности, а врачу надо видеть, что он выбрал.
    const publishedAppIconUrl =
      publishedBrand?.appIconMediaReady && publishedBrand.appIconMediaId
        ? orgBrandLogoUrl(publishedBrand.appIconMediaId)
        : null;
    const patientLabel = valueOf(
      doctorSettings.find((setting) => setting.key === 'patient_label')?.valueJson,
      'пациент',
    );
    const supportGroupLabel =
      normalizeSupportGroupLabel(
        valueOf(
          doctorSettings.find((setting) => setting.key === SUPPORT_GROUP_LABEL_KEY)?.valueJson,
          'on_support',
        ),
      ) ?? 'on_support';
    const workspaceComposition = parseDoctorWorkspaceComposition(
      doctorSettings.find((setting) => setting.key === 'doctor_workspace_composition')?.valueJson,
    );
    const workspaceClientDefaults = parseDoctorWorkspaceClientDefaults(
      doctorSettings.find((setting) => setting.key === 'doctor_workspace_client_defaults')
        ?.valueJson,
      {
        legacyCommentsWithoutSupportEnabled: valueOf(
          doctorSettings.find(
            (setting) =>
              setting.key === 'doctor_patient_support_comments_without_support_default_enabled',
          )?.valueJson,
          false,
        ),
        legacyMediaWithoutSupportEnabled: valueOf(
          doctorSettings.find(
            (setting) =>
              setting.key === 'doctor_patient_support_media_without_support_default_enabled',
          )?.valueJson,
          false,
        ),
      },
    );
    const staffSecondFactorRequired = valueOf(
      doctorSettings.find((setting) => setting.key === 'doctor_staff_second_factor_required')
        ?.valueJson,
      false,
    );
    const workspaceModuleAvailability: WorkspaceModuleAvailability = {
      medical_record: true,
      encounters: true,
      rehabilitation: true,
      direct_chat: true,
      program_comments: true,
      program_media: true,
      mailings: mailingsVisibility.directUrl,
      analytics: analyticsVisibility.directUrl,
      client_portal: true,
      video_meetings: videoMeetingsVisibility.directUrl,
    };
    const appointmentReminderSettings: AppointmentReminderSpecialistSettings =
      workspace.specialistId
        ? ((await deps.bookingEngine?.getSpecialistAppointmentReminderSettings({
            organizationId: workspace.organizationId,
            specialistId: workspace.specialistId,
          })) ?? { allowedPresetIds: [], defaultPresetId: null })
        : { allowedPresetIds: [], defaultPresetId: null };
    const todayPreferences = parseDoctorTodayPreferences(
      doctorSettings.find((setting) => setting.key === 'doctor_today_preferences')?.valueJson,
    );
    const clinicAdminValue = (key: string, fallback = '') =>
      String(
        valueOf(
          clinicAdminSettings.find(
            (setting) => setting.key === key && setting.organizationId === workspace.organizationId,
          )?.valueJson,
          fallback,
        ) ?? fallback,
      ).trim();
    const clinicGoogleEnabled = Boolean(
      valueOf(
        clinicAdminSettings.find(
          (setting) =>
            setting.key === 'google_calendar_enabled' &&
            setting.organizationId === workspace.organizationId,
        )?.valueJson,
        false,
      ),
    );
    const skipPublicCardAtRoot =
      valueOf<unknown>(
        clinicAdminSettings.find(
          (setting) =>
            setting.key === 'clinic_root_skip_public_card' &&
            setting.organizationId === workspace.organizationId,
        )?.valueJson,
        false,
      ) === true;
    /**
     * PAY-APPT-21: clinic settings own the acquiring account, so the provider choice and its
     * credentials are read here instead of in the calendar tab.
     *
     * PAY-APPT-22: the rows go through the SAME browser-facing projection the settings API uses
     * (`redactAdminSettingsForClient`), so this SSR payload cannot become a second, laxer contract
     * that ships the secret straight into the HTML.
     */
    const clientClinicAdminSettings = redactAdminSettingsForClient(clinicAdminSettings);
    const clientClinicAdminSetting = (key: string) =>
      clientClinicAdminSettings.find(
        (setting) => setting.key === key && setting.organizationId === workspace.organizationId,
      ) ?? null;
    const bookingPaymentProviders = parseBookingPaymentSettingsValue(
      clientClinicAdminSetting('booking_payment_providers')?.valueJson ?? null,
    );
    const bookingPaymentEnabled =
      valueOf<unknown>(clientClinicAdminSetting('booking_payment_enabled')?.valueJson, false) ===
      true;

    const [
      clinicSmtpEnabled,
      externalCalendarEnabled,
      clinicTelegramBotMutation,
      clinicMaxBotMutation,
    ] = await Promise.all([
      isMechanicIncluded(workspace, 'clinic_smtp'),
      isMechanicIncluded(workspace, 'external_calendar'),
      getMechanicMutationAvailability(workspace, 'clinic_telegram_bot'),
      getMechanicMutationAvailability(workspace, 'clinic_max_bot'),
    ]);
    const clinicAdminSetting = (key: string) =>
      clinicAdminSettings.find(
        (setting) => setting.key === key && setting.organizationId === workspace.organizationId,
      ) ?? null;
    const clinicSmtp = smtpInnerFromValueJson(
      clinicAdminSetting('clinic_smtp_outbound')?.valueJson,
    );
    const clinicSmtpSetting = clinicAdminSetting('clinic_smtp_outbound');
    const clinicTelegramSetting = clinicAdminSetting('clinic_telegram_bot_token');
    const clinicMaxSetting = clinicAdminSetting('clinic_max_bot_api_key');
    const clinicDelivery = {
      smtp: {
        configured: clinicSmtp.success,
        host: clinicSmtp.success ? clinicSmtp.data.host : '',
        port: clinicSmtp.success ? String(clinicSmtp.data.port) : '587',
        secure: clinicSmtp.success ? clinicSmtp.data.secure : false,
        user: clinicSmtp.success ? clinicSmtp.data.user : '',
        from: clinicSmtp.success ? clinicSmtp.data.from : '',
        readiness: parseClinicDeliveryReadiness(clinicSmtpSetting?.valueJson),
      },
      smsConfigured: clinicAdminSetting('clinic_smsc_api_key') !== null,
      vkConfigured: clinicAdminSetting('clinic_vk_community_access_token') !== null,
    };
    const clinicBots = {
      telegram: {
        available:
          brandingState.brandingMutationAvailable &&
          clinicTelegramBotMutation.available &&
          isPlatformIntegrationAvailable(integrationAvailability, 'telegram'),
        configured: clinicTelegramSetting !== null,
        readiness: parseClinicDeliveryReadiness(clinicTelegramSetting?.valueJson),
        publicConfig: parseClinicBotPublicConfig(clinicTelegramSetting?.valueJson),
        webhookPath: dedicatedBotWebhookPath('telegram', clinicTelegramSetting?.valueJson),
      },
      max: {
        available:
          brandingState.brandingMutationAvailable &&
          clinicMaxBotMutation.available &&
          isPlatformIntegrationAvailable(integrationAvailability, 'max'),
        configured: clinicMaxSetting !== null,
        readiness: parseClinicDeliveryReadiness(clinicMaxSetting?.valueJson),
        publicConfig: parseClinicBotPublicConfig(clinicMaxSetting?.valueJson),
        webhookPath: dedicatedBotWebhookPath('max', clinicMaxSetting?.valueJson),
      },
    };
    return (
      <DoctorAppShell title="Настройки" user={workspace.session.user}>
        <DoctorPageHeader title="Настройки" />
        <SettingsTabsNav activeTab="organization" visibleTabs={visibleTabs} />
        {workspace.membershipRole === 'owner' && workspace.specialistId === null ? (
          <DoctorSection>
            <DoctorSectionHeader>
              <DoctorSectionTitle>Кабинет специалиста недоступен</DoctorSectionTitle>
            </DoctorSectionHeader>
            <p className="text-sm">
              К членству владельца не привязан профиль специалиста. Перейдите в личный аккаунт и
              подключите рабочий кабинет.
            </p>
            <Link className="text-sm underline" href="/app/account?tab=security">
              Перейти в личный аккаунт
            </Link>
          </DoctorSection>
        ) : null}
        {brandingState.brandingVisible ? (
          <OrgBrandingSection
            key={`${brandingState.accessState}:${publishedBrand ? 'published' : 'unpublished'}:${publishedBrand?.displayName ?? ''}:${publishedBrand?.logoMediaId ?? ''}:${publishedBrand?.appIconMediaId ?? ''}`}
            brandingMutationAvailable={brandingState.brandingMutationAvailable}
            coreDisplayName={brandingState.effective.core.displayName}
            hasPublishedRevision={publishedBrand !== null}
            publishedDisplayName={publishedBrand?.displayName ?? null}
            publishedLogoMediaId={publishedBrand?.logoMediaId ?? null}
            publishedLogoUrl={publishedLogoUrl}
            publishedAppIconMediaId={publishedBrand?.appIconMediaId ?? null}
            publishedAppIconUrl={publishedAppIconUrl}
            clinicBots={clinicBots}
          />
        ) : null}
        {customDomainSurface?.directUrl ? (
          <OrgCustomDomainSection
            key={`${customDomainMutation?.available ? 'write' : 'read'}:${customDomainBinding?.hostname ?? clinicAdminValue('org_custom_domain_hostname')}`}
            initialDomain={clinicAdminValue('org_custom_domain_hostname')}
            initialBinding={customDomainBinding}
            mutationAvailable={customDomainMutation?.available === true}
          />
        ) : null}
        {slugState ? (
          <ClinicSlugSection
            initialState={slugState}
            patientOrigin={PATIENT_DEFAULT_SURFACE.origin}
          />
        ) : null}
        {slugState?.currentSlug && bookingLinkOptions ? (
          <ClinicBookingLinkSection
            bookingUrl={clinicBookingUrl(slugState.currentSlug)}
            branches={bookingLinkOptions.branches}
            specialists={bookingLinkOptions.specialists}
          />
        ) : null}
        {cardSettings ? (
          <ClinicPublicCardSection
            initialSettings={cardSettings}
            skipPublicCardAtRoot={skipPublicCardAtRoot}
            publicUrl={
              slugState?.currentSlug ? clinicTechnicalRootUrl(slugState.currentSlug) : null
            }
          />
        ) : null}
        <SettingsForm
          patientLabel={String(patientLabel)}
          smsFallbackEnabled={false}
          supportCommentsWithoutSupportDefault={false}
          supportMediaWithoutSupportDefault={false}
          settingsEndpoint="/api/admin/settings"
          workspaceComposition={workspaceComposition}
          workspaceClientDefaults={workspaceClientDefaults}
          workspaceModuleAvailability={workspaceModuleAvailability}
          supportGroupLabel={supportGroupLabel}
          showSupportDefaults={false}
        />
        {workspace.membershipRole === 'owner' ? (
          <ClinicStaffSecuritySection initialRequired={Boolean(staffSecondFactorRequired)} />
        ) : null}
        <DoctorPatientTermsProvider
          patientLabel={String(patientLabel)}
          supportGroupLabel={supportGroupLabel}
        >
          <DoctorTodayPreferencesSection
            initialPreferences={todayPreferences}
            settingsEndpoint="/api/admin/settings"
          />
        </DoctorPatientTermsProvider>
        {workspace.specialistId ? (
          <AppointmentReminderSettingsSection initialSettings={appointmentReminderSettings} />
        ) : null}
        {paymentsVisibility.directUrl ? (
          <BookingPaymentsSection
            paymentEnabled={bookingPaymentEnabled}
            providersJson={bookingPaymentProviders}
            readOnly={!paymentsMutation.available}
          />
        ) : null}
        <ClinicDeliveryChannelsSection
          initial={clinicDelivery}
          platformAvailability={integrationAvailability}
          smtpEntitled={clinicSmtpEnabled}
        />
        {shouldShowGoogleCalendarSettings(
          isPlatformIntegrationAvailable(integrationAvailability, 'google_calendar'),
          externalCalendarEnabled,
        ) ? (
          <GoogleCalendarSection
            hasRefreshToken={clinicAdminValue('google_refresh_token').length > 0}
            googleCalendarId={clinicAdminValue('google_calendar_id')}
            googleCalendarEnabled={clinicGoogleEnabled}
            googleConnectedEmail={clinicAdminValue('google_connected_email')}
          />
        ) : null}
      </DoctorAppShell>
    );
  }

  if (tab === 'team') {
    if (composition !== 'clinic' || !teamEntitlement.ok)
      redirect(`${routePaths.settings}?tab=organization`);

    const deps = buildAppDeps();
    const [members, invites, seats, mutationAvailability] = await Promise.all([
      deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
      deps.organizationInvites.listPending(workspace.organizationId),
      deps.clinicSeats.getSeatStatus(workspace.organizationId, workspace.session.user.userId),
      getMechanicMutationAvailability({ organizationId: workspace.organizationId }, 'clinic_team'),
    ]);
    return (
      <DoctorAppShell title="Команда" user={workspace.session.user}>
        <DoctorPageHeader title="Команда" />
        <SettingsTabsNav activeTab="team" visibleTabs={visibleTabs} />
        <TeamSection
          members={members.map((member) => ({
            id: member.id,
            displayName: member.displayName,
            role: member.role,
            status: member.status,
            seatConsuming: isSeatConsumingMember(member),
            specialistLinked: member.specialistId !== null,
            appointmentsManageOwn: member.appointmentsManageOwn,
            availabilityManageOwn: member.availabilityManageOwn,
          }))}
          invites={invites.map((invite) => ({
            id: invite.id,
            invitedEmail: invite.invitedEmail,
            invitedRole: invite.invitedRole,
            expiresAt: invite.expiresAt,
          }))}
          seats={seats}
          canMutateTeam={mutationAvailability.available}
        />
      </DoctorAppShell>
    );
  }

  if (!canAccessBilling) redirect(routePaths.account);

  const deps = buildAppDeps();
  // Страж рабочего пространства ставит обычный принципал сотрудника. Снимок тарифа читаем этим путём,
  // а запрос к таблицам биллинга сужаем до отдельной роли админа клиники (§29). Последовательно, а не
  // Promise.all: принципал биллинга подменяет роль подключения, и параллельный запрос в том же соединении
  // прочитал бы снимок уже под ней.
  const snapshot = await deps.orgEntitlements.getSnapshot(workspace.organizationId);
  const billing = await runWithDbClinicBillingPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: workspace.session.user.userId,
      source: 'clinic-billing-settings-read',
    },
    () => deps.saasBilling.getOrganizationBillingOverview(workspace.organizationId),
  );
  const tariffChange = await runWithDbClinicBillingPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: workspace.session.user.userId,
      source: 'clinic-billing-settings-tariff-change-read',
    },
    () => deps.saasBilling.getOwnTariffChangeState(workspace.organizationId),
  );
  const entitlements = entitlementsFromSnapshot(snapshot);
  // Owner ruling 2026-09-10: a solo cabinet never mentions team capacity — neither the seat count
  // nor a «Режим клиники» row, which would read as a mode marker. The clinic mode owns those rows.
  const hideTeamCapacity = composition === 'solo';
  const mechanicRows: BillingMechanicRow[] = MECHANICS.filter(
    (mechanic) => !(hideTeamCapacity && mechanic === 'clinic_team'),
  ).map((mechanic) => ({
    mechanic,
    label: MECHANIC_REGISTRY[mechanic].label,
    enabled: entitlements[mechanic],
  }));
  // §5a stage 6.1 — "использовано из включённого". Own-org usage, not the platform report's
  // cross-org `getEnforcedQuotaUsage` (see resolveOwnOrgQuotaProjections).
  const quotaUsage = (
    await resolveOwnOrgQuotaProjections(deps.orgEntitlements, workspace.organizationId)
  )
    .filter((projection) => !(hideTeamCapacity && projection.mechanic === 'clinic_team'))
    .map((projection) => ({ ...projection, label: MECHANIC_REGISTRY[projection.mechanic].label }));

  return (
    <DoctorAppShell title="Тариф и биллинг" user={workspace.session.user}>
      <DoctorPageHeader title="Тариф и биллинг" />
      <SettingsTabsNav activeTab="billing" visibleTabs={visibleTabs} />
      <BillingSection
        tariffName={snapshot.tariff?.name ?? null}
        commercialStateLabel={describeCommercialAccessState(snapshot.access)}
        mechanics={mechanicRows}
        quotaUsage={quotaUsage}
        billing={billing}
        tariffChange={tariffChange}
      />
    </DoctorAppShell>
  );
}
