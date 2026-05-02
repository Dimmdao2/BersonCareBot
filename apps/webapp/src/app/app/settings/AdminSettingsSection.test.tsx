/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSettingsSection } from "./AdminSettingsSection";

const patchMock = vi.fn();

vi.mock("./patchAdminSetting", () => ({
  patchAdminSetting: (...args: unknown[]) => patchMock(...args),
}));

const baseProps = {
  devMode: false,
  debugForwardToAdmin: false,
  miniappAuthVerboseServerLog: false,
  importantFallbackDelayMinutes: 60,
  platformUserMergeV2Enabled: false,
  integratorLinkedPhoneSource: "public_then_contacts" as const,
  adminPhone: "",
  adminTelegramId: "",
  adminMaxId: "",
  testAccountPhones: "",
  testAccountTelegramIds: "",
  testAccountMaxIds: "",
  patientAppMaintenanceEnabled: false,
  patientAppMaintenanceMessage: "msg",
  patientBookingUrl: "https://example.com/book",
};

describe("AdminSettingsSection", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(true);
  });

  it("save issues PATCH for admin slots, test_account_identifiers, maintenance and mode flags", async () => {
    const user = userEvent.setup();
    render(
      <AdminSettingsSection
        {...baseProps}
        adminPhone="+79990000001"
        testAccountTelegramIds="111 222"
        testAccountMaxIds="m1"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Сохранить настройки/i }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(13));

    const keys = patchMock.mock.calls.map((c) => c[0] as string);
    expect(keys).toEqual(
      expect.arrayContaining([
        "dev_mode",
        "debug_forward_to_admin",
        "max_debug_page_enabled",
        "important_fallback_delay_minutes",
        "platform_user_merge_v2_enabled",
        "integrator_linked_phone_source",
        "admin_phones",
        "admin_telegram_ids",
        "admin_max_ids",
        "test_account_identifiers",
        "patient_app_maintenance_enabled",
        "patient_app_maintenance_message",
        "patient_booking_url",
      ]),
    );

    const phonesCall = patchMock.mock.calls.find((c) => c[0] === "admin_phones");
    expect(phonesCall?.[1]).toEqual(["+79990000001"]);

    const testCall = patchMock.mock.calls.find((c) => c[0] === "test_account_identifiers");
    expect(testCall?.[1]).toEqual({
      phones: [],
      telegramIds: ["111", "222"],
      maxIds: ["m1"],
    });
  });
});
