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
import { ClinicDeliveryChannelsSection } from './ClinicDeliveryChannelsSection';
import { OrgBrandingSection } from './OrgBrandingSection';
import { OrgCustomDomainSection } from './OrgCustomDomainSection';
import { SettingsForm } from './SettingsForm';
import { SettingsTabsNav } from './SettingsTabsNav';
import type { SettingsTabId } from './settingsTabs';
import { TeamSection } from './TeamSection';
import { env } from '@/config/env';
import { parseDoctorTodayPreferences } from '@/modules/system-settings/doctorTodayPreferences';
import { parsePlatformIntegrationAvailabilityEnvelope } from '@/modules/system-settings/platformIntegrationAvailability';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';
import { shouldShowGoogleCalendarSettings } from './googleCalendarVisibility';
import { type AppointmentReminderSpecialistSettings } from '@/modules/booking-notifications/appointmentReminderPresets';

type LegacySettingsTab = 'specialist' | 'organization' | 'team' | 'billing' | 'install';

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
    ? ((valueJson as Record<string, unknown>).value as T)
    : fallback;
}

function dedicatedBotWebhookPath(
  channel: 'telegram' | 'max',
  valueJson: unknown,
): string | null {
  const credential = String(valueOf(valueJson, '') ?? '').trim();
  if (!credential) return null;
  const fingerprint = createHash('sha256').update(credential).digest('hex');
  return `/webhook/${channel}/dedicated/${fingerprint}`;
}

function parseTab(raw: string | string[] | undefined): LegacySettingsTab | null {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (value === undefined) return null;
  return value === 'organization' || value === 'team' || value === 'billing' || value === 'install'
    ? value
    : 'specialist';
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
  if (tab === 'specialist') redirect(routePaths.account);
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
  const teamEntitlement = await requireEntitlementForReadAction(
    { organizationId: workspace.organizationId },
    'clinic_team',
  );
  // §29 владельца: биллинг клиники видит владелец И администратор клиники («админ клиники или соло-специалист
  // — равноценно»), а обычный персонал не видит. Условие потеряно лидом при разрешении конфликта слияния
  // 28.07 и возвращено: тест «shows billing to owner and clinic admin» падал на редиректе админа.
  const canAccessBilling =
    workspace.membershipRole === 'owner' || workspace.membershipRole === 'admin' || isGlobalAdmin;
  const visibleTabs: SettingsTabId[] = [
    'organization',
    ...(teamEntitlement.ok ? (['team'] as const) : []),
    ...(canAccessBilling ? (['billing'] as const) : []),
  ];

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
      platformSettings,
      brandingState,
      slugState,
      customDomainSurface,
      customDomainMutation,
    ] = await Promise.all([
      deps.systemSettings.listSettingsByScope('doctor', {
        organizationId: workspace.organizationId,
      }),
      deps.systemSettings.listSettingsByScope('admin', {
        organizationId: workspace.organizationId,
      }),
      deps.systemSettings.listSettingsByScope('admin', { organizationId: null }),
      withDoctorWorkspacePrincipal(workspace, 'app.settings.org-branding.read', () =>
        deps.orgBranding.getManagementState(brandingCtx),
      ),
      workspace.canManageOrganization && deps.clinicDirectory
        ? deps.clinicDirectory.getSlugManagementState(workspace.organizationId)
        : Promise.resolve(null),
      canManageCustomDomain
        ? getMechanicSurfaceVisibility(workspace, 'custom_domain')
        : Promise.resolve(null),
      canManageCustomDomain
        ? getMechanicMutationAvailability(workspace, 'custom_domain')
        : Promise.resolve(null),
    ]);
    const publishedBrand = brandingState.published;
    const publishedLogoUrl =
      publishedBrand?.logoMediaReady && publishedBrand.logoMediaId
        ? orgBrandLogoUrl(publishedBrand.logoMediaId)
        : null;
    const patientLabel = valueOf(
      doctorSettings.find((setting) => setting.key === 'patient_label')?.valueJson,
      'пациент',
    );
    const appointmentReminderSettings: AppointmentReminderSpecialistSettings = workspace.specialistId
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
    const platformAdminValue = (key: string, fallback = '') =>
      String(
        valueOf(platformSettings.find((setting) => setting.key === key)?.valueJson, fallback) ??
          fallback,
      ).trim();
    const platformGoogleConfigured = [
      'google_client_id',
      'google_client_secret',
      'google_redirect_uri',
    ].every((key) => platformAdminValue(key) !== '');
    const integrationAvailability = parsePlatformIntegrationAvailabilityEnvelope(
      platformSettings.find((setting) => setting.key === 'platform_integration_availability')
        ?.valueJson,
    );
    const externalCalendarEnabled = await isMechanicIncluded(workspace, 'external_calendar');
    const clinicAdminSetting = (key: string) =>
      clinicAdminSettings.find(
        (setting) => setting.key === key && setting.organizationId === workspace.organizationId,
      ) ?? null;
    const clinicSmtp = smtpInnerFromValueJson(
      clinicAdminSetting('clinic_smtp_outbound')?.valueJson,
    );
    const clinicDelivery = {
      smtp: {
        configured: clinicSmtp.success,
        host: clinicSmtp.success ? clinicSmtp.data.host : '',
        port: clinicSmtp.success ? String(clinicSmtp.data.port) : '587',
        secure: clinicSmtp.success ? clinicSmtp.data.secure : false,
        user: clinicSmtp.success ? clinicSmtp.data.user : '',
        from: clinicSmtp.success ? clinicSmtp.data.from : '',
      },
      smsConfigured: clinicAdminSetting('clinic_smsc_api_key') !== null,
      telegramConfigured: clinicAdminSetting('clinic_telegram_bot_token') !== null,
      maxConfigured: clinicAdminSetting('clinic_max_bot_api_key') !== null,
      telegramWebhookPath: dedicatedBotWebhookPath(
        'telegram',
        clinicAdminSetting('clinic_telegram_bot_token')?.valueJson,
      ),
      maxWebhookPath: dedicatedBotWebhookPath(
        'max',
        clinicAdminSetting('clinic_max_bot_api_key')?.valueJson,
      ),
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
            key={`${brandingState.accessState}:${publishedBrand?.displayName ?? ''}:${publishedBrand?.logoMediaId ?? ''}`}
            brandingMutationAvailable={brandingState.brandingMutationAvailable}
            coreDisplayName={brandingState.effective.core.displayName}
            publishedDisplayName={publishedBrand?.displayName ?? null}
            publishedLogoMediaId={publishedBrand?.logoMediaId ?? null}
            publishedLogoUrl={publishedLogoUrl}
          />
        ) : null}
        {customDomainSurface?.directUrl ? (
          <OrgCustomDomainSection
            key={`${customDomainMutation?.available ? 'write' : 'read'}:${clinicAdminValue('org_custom_domain_hostname')}`}
            hostname={clinicAdminValue('org_custom_domain_hostname')}
            mutationAvailable={customDomainMutation?.available === true}
          />
        ) : null}
        {slugState ? (
          <ClinicSlugSection initialState={slugState} appBaseUrl={env.APP_BASE_URL} />
        ) : null}
        <SettingsForm
          patientLabel={String(patientLabel)}
          supportCommentsWithoutSupportDefault={false}
          supportMediaWithoutSupportDefault={false}
          settingsEndpoint="/api/admin/settings"
          showSupportDefaults={false}
        />
        <DoctorTodayPreferencesSection
          initialPreferences={todayPreferences}
          settingsEndpoint="/api/admin/settings"
        />
        {workspace.specialistId ? (
          <AppointmentReminderSettingsSection initialSettings={appointmentReminderSettings} />
        ) : null}
        <ClinicDeliveryChannelsSection initial={clinicDelivery} />
        {shouldShowGoogleCalendarSettings(
          integrationAvailability.integrations.google_calendar,
          externalCalendarEnabled,
        ) ? (
          <GoogleCalendarSection
            platformOAuthConfigured={platformGoogleConfigured}
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
    if (!teamEntitlement.ok) redirect(`${routePaths.settings}?tab=organization`);

    const deps = buildAppDeps();
    const [members, invites, seats, mutationAvailability] = await Promise.all([
      deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
      deps.organizationInvites.listPending(workspace.organizationId),
      deps.clinicSeats.getSeatStatus(
        workspace.organizationId,
        workspace.session.user.userId,
      ),
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
  const mechanicRows: BillingMechanicRow[] = MECHANICS.map((mechanic) => ({
    mechanic,
    label: MECHANIC_REGISTRY[mechanic].label,
    enabled: entitlements[mechanic],
  }));
  // §5a stage 6.1 — "использовано из включённого". Own-org usage, not the platform report's
  // cross-org `getEnforcedQuotaUsage` (see resolveOwnOrgQuotaProjections).
  const quotaUsage = (
    await resolveOwnOrgQuotaProjections(deps.orgEntitlements, workspace.organizationId)
  ).map((projection) => ({ ...projection, label: MECHANIC_REGISTRY[projection.mechanic].label }));

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
