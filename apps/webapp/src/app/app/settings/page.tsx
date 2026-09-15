import type { ReactNode } from 'react';
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
import { storagePackageOffersBody } from '@/app/api/clinic/billing/storagePackagePurchase';
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
import { SettingsTabsLayout } from './SettingsTabsNav';
import {
  ALL_SETTINGS_TABS,
  LEGACY_SETTINGS_TAB_REDIRECTS,
  SETTINGS_PAGE_TITLE,
  type SettingsTabId,
} from './settingsTabs';
import { TeamSection } from './TeamSection';
import {
  listCardLocationsForPreview,
  listCardServicesForPreview,
  listCardSpecialistsForPreview,
} from '@/modules/clinic-public-card/cabinetPreviewSelection';
import { BookingSoloSpecialistsSection } from './BookingSoloSpecialistsSection';
import {
  InstallSection,
  LogoutSection,
  loadProfileContent,
  loadSecurityContent,
} from '@/app/app/account/accountSections';
import { loadStaffNotificationsSection } from '@/app/app/account/staffNotificationsSection';
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
  APPOINTMENT_LABEL_KEY,
  normalizeSupportGroupLabel,
  SUPPORT_GROUP_LABEL_KEY,
} from '@/modules/system-settings/patientTerms';
import { DoctorPatientTermsProvider } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

const SETTINGS_TAB_IDS: readonly SettingsTabId[] = ALL_SETTINGS_TABS.map((tab) => tab.id);

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

/**
 * Разбор `?tab=`. Неизвестное значение — «Аккаунт», первая вкладка: адрес из старого письма или
 * чужой закладки не должен ронять экран, но и молча показывать «что-то» вместо запрошенного тоже
 * нельзя — прежние значения переводит `LEGACY_SETTINGS_TAB_REDIRECTS` ДО этого разбора.
 */
function parseTab(raw: string | string[] | undefined): SettingsTabId {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (value === undefined) return 'account';
  return SETTINGS_TAB_IDS.includes(value as SettingsTabId) ? (value as SettingsTabId) : 'account';
}

function clinicBookingUrl(slug: string): string {
  return new URL(`/book/${encodeURIComponent(slug)}`, PATIENT_DEFAULT_SURFACE.origin).toString();
}

/**
 * Тариф, использование включённого и докупка объёма — содержимое вкладки «Аккаунт».
 *
 * Владелец 15.09.2026 назвал их именно там: «тариф с возможностью выбрать новый, доступное место…
 * Отмена подписки и автоплатёж — ага». Отдельной вкладки «Тариф и биллинг» больше нет; прежний
 * адрес `?tab=billing` отвечает переходом сюда.
 */
async function loadBillingContent(
  workspace: Awaited<ReturnType<typeof requireOrganizationWorkspaceContext>>,
  composition: ReturnType<typeof resolveDoctorWorkspaceComposition>,
): Promise<ReactNode> {
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
  // Витрина докупки объёма — через ту же функцию, что отдаёт её маршруту `GET /api/clinic/billing`:
  // второго расчёта цены (и второго места, где выписывается котировка) не существует.
  const storage = storagePackageOffersBody(
    workspace.organizationId,
    await runWithDbClinicBillingPrincipal(
      {
        organizationId: workspace.organizationId,
        platformUserId: workspace.session.user.userId,
        source: 'clinic-billing-settings-read',
      },
      () => deps.saasBilling.listStoragePackageOffers(workspace.organizationId),
    ),
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
    <BillingSection
      tariffName={snapshot.tariff?.name ?? null}
      commercialStateLabel={describeCommercialAccessState(snapshot.access)}
      mechanics={mechanicRows}
      quotaUsage={quotaUsage}
      billing={billing}
      tariffChange={tariffChange}
      storage={storage}
    />
  );
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

  const requestedTab = typeof sp.tab === 'string' ? sp.tab : sp.tab?.[0];
  // Прежние адреса вкладок живут вечно редиректом: закладка и ссылка в письме не умирают от того,
  // что разделы переставили (владелец 15.09 — разбор настроек на смысловые блоки).
  const legacyTarget = requestedTab ? LEGACY_SETTINGS_TAB_REDIRECTS[requestedTab] : undefined;
  if (legacyTarget) redirect(`${routePaths.settings}?tab=${legacyTarget}`);
  const tab = parseTab(sp.tab);

  const workspace = await requireOrganizationWorkspaceContext({ allowCabinetRecovery: true });
  const cabinetAccess = await buildAppDeps().orgEntitlements.resolveCabinetAccess(
    workspace.organizationId,
  );
  // Вход в кабинет закрыт коммерчески — человеку доступен ровно один разговор: тариф. Он живёт во
  // вкладке «Аккаунт» (владелец 15.09: тариф, место, отмена подписки — там).
  if (isCabinetEntryBlocked(cabinetAccess) && tab !== 'account') {
    redirect(`${routePaths.settings}?tab=account`);
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
  /**
   * Порядок — как у владельца (15.09). «Приём оплаты» показывается только при механике тарифа
   * («Далее „Прием оплаты“ если есть в тарифе»), «Команда» — только составу с командой.
   *
   * Владелец 10.09: у соло нет переключателя режима кабинета, поэтому писатели записи, которыми у
   * клиники владеет `/app/manage`, у соло живут здесь — одно место настроек, без режима.
   */
  const paymentsTabVisibility = await getMechanicSurfaceVisibility(workspace, 'payments');
  const visibleTabs: SettingsTabId[] = [
    'account',
    'profile',
    'public',
    'branding',
    ...(composition === 'solo' ? (['booking'] as const) : []),
    ...(paymentsTabVisibility.directUrl ? (['payments'] as const) : []),
    'workspace',
    'notifications',
    'integrations',
    ...(composition === 'clinic' && teamEntitlement.ok ? (['team'] as const) : []),
  ];

  if (tab !== 'team') {
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
      cardIdentity,
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
      workspace.canManageOrganization && deps.clinicPublicCard
        ? withDoctorWorkspacePrincipal(workspace, 'app.settings.clinic-public-card.read', () =>
            deps.clinicPublicCard!.readCardIdentity(workspace.organizationId),
          )
        : Promise.resolve(null),
      workspace.canManageOrganization && deps.bookingEngine
        ? withDoctorWorkspacePrincipal(workspace, 'app.settings.booking-link.read', async () => {
            const [branches, specialists, services] = await Promise.all([
              deps.bookingEngine!.catalog.listBranches(workspace.organizationId),
              deps.bookingEngine!.catalog.listSpecialists(workspace.organizationId),
              deps.bookingEngine!.services.listServices(workspace.organizationId),
            ]);
            return {
              branches: branches
                .filter((branch) => branch.isActive)
                .map((branch) => ({ id: branch.id, title: branch.title })),
              specialists: specialists
                .filter((specialist) => specialist.isActive)
                .map((specialist) => ({ id: specialist.id, title: specialist.fullName })),
              // В предпросмотр кабинета идёт ВСЁ, что у клиники есть, — решение владельца 11.09:
              // «В кабинете она вообще не фильтруется». Отбора здесь нет и быть не должно; модуль
              // `cabinetPreviewSelection` только выстраивает порядок двери и подписывает строки,
              // которые наружу сегодня не выходят.
              cardLocations: listCardLocationsForPreview(branches),
              cardSpecialists: listCardSpecialistsForPreview(specialists),
              cardServices: listCardServicesForPreview(services),
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
    const appointmentLabel = valueOf(
      doctorSettings.find((setting) => setting.key === APPOINTMENT_LABEL_KEY)?.valueJson,
      'приём',
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
    /**
     * Владелец 12.09.2026: «Галочку включили — из общего списка пропали». Дефолт ВЫКЛЮЧЕНО —
     * организация остаётся на общей платформе, пока сама не решит иначе.
     */
    const usesOwnPatientApp =
      valueOf<unknown>(
        clinicAdminSettings.find(
          (setting) =>
            setting.key === 'clinic_uses_own_patient_app' &&
            setting.organizationId === workspace.organizationId,
        )?.valueJson,
        false,
      ) === true;
    /**
     * #926 §17.Q. Дефолт ВКЛЮЧЕНО и здесь, и в двери каталога записи: клиника публикует визитку
     * каждого специалиста отдельной галкой, и молчаливое «не показываем» означало бы, что платформа
     * игнорирует уже сделанный ею выбор. Обоснование целиком — в реестре `system-settings`.
     */
    const showSpecialistCardsInBooking =
      valueOf<unknown>(
        clinicAdminSettings.find(
          (setting) =>
            setting.key === 'clinic_booking_show_specialist_cards' &&
            setting.organizationId === workspace.organizationId,
        )?.valueJson,
        true,
      ) !== false;
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
    const [notificationTemplatesVisibility, doctorStatisticsVisibility] = await Promise.all([
      getMechanicSurfaceVisibility(workspace, 'branding'),
      getMechanicSurfaceVisibility(workspace, 'doctor_statistics'),
    ]);

    /**
     * Владелец без привязанного профиля специалиста: предупреждение висит на «Профиле» — именно
     * там человек ищет своё имя и фотографию и не находит их.
     */
    const cabinetRecoveryNotice =
      workspace.membershipRole === 'owner' && workspace.specialistId === null ? (
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
      ) : null;

    const brandingSectionProps = {
      brandingMutationAvailable: brandingState.brandingMutationAvailable,
      coreDisplayName: brandingState.effective.core.displayName,
      hasPublishedRevision: publishedBrand !== null,
      publishedDisplayName: publishedBrand?.displayName ?? null,
      publishedLogoMediaId: publishedBrand?.logoMediaId ?? null,
      publishedLogoUrl,
      publishedAppIconMediaId: publishedBrand?.appIconMediaId ?? null,
      publishedAppIconUrl,
      usesOwnPatientApp,
      clinicBots,
    };
    const brandingSectionKey = `${brandingState.accessState}:${publishedBrand ? 'published' : 'unpublished'}:${publishedBrand?.displayName ?? ''}:${publishedBrand?.logoMediaId ?? ''}:${publishedBrand?.appIconMediaId ?? ''}`;

    let content: ReactNode = null;

    if (tab === 'account') {
      // Личные разделы — тем же модулем, что рисует `/app/account` персоналу клиники: второго
      // такого экрана не заводится (см. `accountSections.tsx`).
      const [profileContent, securityContent, billingContent] = await Promise.all([
        loadProfileContent(deps, workspace.session.user.userId, workspace, {
          // Владелец 15.09: у СОЛО удалить SMS fallback и «показывать мне врачебные экраны».
          hideSoloOnlyToggles: composition === 'solo',
          withLogout: false,
        }),
        loadSecurityContent(deps, workspace.session, workspace, false, false),
        canAccessBilling ? loadBillingContent(workspace, composition) : Promise.resolve(null),
      ]);
      content = (
        <>
          {profileContent}
          {securityContent}
          {billingContent}
          <LogoutSection />
        </>
      );
    } else if (tab === 'profile') {
      content = (
        <>
          {cabinetRecoveryNotice}
          {brandingState.brandingVisible ? (
            <OrgBrandingSection
              key={`profile:${brandingSectionKey}`}
              scope="profile"
              {...brandingSectionProps}
            />
          ) : null}
          {slugState ? (
            <ClinicSlugSection
              initialState={slugState}
              patientOrigin={PATIENT_DEFAULT_SURFACE.origin}
            />
          ) : null}
          {composition === 'solo' && workspace.specialistId !== null ? (
            <BookingSoloSpecialistsSection variant="solo-profile" />
          ) : null}
        </>
      );
    } else if (tab === 'public') {
      content = cardSettings ? (
        <ClinicPublicCardSection
          initialSettings={cardSettings}
          showSpecialistCardsInBooking={showSpecialistCardsInBooking}
          identity={cardIdentity}
          locations={bookingLinkOptions?.cardLocations ?? []}
          specialists={bookingLinkOptions?.cardSpecialists ?? []}
          services={bookingLinkOptions?.cardServices ?? []}
          patientOrigin={PATIENT_DEFAULT_SURFACE.origin}
        />
      ) : null;
    } else if (tab === 'branding') {
      content = (
        <>
          {brandingState.brandingVisible ? (
            <OrgBrandingSection
              key={`branding:${brandingSectionKey}`}
              scope="branding"
              {...brandingSectionProps}
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
          <ClinicDeliveryChannelsSection
            initial={clinicDelivery}
            platformAvailability={integrationAvailability}
            smtpEntitled={clinicSmtpEnabled}
          />
        </>
      );
    } else if (tab === 'booking') {
      content = (
        <>
          {slugState?.currentSlug && bookingLinkOptions ? (
            <ClinicBookingLinkSection
              bookingUrl={clinicBookingUrl(slugState.currentSlug)}
              branches={bookingLinkOptions.branches}
              specialists={bookingLinkOptions.specialists}
            />
          ) : null}
          {workspace.specialistId ? (
            <AppointmentReminderSettingsSection initialSettings={appointmentReminderSettings} />
          ) : null}
          {composition === 'solo' ? (
            <ManagementBookingSections
              // Одной простынёй: во вкладке настроек под-навигация была бы вкладками внутри
              // вкладок (владелец 15.09).
              flat
              basePath={routePaths.settings}
              notificationTemplatesVisible={notificationTemplatesVisibility.specialistNavigation}
              doctorStatisticsEnabled={doctorStatisticsVisibility.specialistNavigation}
              // Составы членств остаются у писателя «Расписания», единственный специалист правится
              // во вкладке «Профиль» — один писатель на одно место, без дублей.
              packagesVisible={false}
              specialistsVisible={false}
            />
          ) : null}
        </>
      );
    } else if (tab === 'payments') {
      content = paymentsVisibility.directUrl ? (
        <BookingPaymentsSection
          paymentEnabled={bookingPaymentEnabled}
          providersJson={bookingPaymentProviders}
          readOnly={!paymentsMutation.available}
        />
      ) : null;
    } else if (tab === 'workspace') {
      content = (
        <>
          <SettingsForm
            patientLabel={String(patientLabel)}
            appointmentLabel={String(appointmentLabel)}
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
          <DoctorPatientTermsProvider
            patientLabel={String(patientLabel)}
            supportGroupLabel={supportGroupLabel}
            appointmentLabel={String(appointmentLabel)}
          >
            <DoctorTodayPreferencesSection
              initialPreferences={todayPreferences}
              settingsEndpoint="/api/admin/settings"
            />
          </DoctorPatientTermsProvider>
          {/* «Установка приложения на устройство — это в настройках интерфейса» (владелец 15.09). */}
          <InstallSection />
        </>
      );
    } else if (tab === 'notifications') {
      content = await loadStaffNotificationsSection(deps, workspace.session, workspace);
    } else if (tab === 'integrations') {
      content = shouldShowGoogleCalendarSettings(
        isPlatformIntegrationAvailable(integrationAvailability, 'google_calendar'),
        externalCalendarEnabled,
      ) ? (
        <GoogleCalendarSection
          hasRefreshToken={clinicAdminValue('google_refresh_token').length > 0}
          googleCalendarId={clinicAdminValue('google_calendar_id')}
          googleCalendarEnabled={clinicGoogleEnabled}
          googleConnectedEmail={clinicAdminValue('google_connected_email')}
        />
      ) : null;
    }

    // Ни одна вкладка настроек не идёт в `full-height`. До 15.09 «Запись» была исключением, и это
    // читалось как чужая страница: экран прибит к высоте окна, сами настройки прокручиваются внутри
    // маленькой коробки, а блоки над ней («Ссылка на запись», «Напоминания») не уезжают никогда.
    // Владелец 15.09: «у тебя вкладка запись живет своей жизнью — одна колонка и не прокручивается».
    // Теперь страница прокручивается целиком, как на остальных восьми вкладках.
    return (
      <DoctorAppShell title={SETTINGS_PAGE_TITLE} user={workspace.session.user}>
        <DoctorPageHeader title={SETTINGS_PAGE_TITLE} />
        <SettingsTabsLayout activeTab={tab} visibleTabs={visibleTabs}>
          {content}
        </SettingsTabsLayout>
      </DoctorAppShell>
    );
  }

  if (tab === 'team') {
    if (composition !== 'clinic' || !teamEntitlement.ok)
      redirect(`${routePaths.settings}?tab=profile`);

    const deps = buildAppDeps();
    const [members, invites, seats, mutationAvailability, teamDoctorSettings] = await Promise.all([
      deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
      deps.organizationInvites.listPending(workspace.organizationId),
      deps.clinicSeats.getSeatStatus(workspace.organizationId, workspace.session.user.userId),
      getMechanicMutationAvailability({ organizationId: workspace.organizationId }, 'clinic_team'),
      deps.systemSettings.listSettingsByScope('doctor', {
        organizationId: workspace.organizationId,
      }),
    ]);
    /**
     * «Требовать второй фактор у персонала» переехало сюда из общей свалки настроек: это правило
     * ПРО ПЕРСОНАЛ, и живёт оно там, где персонал заводят. У соло его больше нет вовсе — владелец
     * 15.09: «сразу говорю… „требовать второй фактор у персонала“ — удалить вообще у СОЛО»;
     * персонала у одного человека не бывает.
     */
    const staffSecondFactorRequired = valueOf(
      teamDoctorSettings.find((setting) => setting.key === 'doctor_staff_second_factor_required')
        ?.valueJson,
      false,
    );
    return (
      <DoctorAppShell title={SETTINGS_PAGE_TITLE} user={workspace.session.user}>
        <DoctorPageHeader title={SETTINGS_PAGE_TITLE} />
        <SettingsTabsLayout activeTab="team" visibleTabs={visibleTabs}>
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
          {workspace.membershipRole === 'owner' ? (
            <ClinicStaffSecuritySection initialRequired={Boolean(staffSecondFactorRequired)} />
          ) : null}
        </SettingsTabsLayout>
      </DoctorAppShell>
    );
  }
}
