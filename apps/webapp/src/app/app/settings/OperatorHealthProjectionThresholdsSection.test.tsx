/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorHealthProjectionThresholdsSection } from "./OperatorHealthProjectionThresholdsSection";
import { DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS } from "@/modules/operator-health/operatorHealthProjectionThresholds";

vi.mock("./patchAdminSetting", () => ({
  patchAdminSetting: vi.fn().mockResolvedValue(true),
}));

describe("OperatorHealthProjectionThresholdsSection", () => {
  it("renders projection threshold fields with defaults", () => {
    render(
      <OperatorHealthProjectionThresholdsSection
        initialThresholds={DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS}
      />,
    );
    expect(screen.getByText("Projection (сводка)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ретраи, мин")).toHaveValue(15);
    expect(screen.getByLabelText("Долгий pending, мин")).toHaveValue(15);
    expect(screen.getByLabelText("Возраст pending, мин")).toHaveValue(30);
  });
});
