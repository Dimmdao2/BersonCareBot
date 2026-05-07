/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientTopNav } from "./PatientTopNav";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

describe("PatientTopNav", () => {
  it("renders mobile top nav as moved bottom menu, no warmups or desktop actions", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);

    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(mobileNav).toHaveClass("lg:hidden");
    expect(within(mobileNav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Сегодня",
      "Запись",
      "Дневник",
      "План",
      "Профиль",
    ]);
    expect(within(mobileNav).queryByRole("link", { name: /Разминки/i })).not.toBeInTheDocument();
    expect(within(mobileNav).queryByRole("link", { name: "Напоминания" })).not.toBeInTheDocument();
    expect(within(mobileNav).queryByRole("link", { name: "Сообщения" })).not.toBeInTheDocument();
  });

  it("sets aria-current=page on active nav link", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "Сегодня" })).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on plan when pathname matches /app/patient/treatment", () => {
    pathnameRef.value = "/app/patient/treatment";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "План" })).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on plan for treatment instance subpath", () => {
    pathnameRef.value = "/app/patient/treatment/11111111-1111-4111-8111-111111111111";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "План" })).toHaveAttribute("aria-current", "page");
  });

  it("does not set plan active on legacy treatment-programs pathname", () => {
    pathnameRef.value = "/app/patient/treatment-programs";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "План" })).not.toHaveAttribute("aria-current", "page");
  });

  it("keeps desktop nav as a separate lg branch", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);

    const desktopNav = screen.getByTestId("patient-desktop-top-nav");
    expect(desktopNav).toHaveClass("hidden");
    expect(desktopNav).toHaveClass("lg:flex");
    expect(within(desktopNav).getByText("BersonCare")).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "Напоминания" })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "Сообщения" })).toBeInTheDocument();
  });
});
