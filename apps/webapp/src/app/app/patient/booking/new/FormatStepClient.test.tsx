/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormatStepClient } from "./FormatStepClient";
import { routePaths } from "@/app-layer/routes/paths";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe("FormatStepClient", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("«Очный приём» navigates to city step", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: "Очный приём" }));
    expect(push).toHaveBeenCalledWith(routePaths.bookingNewCity);
  });

  it("«Онлайн — ЛФК» navigates to intake/lfk", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: /ЛФК/i }));
    expect(push).toHaveBeenCalledWith(routePaths.intakeLfk);
  });

  it("«Онлайн — Нутрициология» navigates to intake/nutrition", async () => {
    const user = userEvent.setup();
    render(<FormatStepClient />);
    await user.click(screen.getByRole("button", { name: /нутрициол/i }));
    expect(push).toHaveBeenCalledWith(routePaths.intakeNutrition);
  });
});
