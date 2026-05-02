/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppParametersSection } from "./AppParametersSection";

const patchMock = vi.fn();

vi.mock("./patchAdminSetting", () => ({
  patchAdminSetting: (...args: unknown[]) => patchMock(...args),
}));

describe("AppParametersSection", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(true);
  });

  it("patches only app parameters on save (no maintenance keys)", async () => {
    const user = userEvent.setup();
    render(
      <AppParametersSection
        appBaseUrl="https://app.example.com"
        supportContactUrl="/app/patient/support"
        appDisplayTimezone="Europe/Moscow"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Сохранить/i }));
    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    const keys = patchMock.mock.calls.map((c) => c[0] as string);
    expect(keys).toEqual(
      expect.arrayContaining(["app_base_url", "support_contact_url", "app_display_timezone"]),
    );
    expect(keys).toHaveLength(3);
    expect(keys).not.toContain("patient_app_maintenance_enabled");
  });
});
