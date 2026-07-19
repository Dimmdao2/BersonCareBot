/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  loadContextMock,
  listSettingsByScopeMock,
  getProfileEmailFieldsMock,
  hasAnyForUserIdMock,
  getPreferencesMock,
  listTopicPrefsMock,
  getTimezoneMock,
  accountEmailMock,
  timezoneMock,
  notificationsMock,
  settingsFormMock,
  installMock,
} = vi.hoisted(() => ({
  loadContextMock: vi.fn(),
  listSettingsByScopeMock: vi.fn(),
  getProfileEmailFieldsMock: vi.fn(),
  hasAnyForUserIdMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  listTopicPrefsMock: vi.fn(),
  getTimezoneMock: vi.fn(),
  accountEmailMock: vi.fn(() => <section data-testid="account-email" />),
  timezoneMock: vi.fn(() => <section data-testid="timezone" />),
  notificationsMock: vi.fn(() => <section data-testid="notifications" />),
  settingsFormMock: vi.fn(() => <section data-testid="specialist-defaults" />),
  installMock: vi.fn(() => <section data-testid="install" />),
}));

vi.mock("./accountContext", () => ({ loadStaffAccountPageContext: loadContextMock }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { listSettingsByScope: listSettingsByScopeMock },
    userProjection: { getProfileEmailFields: getProfileEmailFieldsMock },
    webPushSubscriptions: { hasAnyForUserId: hasAnyForUserIdMock },
    channelPreferencesPort: { getPreferences: getPreferencesMock },
    topicChannelPrefs: { listByUserId: listTopicPrefsMock },
  }),
}));
vi.mock("@/app-layer/doctor/accountTimezone", () => ({ getDoctorAccountTimezone: getTimezoneMock }));
vi.mock("@/modules/doctor-notifications/doctorProfileTopicChannelsModel", () => ({
  buildDoctorNotificationTopicModels: vi.fn(() => [{ topicCode: "task_due" }]),
}));
vi.mock("@/app/app/settings/DoctorAccountEmailSection", () => ({ DoctorAccountEmailSection: accountEmailMock }));
vi.mock("@/app/app/settings/DoctorTimezoneSection", () => ({ DoctorTimezoneSection: timezoneMock }));
vi.mock("@/app/app/settings/DoctorNotificationChannelsSection", () => ({
  DoctorNotificationChannelsSection: notificationsMock,
}));
vi.mock("@/app/app/settings/SettingsForm", () => ({ SettingsForm: settingsFormMock }));
vi.mock("@/shared/ui/doctor/pwa/StaffPwaInstallSection", () => ({ StaffPwaInstallSection: installMock }));
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import AccountPage from "./page";

const clinicalContext = {
  session: {
    user: {
      userId: "user-1",
      role: "doctor" as const,
      displayName: "Doctor",
      bindings: { telegramId: "tg-1", maxId: null },
    },
    adminMode: false,
  },
  workspaceContext: {
    organizationId: "org-1",
    membershipId: "membership-1",
    membershipRole: "doctor" as const,
    specialistId: "specialist-1",
    canManageOrganization: false,
    canManageAllSpecialists: false,
    canAccessClinicalWorkspace: true,
    selectedSpecialistId: "specialist-1",
    organizationName: null,
  },
};

describe("shared staff account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadContextMock.mockResolvedValue(clinicalContext);
    listSettingsByScopeMock.mockResolvedValue([]);
    getProfileEmailFieldsMock.mockResolvedValue({ email: "doctor@example.test", emailVerifiedAt: new Date() });
    hasAnyForUserIdMock.mockResolvedValue(true);
    getPreferencesMock.mockResolvedValue([{ channelCode: "web_push", isEnabledForNotifications: true }]);
    listTopicPrefsMock.mockResolvedValue([]);
    getTimezoneMock.mockResolvedValue("Europe/Moscow");
  });

  it("reuses the personal email, timezone and retained specialist defaults on the profile tab", async () => {
    render(await AccountPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Аккаунт" })).toBeInTheDocument();
    expect(screen.getByTestId("account-email")).toBeInTheDocument();
    expect(screen.getByTestId("timezone")).toBeInTheDocument();
    expect(screen.getByTestId("specialist-defaults")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Уведомления" })).toHaveAttribute(
      "href",
      "/app/account?tab=notifications",
    );
    expect(accountEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialEmail: "doctor@example.test", emailVerified: true }),
      undefined,
    );
    expect(timezoneMock).toHaveBeenCalledWith({ initialTimezone: "Europe/Moscow" }, undefined);
  });

  it("keeps personal profile available without exposing clinical defaults to a management-only account", async () => {
    loadContextMock.mockResolvedValue({
      ...clinicalContext,
      workspaceContext: { ...clinicalContext.workspaceContext, specialistId: null, canAccessClinicalWorkspace: false },
    });

    render(await AccountPage({ searchParams: Promise.resolve({ tab: "profile" }) }));

    expect(screen.getByTestId("account-email")).toBeInTheDocument();
    expect(screen.getByTestId("timezone")).toBeInTheDocument();
    expect(screen.queryByTestId("specialist-defaults")).not.toBeInTheDocument();
    expect(listSettingsByScopeMock).not.toHaveBeenCalled();
  });

  it("reuses the personal notification surface and the current organization preference projection", async () => {
    listSettingsByScopeMock.mockResolvedValue([
      { key: "doctor_specialist_task_reminder_channels", valueJson: { value: ["web_push"] } },
    ]);

    render(await AccountPage({ searchParams: Promise.resolve({ tab: "notifications" }) }));

    expect(screen.getByTestId("notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("account-email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Уведомления" })).toHaveAttribute("aria-current", "page");
    expect(listSettingsByScopeMock).toHaveBeenCalledWith("doctor", { organizationId: "org-1" });
    expect(notificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hasWebPushSubscription: true,
        globalWebPushEnabled: true,
        hasTelegram: true,
        hasMax: false,
        emailVerified: true,
      }),
      undefined,
    );
  });

  it("reuses the staff PWA installer on the install tab", async () => {
    render(await AccountPage({ searchParams: Promise.resolve({ tab: "install" }) }));

    expect(screen.getByTestId("install")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Установить приложение" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("notifications")).not.toBeInTheDocument();
  });

  it("falls back to profile for an unknown tab instead of creating a second destination", async () => {
    render(await AccountPage({ searchParams: Promise.resolve({ tab: "unknown" }) }));
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("aria-current", "page");
  });
});
