/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const {
  requireClinicManagementDoctorPageMock,
  listSettingsByScopeMock,
  settingsFormMock,
  appointmentReminderMock,
} = vi.hoisted(() => ({
  requireClinicManagementDoctorPageMock: vi.fn(),
  listSettingsByScopeMock: vi.fn(),
  settingsFormMock: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="settings-form">{JSON.stringify(props)}</div>
  )),
  appointmentReminderMock: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="appointment-reminders">{JSON.stringify(props)}</div>
  )),
}));

vi.mock("@/app/app/settings/requireAdminDoctorPage", () => ({
  requireClinicManagementDoctorPage: requireClinicManagementDoctorPageMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: {
      listSettingsByScope: listSettingsByScopeMock,
    },
  }),
}));

vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main data-title={title}>{children}</main>
  ),
}));

vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/app/app/settings/SettingsForm", () => ({ SettingsForm: settingsFormMock }));
vi.mock("@/app/app/settings/AppointmentReminderSettingsSection", () => ({
  AppointmentReminderSettingsSection: appointmentReminderMock,
}));
vi.mock("@/app/app/settings/patient-home/PatientHomePracticeTargetPanel", () => ({
  PatientHomePracticeTargetPanel: () => <section>practice-target</section>,
}));
vi.mock("@/app/app/settings/patient-home/PatientHomeRepeatCooldownPanel", () => ({
  PatientHomeRepeatCooldownPanel: () => <section>repeat-cooldown</section>,
}));
vi.mock("@/app/app/settings/patient-home/PatientHomeDailyWarmupRotationPanel", () => ({
  PatientHomeDailyWarmupRotationPanel: () => <section>warmup-rotation</section>,
}));
vi.mock("@/app/app/settings/patient-home/PatientHomeMorningPingPanel", () => ({
  PatientHomeMorningPingPanel: () => <section>morning-ping</section>,
}));
vi.mock("@/app/app/settings/BookingEventNotificationsSection", () => ({
  BookingEventNotificationsSection: () => <section>booking-notifications</section>,
}));
vi.mock("@/app/app/settings/NotificationsTopicsSection", () => ({
  NotificationsTopicsSection: () => <section>notification-topics</section>,
}));

import DoctorClinicSettingsPage from "./page";

describe("DoctorClinicSettingsPage", () => {
  beforeEach(() => {
    requireClinicManagementDoctorPageMock.mockReset();
    listSettingsByScopeMock.mockReset();
    settingsFormMock.mockClear();
    appointmentReminderMock.mockClear();
    requireClinicManagementDoctorPageMock.mockResolvedValue({
      organizationId: "org-1",
    });
    listSettingsByScopeMock.mockImplementation(async (scope: "doctor" | "admin") =>
      scope === "doctor"
        ? [
            { key: "patient_label", valueJson: { value: "клиент" } },
            {
              key: "doctor_patient_support_comments_without_support_default_enabled",
              valueJson: { value: true },
            },
            {
              key: "doctor_patient_support_media_without_support_default_enabled",
              valueJson: { value: false },
            },
            { key: "doctor_appointment_reminder_enabled", valueJson: { value: true } },
            { key: "doctor_appointment_reminder_offsets_minutes", valueJson: { value: [1440, 120] } },
          ]
        : [],
    );
  });

  it("uses the clinic-management guard and admin settings API props for per-org sections", async () => {
    render(await DoctorClinicSettingsPage());

    expect(requireClinicManagementDoctorPageMock).toHaveBeenCalledTimes(1);
    expect(listSettingsByScopeMock).toHaveBeenCalledWith("doctor", { organizationId: "org-1" });
    expect(listSettingsByScopeMock).toHaveBeenCalledWith("admin", { organizationId: "org-1" });
    expect(screen.getByRole("heading", { name: "Настройки клиники" })).toBeInTheDocument();

    expect(settingsFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientLabel: "клиент",
        settingsEndpoint: "/api/admin/settings",
        showSmsFallback: false,
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
});
