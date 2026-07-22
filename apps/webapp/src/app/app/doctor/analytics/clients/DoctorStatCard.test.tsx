// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DoctorStatCard } from "./DoctorStatCard";

describe("DoctorStatCard", () => {
  it("keeps the shared KPI label above the value in the 8px card shell", () => {
    render(<DoctorStatCard id="kpi-order" title="Записи" value={3} />);

    const card = document.getElementById("kpi-order");
    expect(card).toHaveClass("rounded-[var(--doctor-kpi-radius,8px)]");
    expect(card?.children[0]).toHaveTextContent("Записи");
    expect(card?.children[1]).toHaveTextContent("3");
    expect(card?.children[1]).toHaveClass("text-2xl");
  });

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

  it("shows the explanation on hover and keyboard focus without nesting another button", async () => {
    const user = userEvent.setup();
    render(
      <DoctorStatCard
        id="kpi-tooltip"
        title="С визитами"
        value={4}
        tooltip="Есть хотя бы один состоявшийся визит."
        onClick={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /С визитами/i });
    expect(trigger.querySelector("button")).toBeNull();

    await user.hover(trigger);
    expect(await screen.findByText("Есть хотя бы один состоявшийся визит.")).toBeVisible();

    await user.unhover(trigger);
    trigger.focus();
    expect(await screen.findByText("Есть хотя бы один состоявшийся визит.")).toBeVisible();
  });

  it("exposes selected filter state with the shared primary-soft styling", () => {
    render(
      <DoctorStatCard
        id="kpi-selected"
        title="Все"
        value={12}
        selected
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Все/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Все/i })).toHaveClass(
      "border-primary/35",
      "bg-primary/15",
      "text-primary",
      "ring-primary/25",
    );
  });
});
