/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  redirectMock,
  requireWorkspaceMock,
  entitlementMock,
  listMembersMock,
  listInvitesMock,
  seatStatusMock,
  listSettingsMock,
  settingsFormMock,
  appointmentReminderMock,
  teamSectionMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  requireWorkspaceMock: vi.fn(),
  entitlementMock: vi.fn(),
  listMembersMock: vi.fn(),
  listInvitesMock: vi.fn(),
  seatStatusMock: vi.fn(),
  listSettingsMock: vi.fn(),
  settingsFormMock: vi.fn(() => <section data-testid="organization-settings" />),
  appointmentReminderMock: vi.fn(() => <section data-testid="appointment-reminders" />),
  teamSectionMock: vi.fn(() => <section data-testid="team" />),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app-layer/routes/paths", () => ({
  routePaths: { account: "/app/account", settings: "/app/settings" },
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireOrganizationWorkspaceContext: requireWorkspaceMock,
}));
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: entitlementMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    organizationMembership: { listOrganizationMembers: listMembersMock },
    organizationInvites: { listPending: listInvitesMock },
    clinicSeats: { getSeatStatus: seatStatusMock },
    systemSettings: { listSettingsByScope: listSettingsMock },
  }),
}));
vi.mock("./TeamSection", () => ({ TeamSection: teamSectionMock }));
vi.mock("./SettingsForm", () => ({ SettingsForm: settingsFormMock }));
vi.mock("./AppointmentReminderSettingsSection", () => ({
  AppointmentReminderSettingsSection: appointmentReminderMock,
}));
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import SettingsPage from "./page";
import DoctorInstallPage from "../doctor/install/page";
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
    entitlementMock.mockResolvedValue({ ok: false, mechanic: "clinic_team" });
    listMembersMock.mockResolvedValue([]);
    listInvitesMock.mockResolvedValue([]);
    seatStatusMock.mockResolvedValue({ limit: 0, used: 0, available: 0 });
    listSettingsMock.mockResolvedValue([
      { key: "patient_label", valueJson: { value: "клиент" } },
      { key: "doctor_appointment_reminder_enabled", valueJson: { value: true } },
      { key: "doctor_appointment_reminder_offsets_minutes", valueJson: { value: [1440, 120] } },
    ]);
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
    expect(teamSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [expect.objectContaining({ id: "m1", seatConsuming: true })],
        invites: [expect.objectContaining({ id: "i1" })],
        seats: { limit: 3, used: 1, available: 2 },
      }),
      undefined,
    );
  });

  it("preserves the owner-only billing placeholder and denies it to a specialist", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) }));
    expect(screen.getByText("Коммерческие настройки станут доступны после подключения тарифа.")).toBeInTheDocument();

    requireWorkspaceMock.mockResolvedValue({
      ...ownerWorkspace,
      membershipRole: "doctor",
      canManageOrganization: false,
    });
    await expect(SettingsPage({ searchParams: Promise.resolve({ tab: "billing" }) })).rejects.toThrow(
      "redirect:/app/account",
    );
  });

  it("keeps historical platform admin-tab redirects", async () => {
    await expect(SettingsPage({ searchParams: Promise.resolve({ adminTab: "system-health" }) })).rejects.toThrow(
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
