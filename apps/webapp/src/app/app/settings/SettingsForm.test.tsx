/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm } from "./SettingsForm";

vi.mock("@/components/common/form/LabeledSwitch", () => ({
  LabeledSwitch: ({
    label,
    checked,
    onCheckedChange,
  }: {
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <label>
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.currentTarget.checked)} />
    </label>
  ),
}));

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    );
  });

  it("clinic mode writes only per-org doctor keys through /api/admin/settings", async () => {
    const user = userEvent.setup();
    render(
      <SettingsForm
        patientLabel="пациент"
        smsFallbackEnabled={true}
        supportCommentsWithoutSupportDefault={false}
        supportMediaWithoutSupportDefault={false}
        settingsEndpoint="/api/admin/settings"
        showSmsFallback={false}
      />,
    );

    expect(screen.queryByText("SMS fallback")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.every((call) => call[0] === "/api/admin/settings")).toBe(true);
    const keys = calls.map((call) => {
      const init = call[1] as RequestInit;
      return JSON.parse(String(init.body)) as { key: string };
    }).map((body) => body.key);
    expect(keys).toEqual([
      "patient_label",
      "doctor_patient_support_comments_without_support_default_enabled",
      "doctor_patient_support_media_without_support_default_enabled",
    ]);
    expect(keys).not.toContain("sms_fallback_enabled");
  });
});
