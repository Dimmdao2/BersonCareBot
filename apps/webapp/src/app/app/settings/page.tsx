import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForReadAction } from "@/app-layer/guards/requireEntitlement";
import { requireOrganizationWorkspaceContext } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { isSeatConsumingMember } from "@/modules/clinic-seats/service";
import { entitlementsFromSnapshot } from "@/modules/org-entitlements/service";
import { MECHANIC_REGISTRY, MECHANICS } from "@/modules/org-entitlements/types";
import { orgBrandLogoUrl, type OrgBrandingManagementContext } from "@/modules/org-branding/service";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";
import { AppointmentReminderSettingsSection } from "./AppointmentReminderSettingsSection";
import { BillingSection, type BillingMechanicRow } from "./BillingSection";
import { describeCommercialAccessState } from "./billingCommercialState";
import { DoctorTodayPreferencesSection } from "./DoctorTodayPreferencesSection";
import { ClinicSlugSection } from "./ClinicSlugSection";
import { OrgBrandingSection } from "./OrgBrandingSection";
import { SettingsForm } from "./SettingsForm";
import { SettingsTabsNav } from "./SettingsTabsNav";
import type { SettingsTabId } from "./settingsTabs";
import { TeamSection } from "./TeamSection";
import { parseDoctorTodayPreferences } from "@/modules/system-settings/doctorTodayPreferences";
import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";

type LegacySettingsTab = "specialist" | "organization" | "team" | "billing" | "install";

function valueOf<T>(valueJson: unknown, fallback: T): T {
  return valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)
    ? (valueJson as Record<string, unknown>).value as T
    : fallback;
}

function parseTab(raw: string | string[] | undefined): LegacySettingsTab | null {
  const value = typeof raw === "string" ? raw : raw?.[0];
  if (value === undefined) return null;
  return value === "organization" || value === "team" || value === "billing" || value === "install"
    ? value
    : "specialist";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[]; adminTab?: string | string[]; probe?: string | string[] }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const legacyAdminTab = typeof sp.adminTab === "string" ? sp.adminTab : sp.adminTab?.[0];
  if (legacyAdminTab && ADMIN_TAB_REDIRECTS[legacyAdminTab]) {
    const target = ADMIN_TAB_REDIRECTS[legacyAdminTab];
    const probe = parseHealthArchiveProbeParam(sp.probe);
    redirect(probe ? `${target}?probe=${encodeURIComponent(probe)}` : target);
  }

  const tab = parseTab(sp.tab);
  if (tab === "specialist") redirect(routePaths.account);
  if (tab === "install") redirect(`${routePaths.account}?tab=install`);

  const workspace = await requireOrganizationWorkspaceContext();
  const isGlobalAdmin = workspace.session.user.role === "admin" && workspace.session.adminMode === true;
  const canManageOrganization = workspace.canManageOrganization || isGlobalAdmin;
  if (!canManageOrganization) redirect(routePaths.account);

  // Resolved once up front (not just inside the "team"/"billing" branches) so every rendered tab
  // can show the same nav with only the sections this viewer may actually open — Defect #1
  // 2026-07-25: the page had no nav at all, so `?tab=team`/`?tab=billing` were reachable only by
  // typing the URL.
  const teamEntitlement = await requireEntitlementForReadAction(
    { organizationId: workspace.organizationId },
    "clinic_team",
  );
  const canAccessBilling = workspace.membershipRole === "owner" || isGlobalAdmin;
  const visibleTabs: SettingsTabId[] = [
    "organization",
    ...(teamEntitlement.ok ? (["team"] as const) : []),
    ...(canAccessBilling ? (["billing"] as const) : []),
  ];

  if (tab === null || tab === "organization") {
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
    const [doctorSettings, brandingState, slugState, appBaseUrl] = await Promise.all([
      deps.systemSettings.listSettingsByScope("doctor", { organizationId: workspace.organizationId }),
      deps.orgBranding.getManagementState(brandingCtx),
      workspace.canManageOrganization && deps.clinicDirectory
        ? deps.clinicDirectory.getSlugManagementState(workspace.organizationId)
        : Promise.resolve(null),
      getAppBaseUrl(),
    ]);
    const publishedBrand = brandingState.published;
    const publishedLogoUrl =
      publishedBrand?.logoMediaReady && publishedBrand.logoMediaId
        ? orgBrandLogoUrl(publishedBrand.logoMediaId)
        : null;
    const patientLabel = valueOf(
      doctorSettings.find((setting) => setting.key === "patient_label")?.valueJson,
      "пациент",
    );
    const appointmentReminderEnabled = valueOf(
      doctorSettings.find((setting) => setting.key === "doctor_appointment_reminder_enabled")?.valueJson,
      false,
    );
    const appointmentReminderOffsets = valueOf<unknown>(
      doctorSettings.find((setting) => setting.key === "doctor_appointment_reminder_offsets_minutes")?.valueJson,
      [],
    );
    const todayPreferences = parseDoctorTodayPreferences(
      doctorSettings.find((setting) => setting.key === "doctor_today_preferences")?.valueJson,
    );
    return (
      <DoctorAppShell title="Настройки" user={workspace.session.user}>
        <DoctorPageHeader title="Настройки" />
        <SettingsTabsNav activeTab="organization" visibleTabs={visibleTabs} />
        {workspace.membershipRole === "owner" && workspace.specialistId === null ? (
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
        <OrgBrandingSection
          key={`${brandingState.brandingMechanicEnabled}:${publishedBrand?.displayName ?? ""}:${publishedBrand?.logoMediaId ?? ""}`}
          brandingMechanicEnabled={brandingState.brandingMechanicEnabled}
          coreDisplayName={brandingState.effective.core.displayName}
          publishedDisplayName={publishedBrand?.displayName ?? null}
          publishedLogoMediaId={publishedBrand?.logoMediaId ?? null}
          publishedLogoUrl={publishedLogoUrl}
        />
        {slugState ? (
          <ClinicSlugSection
            initialState={slugState}
            appBaseUrl={appBaseUrl}
          />
        ) : null}
        <SettingsForm
          patientLabel={String(patientLabel)}
          smsFallbackEnabled={false}
          supportCommentsWithoutSupportDefault={false}
          supportMediaWithoutSupportDefault={false}
          settingsEndpoint="/api/admin/settings"
          showSmsFallback={false}
          showSupportDefaults={false}
        />
        <DoctorTodayPreferencesSection
          initialPreferences={todayPreferences}
          settingsEndpoint="/api/admin/settings"
        />
        <AppointmentReminderSettingsSection
          initialEnabled={Boolean(appointmentReminderEnabled)}
          initialOffsetsMinutes={
            Array.isArray(appointmentReminderOffsets)
              ? appointmentReminderOffsets.filter(
                  (value): value is number => Number.isSafeInteger(value) && value > 0,
                )
              : []
          }
          settingsEndpoint="/api/admin/settings"
        />
      </DoctorAppShell>
    );
  }

  if (tab === "team") {
    if (!teamEntitlement.ok) redirect(`${routePaths.settings}?tab=organization`);

    const deps = buildAppDeps();
    const [members, invites, seats] = await Promise.all([
      deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
      deps.organizationInvites.listPending(workspace.organizationId),
      deps.clinicSeats.getSeatStatus(workspace.organizationId),
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
        />
      </DoctorAppShell>
    );
  }

  if (!canAccessBilling) redirect(routePaths.account);

  const deps = buildAppDeps();
  const [snapshot, billing] = await Promise.all([
    deps.orgEntitlements.getSnapshot(workspace.organizationId),
    deps.saasBilling.getOrganizationBillingOverview(workspace.organizationId),
  ]);
  const entitlements = entitlementsFromSnapshot(snapshot);
  const mechanicRows: BillingMechanicRow[] = MECHANICS.map((mechanic) => ({
    mechanic,
    label: MECHANIC_REGISTRY[mechanic].label,
    enabled: entitlements[mechanic],
  }));

  return (
    <DoctorAppShell title="Тариф и биллинг" user={workspace.session.user}>
      <DoctorPageHeader title="Тариф и биллинг" />
      <SettingsTabsNav activeTab="billing" visibleTabs={visibleTabs} />
      <BillingSection
        tariffName={snapshot.tariff?.name ?? null}
        commercialStateLabel={describeCommercialAccessState(snapshot.access)}
        mechanics={mechanicRows}
        billing={billing}
      />
    </DoctorAppShell>
  );
}
