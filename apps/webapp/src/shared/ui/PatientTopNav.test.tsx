/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientTopNav } from "./PatientTopNav";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

describe("PatientTopNav", () => {
  it("renders BersonCare brand and five nav items plus profile, no settings gear", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);
    expect(screen.getByText("BersonCare")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Основная навигация" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Сегодня/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Запись/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Разминки/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /План/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Дневник/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Профиль" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Настройки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назад" })).not.toBeInTheDocument();
  });

  it("sets aria-current=page on active nav link", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);
    expect(screen.getByRole("link", { name: /Сегодня/i })).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on plan when pathname matches treatment programs", () => {
    pathnameRef.value = "/app/patient/treatment-programs";
    render(<PatientTopNav />);
    expect(screen.getByRole("link", { name: /План/i })).toHaveAttribute("aria-current", "page");
  });
});
