/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OperatorHealthAlertsSection } from "./OperatorHealthAlertsSection";
import { defaultOperatorHealthAlertConfig } from "@/modules/operator-alerts/operatorHealthAlertConfig";

vi.mock("./patchAdminSetting", () => ({
  patchAdminSetting: vi.fn().mockResolvedValue(true),
}));

describe("OperatorHealthAlertsSection", () => {
  it("renders three notification blocks and digest time", () => {
    render(<OperatorHealthAlertsSection initialConfig={defaultOperatorHealthAlertConfig()} />);

    expect(screen.getByText("Уведомления админу")).toBeInTheDocument();
    expect(screen.getByText("Критичные сбои")).toBeInTheDocument();
    expect(screen.getByText("Суточная сводка")).toBeInTheDocument();
    expect(screen.getByText("Конфликты аккаунтов")).toBeInTheDocument();
    expect(screen.getByLabelText("Время суточной сводки")).toHaveValue("09:00");
  });

  it("account_conflicts toggle controls single conflicts block", async () => {
    const user = userEvent.setup();
    render(<OperatorHealthAlertsSection initialConfig={defaultOperatorHealthAlertConfig()} />);

    const conflictToggle = screen.getByLabelText("Конфликты аккаунтов");
    expect(conflictToggle).toBeChecked();
    await user.click(conflictToggle);
    expect(conflictToggle).not.toBeChecked();
  });
});
