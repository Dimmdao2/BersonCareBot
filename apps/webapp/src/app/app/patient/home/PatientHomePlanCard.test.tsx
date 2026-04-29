/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomePlanCard } from "./PatientHomePlanCard";

describe("PatientHomePlanCard", () => {
  it("links to treatment program instance", () => {
    render(
      <PatientHomePlanCard instanceId="abc-123" title="Программа восстановления" metaLine="Активна" />,
    );
    expect(screen.getByRole("link", { name: "Смотреть план" })).toHaveAttribute(
      "href",
      "/app/patient/treatment-programs/abc-123",
    );
  });

  it("shows progress bar when percent provided", () => {
    const { container } = render(
      <PatientHomePlanCard instanceId="x" title="T" progressPercent={40} />,
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(container.querySelector('[style*="40%"]')).toBeTruthy();
  });
});
