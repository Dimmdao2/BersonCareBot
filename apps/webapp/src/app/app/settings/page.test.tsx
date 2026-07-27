/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  redirectMock,
  requireWorkspaceMock,
  requireStaffPersonalInstallPageMock,
  entitlementMock,
  listMembersMock,
  listInvitesMock,
  seatStatusMock,
  listSettingsMock,
  getOrgEntitlementsSnapshotMock,
  getOrgBrandingManagementStateMock,
  getSlugManagementStateMock,
  getAppBaseUrlMock,
  getSupportContactUrlMock,
  settingsFormMock,
  appointmentReminderMock,
  teamSectionMock,
  billingSectionMock,
  settingsTabsNavMock,
  orgBrandingSectionMock,
  clinicSlugSectionMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  requireWorkspaceMock: vi.fn(),
  requireStaffPersonalInstallPageMock: vi.fn(),
  entitlementMock: vi.fn(),
  listMembersMock: vi.fn(),
  listInvitesMock: vi.fn(),
  seatStatusMock: vi.fn(),
  listSettingsMock: vi.fn(),
  getOrgEntitlementsSnapshotMock: vi.fn(),
  getOrgBrandingManagementStateMock: vi.fn(),
  getSlugManagementStateMock: vi.fn(),
  getAppBaseUrlMock: vi.fn(),
  getSupportContactUrlMock: vi.fn(),
  settingsFormMock: vi.fn(() => <section data-testid="organization-settings" />),
  appointmentReminderMock: vi.fn(() => <section data-testid="appointment-reminders" />),
  teamSectionMock: vi.fn(() => <section data-testid="team" />),
  billingSectionMock: vi.fn(() => <section data-testid="billing" />),
  settingsTabsNavMock: vi.fn(
    ({ activeTab, visibleTabs }: { activeTab: string; visibleTabs: string[] }) => (
      <nav data-testid="settings-tabs-nav" data-active={activeTab} data-visible={visibleTabs.join(",")} />
    ),
  ),
  orgBrandingSectionMock: vi.fn(() => <section data-testid="org-branding" />),
  clinicSlugSectionMock: vi.fn(() => <section data-testid="clinic-slug" />),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app-layer/routes/paths", () => ({
  routePaths: { account: "/app/account", settings: "/app/settings" },
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireOrganizationWorkspaceContext: requireWorkspaceMock,
  requireStaffPersonalInstallPage: requireStaffPersonalInstallPageMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForReadAction: entitlementMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    organizationMembership: { listOrganizationMembers: listMembersMock },
    organizationInvites: { listPending: listInvitesMock },
    clinicSeats: { getSeatStatus: seatStatusMock },
    systemSettings: { listSettingsByScope: listSettingsMock },
    orgEntitlements: { getSnapshot: getOrgEntitlementsSnapshotMock },
    orgBranding: { getManagementState: getOrgBrandingManagementStateMock },
    clinicDirectory: { getSlugManagementState: getSlugManagementStateMock },
  }),
}));
vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrl: getAppBaseUrlMock,
}));
vi.mock("@/modules/system-settings/supportContactUrl", () => ({
  getSupportContactUrl: getSupportContactUrlMock,
}));
vi.mock("@/modules/org-branding/service", () => ({
  orgBrandLogoUrl: (mediaId: string) => `/api/media/${mediaId}`,
}));
vi.mock("./TeamSection", () => ({ TeamSection: teamSectionMock }));
vi.mock("./SettingsForm", () => ({ SettingsForm: settingsFormMock }));
vi.mock("./AppointmentReminderSettingsSection", () => ({
  AppointmentReminderSettingsSection: appointmentReminderMock,
}));
vi.mock("./BillingSection", () => ({ BillingSection: billingSectionMock }));
vi.mock("./SettingsTabsNav", () => ({ SettingsTabsNav: settingsTabsNavMock }));
vi.mock("./OrgBrandingSection", () => ({ OrgBrandingSection: orgBrandingSectionMock }));
vi.mock("./ClinicSlugSection", () => ({ ClinicSlugSection: clinicSlugSectionMock }));
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import SettingsPage from "./page";
import DoctorInstallPage from "../(staff-personal)/doctor/install/page";
import DoctorClinicSettingsPage from "../doctor/clinic/settings/page";
import DoctorClinicMembersPage from "../doctor/clinic/members/page";

const ownerWorkspace = {
  organizationId: "org-1",
  membershipId: "membership-1",
  membershipRole: "owner" as const,
  specialistId: "specialist-1",
  canManageOrganization: true,
  canManageAllSpecialists: true,
  canAccessClinicalWorkspace: true,
  session: { user: { userId: "owner-1", role: "doctor" as const, bindings: {} }, adminMode: false },
};

describe("legacy settings compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireWorkspaceMock.mockResolvedValue(ownerWorkspace);
    requireStaffPersonalInstallPageMock.mockResolvedValue(ownerWorkspace.session);
    entitlementMock.mockResolvedValue({ ok: false, mechanic: "clinic_team" });
    listMembersMock.mockResolvedValue([]);
    listInvitesMock.mockResolvedValue([]);
    seatStatusMock.mockResolvedValue({ limit: 0, used: 0, available: 0 });
    listSettingsMock.mockResolvedValue([
      { key: "patient_label", valueJson: { value: "клиент" } },
      { key: "doctor_appointment_reminder_enabled", valueJson: { value: true } },
      { key: "doctor_appointment_reminder_offsets_minutes", valueJson: { value: [1440, 120] } },
    ]);
    getOrgEntitlementsSnapshotMock.mockResolvedValue({
      tariff: null,
      overrides: [],
      access: { lifecycle: "active", tariffId: null, source: "compatibility" },
    });
    getOrgBrandingManagementStateMock.mockResolvedValue({
      effective: {
        organizationId: "org-1",
        core: { displayName: "Клиника", isActive: true },
        paid: { displayName: null, logoUrl: null },
        effectiveDisplayName: "Клиника",
        resolution: "no_published_revision",
      },
      brandingMechanicEnabled: true,
      draft: null,
      published: null,
    });
    getSlugManagementStateMock.mockResolvedValue({
      currentSlug: "tochka-zdorovya",
      selfServiceRenameAvailable: true,
    });
    getAppBaseUrlMock.mockResolvedValue("https://app.example");
    getSupportContactUrlMock.mockResolvedValue("https://support.example");
  });

  it("routes the explicit old personal and install entries to the one account area", async () => {
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "specialist" }) })).rejects.toThrow(
      "redirect:/app/account",
    );
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "install" }) })).rejects.toThrow(
      "redirect:/app/account?tab=install",
    );
    expect(requireWorkspaceMock).not.toHaveBeenCalled();
  });

  it("opens organization settings at the canonical root for a management-capable owner without a binding", async () => {
    requireWorkspaceMock.mockResolvedValue({
      ...ownerWorkspace,
      specialistId: null,
      canAccessClinicalWorkspace: false,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByTestId("organization-settings")).toBeInTheDocument();
    expect(screen.getByTestId("clinic-slug")).toBeInTheDocument();
    expect(clinicSlugSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: {
          currentSlug: "tochka-zdorovya",
          selfServiceRenameAvailable: true,
        },
        appBaseUrl: "https://app.example",
        supportContactUrl: "https://support.example",
      }),
      undefined,
    );
  });

  it("keeps the canonical Settings root out of a plain specialist account", async () => {
    requireWorkspaceMock.mockResolvedValue({
      ...ownerWorkspace,
      membershipRole: "doctor",
      canManageOrganization: false,
      canManageAllSpecialists: false,
    });

    await expect(SettingsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/app/account");
  });

  it("preserves the one guarded organization writer without restoring a second settings tab tree", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "organization" }) }));

    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByTestId("organization-settings")).toBeInTheDocument();
    expect(screen.getByTestId("appointment-reminders")).toBeInTheDocument();
    expect(settingsFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientLabel: "клиент",
        settingsEndpoint: "/api/admin/settings",
        showSmsFallback: false,
        showSupportDefaults: false,
      }),
      undefined,
    );
    expect(appointmentReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEnabled: true,
        initialOffsetsMinutes: [1440, 120],
        settingsEndpoint: "/api/admin/settings",
      }),
      undefined,
    );
  });

  it("builds the section nav from only the sections this viewer may reach (Defect #1)", async () => {
    // Baseline: clinic_team off (default mock), owner → billing visible, team hidden.
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(settingsTabsNavMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: "organization", visibleTabs: ["organization", "billing"] }),
      undefined,
    );

    settingsTabsNavMock.mockClear();
    entitlementMock.mockResolvedValue({ ok: true });
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(settingsTabsNavMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: "organization", visibleTabs: ["organization", "team", "billing"] }),
      undefined,
    );

    settingsTabsNavMock.mockClear();
    entitlementMock.mockResolvedValue({ ok: false, mechanic: "clinic_team" });
    requireWorkspaceMock.mockResolvedValue({ ...ownerWorkspace, membershipRole: "doctor" });
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(settingsTabsNavMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: "organization", visibleTabs: ["organization"] }),
      undefined,
    );
  });

  it("keeps Team fail-closed when clinic_team is unavailable without redirecting to itself", async () => {
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "team" }) })).rejects.toThrow(
      "redirect:/app/settings?tab=organization",
    );
    expect(entitlementMock).toHaveBeenCalledWith({ organizationId: "org-1" }, "clinic_team");
    expect(teamSectionMock).not.toHaveBeenCalled();
  });

  it("preserves the existing Team body for an entitled organization manager", async () => {
    entitlementMock.mockResolvedValue({ ok: true });
    listMembersMock.mockResolvedValue([
      { id: "m1", displayName: "Owner", role: "owner", status: "active", specialistId: "s1" },
    ]);
    listInvitesMock.mockResolvedValue([
      { id: "i1", invitedEmail: "new@example.test", invitedRole: "doctor", expiresAt: "2026-08-01" },
    ]);
    seatStatusMock.mockResolvedValue({ limit: 3, used: 1, available: 2 });

    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "team" }) }));

    expect(screen.getByTestId("team")).toBeInTheDocument();
    expect(settingsTabsNavMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: "team", visibleTabs: ["organization", "team", "billing"] }),
      undefined,
    );
    expect(teamSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [expect.objectContaining({ id: "m1", seatConsuming: true })],
        invites: [expect.objectContaining({ id: "i1" })],
        seats: { limit: 3, used: 1, available: 2 },
      }),
      undefined,
    );
  });

  it("resolves the real tariff/entitlement snapshot for the owner-only billing tab and denies it to a specialist", async () => {
    getOrgEntitlementsSnapshotMock.mockResolvedValue({
      tariff: { id: "tariff-1", name: "ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК", mechanics: { payments: true, courses: false }, quotas: {}, includedSeats: null },
      overrides: [],
      access: { lifecycle: "active", tariffId: "tariff-1", source: "assignment" },
    });

    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) }));

    expect(screen.getByTestId("billing")).toBeInTheDocument();
    expect(getOrgEntitlementsSnapshotMock).toHaveBeenCalledWith("org-1");
    expect(billingSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tariffName: "ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК",
        commercialStateLabel: "Тариф активен.",
        mechanics: expect.arrayContaining([
          expect.objectContaining({ mechanic: "payments", label: "Оплата записи", enabled: true }),
          expect.objectContaining({ mechanic: "courses", label: "Курсы", enabled: false }),
        ]),
      }),
      undefined,
    );

    requireWorkspaceMock.mockResolvedValue({
      ...ownerWorkspace,
      membershipRole: "doctor",
      canManageOrganization: false,
    });
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) })).rejects.toThrow(
      "redirect:/app/account",
    );
  });

  it("shows the honest empty state (no tariff) instead of a lie", async () => {
    getOrgEntitlementsSnapshotMock.mockResolvedValue({
      tariff: null,
      overrides: [],
      access: { lifecycle: "active", tariffId: null, source: "no_trial" },
    });

    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) }));

    expect(billingSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tariffName: null,
        commercialStateLabel:
          "Пробный период не активирован и тариф не назначен — доступ к платным механикам ограничен.",
      }),
      undefined,
    );
  });

  it("keeps historical platform admin-tab redirects", async () => {
    // system-health, health-archive and audit-log moved out of the doctor URL space in PLAT-01…09
    // slices 1-2 (2026-07-26); app-params/auth/integrations/catalog/diagnostics moved the same way
    // in slice 4. All of it landed at /app/platform/* first, then the owner ruling the same day
    // renamed the whole tree to /app/admin/*. Only product-analytics/reminder-stats still target
    // /app/doctor/analytics (unmoved).
    await expect(SettingsPage({ searchParams: Promise.resolve({ adminTab: "system-health" }) })).rejects.toThrow(
      "redirect:/app/admin/system-health",
    );
    await expect(SettingsPage({ searchParams: Promise.resolve({ adminTab: "health-archive" }) })).rejects.toThrow(
      "redirect:/app/admin/health-archive",
    );
    await expect(SettingsPage({ searchParams: Promise.resolve({ adminTab: "audit-log" }) })).rejects.toThrow(
      "redirect:/app/admin/audit-log",
    );
    await expect(SettingsPage({ searchParams: Promise.resolve({ adminTab: "product-analytics" }) })).rejects.toThrow(
      /redirect:\/app\/doctor\//,
    );
    expect(requireWorkspaceMock).not.toHaveBeenCalled();
  });

  it("restores legacy deep links to distinct canonical or guarded compatibility destinations", async () => {
    await expect(DoctorInstallPage()).rejects.toThrow("redirect:/app/account?tab=install");
    expect(() => DoctorClinicSettingsPage()).toThrow("redirect:/app/settings?tab=organization");
    expect(() => DoctorClinicMembersPage()).toThrow("redirect:/app/settings?tab=team");
  });
});
