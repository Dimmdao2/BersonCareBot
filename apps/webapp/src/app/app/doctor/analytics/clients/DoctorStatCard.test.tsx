// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DoctorStatCard } from "./DoctorStatCard";

describe("DoctorStatCard", () => {
  it("calls onClick when clicking the title area", () => {
    const onClick = vi.fn();
    render(<DoctorStatCard id="kpi-test" title="Записи" value={3} onClick={onClick} />);
    fireEvent.click(screen.getByText("Записи"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when clicking the value", () => {
    const onClick = vi.fn();
    render(<DoctorStatCard id="kpi-test-2" title="Клиенты" value={12} onClick={onClick} />);
    fireEvent.click(screen.getByText("12"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when activating the card with Enter", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DoctorStatCard id="kpi-kbd-enter" title="Отмены" value={1} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /Отмены/i });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when activating the card with Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DoctorStatCard id="kpi-kbd-space" title="Записи" value={2} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /Записи/i });
    button.focus();
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
