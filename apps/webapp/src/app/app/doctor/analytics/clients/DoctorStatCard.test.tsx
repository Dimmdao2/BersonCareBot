// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
});
