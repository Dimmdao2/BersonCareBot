/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const {
  redirectMock,
  requireOrganizationWorkspaceContextMock,
  requireEntitlementForActionMock,
  listSettingsByScopeMock,
  getDoctorAccountTimezoneMock,
  settingsHubTabsMock,
  appointmentReminderMock,
  teamSectionMock,
  listOrganizationMembersMock,
  listPendingInvitesMock,
  getSeatStatusMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  requireOrganizationWorkspaceContextMock: vi.fn(),
  requireEntitlementForActionMock: vi.fn(),
  listSettingsByScopeMock: vi.fn(),
  getDoctorAccountTimezoneMock: vi.fn(),
  settingsHubTabsMock: vi.fn((props: { tabs: Array<{ id: string }> }) => {
    void props;
    return <nav data-testid="settings-tabs" />;
  }),
  appointmentReminderMock: vi.fn(() => <section data-testid="appointment-reminders" />),
  teamSectionMock: vi.fn(() => <section data-testid="team-section" />),
  listOrganizationMembersMock: vi.fn(),
  listPendingInvitesMock: vi.fn(),
  getSeatStatusMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app-layer/guards/requireRole", () => ({ requireOrganizationWorkspaceContext: requireOrganizationWorkspaceContextMock }));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({ requireEntitlementForAction: requireEntitlementForActionMock }));
vi.mock("@/app-layer/doctor/accountTimezone", () => ({ getDoctorAccountTimezone: getDoctorAccountTimezoneMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { listSettingsByScope: listSettingsByScopeMock },
    userProjection: { getProfileEmailFields: vi.fn().mockResolvedValue({ email: null, emailVerifiedAt: null }) },
    webPushSubscriptions: { hasAnyForUserId: vi.fn().mockResolvedValue(false) },
    channelPreferencesPort: { getPreferences: vi.fn().mockResolvedValue([]) },
    topicChannelPrefs: { listByUserId: vi.fn().mockResolvedValue([]) },
    organizationMembership: { listOrganizationMembers: listOrganizationMembersMock },
    organizationInvites: { listPending: listPendingInvitesMock },
    clinicSeats: { getSeatStatus: getSeatStatusMock },
  }),
}));
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({ DoctorAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({ DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/shared/ui/doctor/pwa/StaffPwaInstallSection", () => ({ StaffPwaInstallSection: () => <div /> }));
vi.mock("./DoctorAccountEmailSection", () => ({ DoctorAccountEmailSection: () => <div /> }));
vi.mock("./SettingsForm", () => ({ SettingsForm: () => <div /> }));
vi.mock("./DoctorNotificationChannelsSection", () => ({ DoctorNotificationChannelsSection: () => <div /> }));
vi.mock("./DoctorTimezoneSection", () => ({ DoctorTimezoneSection: () => <div /> }));
vi.mock("./AppointmentReminderSettingsSection", () => ({ AppointmentReminderSettingsSection: appointmentReminderMock }));
vi.mock("./TeamSection", () => ({ TeamSection: teamSectionMock }));
vi.mock("./SettingsHubTabs", () => ({ SettingsHubTabs: settingsHubTabsMock }));

import SettingsPage from "./page";

const ownerWorkspace = {
  organizationId: "org-1",
  membershipId: "membership-1",
  membershipRole: "owner" as const,
  specialistId: "specialist-1",
  canManageOrganization: true,
  canManageAllSpecialists: true,
  session: { user: { userId: "owner-1", role: "doctor" as const, bindings: {} }, adminMode: false },
};

describe("settings hub role and direct-tab guards", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    settingsHubTabsMock.mockClear();
    appointmentReminderMock.mockClear();
    teamSectionMock.mockClear();
    listSettingsByScopeMock.mockResolvedValue([
      { key: "doctor_appointment_reminder_enabled", valueJson: { value: true } },
      { key: "doctor_appointment_reminder_offsets_minutes", valueJson: { value: [1440, 120] } },
    ]);
    getDoctorAccountTimezoneMock.mockResolvedValue(null);
    requireOrganizationWorkspaceContextMock.mockResolvedValue(ownerWorkspace);
    // Default: clinic_team disabled, matching an org without the entitlement.
    requireEntitlementForActionMock.mockResolvedValue({ ok: false, mechanic: "clinic_team" });
    listOrganizationMembersMock.mockResolvedValue([]);
    listPendingInvitesMock.mockResolvedValue([]);
    getSeatStatusMock.mockResolvedValue({ limit: 0, used: 0, available: 0 });
  });

  it("renders the retained appointment-reminder contract exactly once in the organization tab", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "organization" }) }));
    expect(screen.getByTestId("appointment-reminders")).toBeInTheDocument();
    expect(appointmentReminderMock).toHaveBeenCalledTimes(1);
    expect(appointmentReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEnabled: true,
        initialOffsetsMinutes: [1440, 120],
        settingsEndpoint: "/api/admin/settings",
      }),
      undefined,
    );
  });

  it("shows billing only to the owner and permits its direct tab", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) }));
    expect(screen.getByText("Коммерческие настройки станут доступны после подключения тарифа.")).toBeInTheDocument();
    const tabs = settingsHubTabsMock.mock.calls[0]?.[0].tabs as Array<{ id: string }>;
    expect(tabs.map((tab) => tab.id)).toEqual(["specialist", "organization", "billing", "install"]);
    expect(tabs.map((tab) => tab.id)).not.toContain("team");
  });

  it("fails closed for the Team direct tab while clinic_team is disabled", async () => {
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "team" }) })).rejects.toThrow(
      "redirect:/app/settings",
    );
    expect(requireEntitlementForActionMock).toHaveBeenCalledWith({ organizationId: ownerWorkspace.organizationId }, "clinic_team");
    expect(teamSectionMock).not.toHaveBeenCalled();
  });

  it("shows the Team tab and renders it once clinic_team is enabled for the organization owner", async () => {
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    listOrganizationMembersMock.mockResolvedValue([
      { id: "m1", displayName: "Owner", role: "owner", status: "active", specialistId: "s1" },
    ]);
    listPendingInvitesMock.mockResolvedValue([
      { id: "i1", invitedEmail: "new@example.com", invitedRole: "doctor", expiresAt: "2026-08-01T00:00:00.000Z" },
    ]);
    getSeatStatusMock.mockResolvedValue({ limit: 3, used: 1, available: 2 });

    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "team" }) }));

    expect(screen.getByTestId("team-section")).toBeInTheDocument();
    const tabs = settingsHubTabsMock.mock.calls[0]?.[0].tabs as Array<{ id: string }>;
    expect(tabs.map((tab) => tab.id)).toEqual(["specialist", "organization", "team", "billing", "install"]);
    expect(teamSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [{ id: "m1", displayName: "Owner", role: "owner", status: "active", seatConsuming: true }],
        invites: [{ id: "i1", invitedEmail: "new@example.com", invitedRole: "doctor", expiresAt: "2026-08-01T00:00:00.000Z" }],
        seats: { limit: 3, used: 1, available: 2 },
      }),
      undefined,
    );
  });

  it("does not show the Team tab to an ordinary specialist even when clinic_team is enabled", async () => {
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    requireOrganizationWorkspaceContextMock.mockResolvedValue({
      ...ownerWorkspace,
      membershipRole: "doctor",
      canManageOrganization: false,
      canManageAllSpecialists: false,
      session: { user: { userId: "doctor-1", role: "doctor", bindings: {} }, adminMode: false },
    });

    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "team" }) })).rejects.toThrow(
      "redirect:/app/settings",
    );
  });

  it("redirects an ordinary specialist away from organization and billing direct tabs", async () => {
    requireOrganizationWorkspaceContextMock.mockResolvedValue({
      ...ownerWorkspace,
      membershipRole: "doctor",
      canManageOrganization: false,
      canManageAllSpecialists: false,
      session: { user: { userId: "doctor-1", role: "doctor", bindings: {} }, adminMode: false },
    });
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "organization" }) })).rejects.toThrow("redirect:/app/settings");
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) })).rejects.toThrow("redirect:/app/settings");
  });
});
