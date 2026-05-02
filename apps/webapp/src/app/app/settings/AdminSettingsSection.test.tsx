/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSettingsSection } from "./AdminSettingsSection";

const patchBatchMock = vi.fn();

vi.mock("./patchAdminSetting", () => ({
  patchAdminSetting: vi.fn(),
  patchAdminSettingsBatch: (...args: unknown[]) => patchBatchMock(...args),
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
    patchBatchMock.mockReset();
    patchBatchMock.mockResolvedValue({ ok: true });
  });

  it("save issues one batch PATCH for admin slots, test_account_identifiers, maintenance and mode flags", async () => {
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
    await waitFor(() => expect(patchBatchMock).toHaveBeenCalledTimes(1));

    const items = patchBatchMock.mock.calls[0]![0] as { key: string; value: unknown }[];
    expect(items).toHaveLength(13);
    const keys = items.map((i) => i.key);
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

    const phonesItem = items.find((c) => c.key === "admin_phones");
    expect(phonesItem?.value).toEqual(["+79990000001"]);

    const testItem = items.find((c) => c.key === "test_account_identifiers");
    expect(testItem?.value).toEqual({
      phones: [],
      telegramIds: ["111", "222"],
      maxIds: ["m1"],
    });
  });
});
