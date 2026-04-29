/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientBottomNav } from "./PatientBottomNav";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

describe("PatientBottomNav", () => {
  it("renders five primary items without profile label", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientBottomNav />);
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Запись" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Разминки" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "План" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Дневник" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Профиль" })).not.toBeInTheDocument();
  });

  it("sets aria-current=page on active primary item (today on /app/patient)", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientBottomNav />);
    expect(screen.getByRole("link", { name: "Сегодня" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Запись" })).not.toHaveAttribute("aria-current");
  });

  it("sets aria-current=page on booking when pathname matches", () => {
    pathnameRef.value = "/app/patient/booking";
    render(<PatientBottomNav />);
    expect(screen.getByRole("link", { name: "Запись" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Сегодня" })).not.toHaveAttribute("aria-current");
  });

  it("sets mobile max width constant on nav", () => {
    const { container } = render(<PatientBottomNav />);
    const nav = container.querySelector("#patient-bottom-nav");
    expect(nav?.getAttribute("data-patient-mobile-max-px")).toBe("430");
  });
});
