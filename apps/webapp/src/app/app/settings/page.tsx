import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForAction } from "@/app-layer/guards/requireEntitlement";
import { requireOrganizationWorkspaceContext } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { isSeatConsumingMember } from "@/modules/clinic-seats/service";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { ADMIN_TAB_REDIRECTS, parseHealthArchiveProbeParam } from "./adminSettingsData";
import { AppointmentReminderSettingsSection } from "./AppointmentReminderSettingsSection";
import { SettingsForm } from "./SettingsForm";
import { TeamSection } from "./TeamSection";

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

  if (tab === null || tab === "organization") {
    const doctorSettings = await buildAppDeps().systemSettings.listSettingsByScope("doctor", {
      organizationId: workspace.organizationId,
    });
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
    return (
      <DoctorAppShell title="Настройки" user={workspace.session.user}>
        <DoctorPageHeader title="Настройки" />
        <SettingsForm
          patientLabel={String(patientLabel)}
          smsFallbackEnabled={false}
          supportCommentsWithoutSupportDefault={false}
          supportMediaWithoutSupportDefault={false}
          settingsEndpoint="/api/admin/settings"
          showSmsFallback={false}
          showSupportDefaults={false}
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
    const entitlement = await requireEntitlementForAction(
      { organizationId: workspace.organizationId },
      "clinic_team",
    );
    if (!entitlement.ok) redirect(`${routePaths.settings}?tab=organization`);

    const deps = buildAppDeps();
    const [members, invites, seats] = await Promise.all([
      deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
      deps.organizationInvites.listPending(workspace.organizationId),
      deps.clinicSeats.getSeatStatus(workspace.organizationId),
    ]);
    return (
      <DoctorAppShell title="Команда" user={workspace.session.user}>
        <DoctorPageHeader title="Команда" />
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

  const canAccessBilling = workspace.membershipRole === "owner" || isGlobalAdmin;
  if (!canAccessBilling) redirect(routePaths.account);
  return (
    <DoctorAppShell title="Тариф и биллинг" user={workspace.session.user}>
      <DoctorPageHeader title="Тариф и биллинг" />
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Тариф и биллинг</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-sm text-muted-foreground">
          Коммерческие настройки станут доступны после подключения тарифа.
        </p>
      </DoctorSection>
    </DoctorAppShell>
  );
}
