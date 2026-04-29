/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";

describe("PatientHomeProgressBlock", () => {
  it("renders progressbar with aria values", () => {
    render(<PatientHomeProgressBlock practiceTarget={5} progress={2} streakDays={3} />);
    const bar = screen.getByRole("progressbar", { name: "Прогресс за сегодня" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("подряд", { exact: false })).toBeInTheDocument();
  });

  it("shows guest copy without progressbar", () => {
    render(<PatientHomeProgressBlock practiceTarget={5} progress={0} streakDays={0} guestMode />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/Войдите под своим аккаунтом/i)).toBeInTheDocument();
  });

  it("shows loading skeleton without shrinking card", () => {
    const { container } = render(
      <PatientHomeProgressBlock practiceTarget={5} progress={0} streakDays={0} loading />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
