/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientShellTopChrome } from "./PatientShellTopChrome";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => 0,
  usePatientNotificationUnreadCount: () => 0,
  notifyPatientNotificationUnreadCountChanged: vi.fn(),
}));

describe("PatientShellTopChrome", () => {
  it("shows profile link and no title on primary tab without title prop", () => {
    render(<PatientShellTopChrome />);
    const chrome = screen.getByTestId("patient-shell-top-chrome");
    expect(within(chrome).getAllByRole("link", { name: "Профиль" })[0]).toHaveAttribute(
      "href",
      "/app/patient/profile",
    );
    expect(within(chrome).getAllByRole("link", { name: "Уведомления" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("shows mobile page title when provided", () => {
    render(<PatientShellTopChrome title="Мой профиль" showBack backHref="/app/patient" />);
    const chrome = screen.getByTestId("patient-shell-top-chrome");
    const mobileRow = chrome.querySelector(".patient-desktop\\:hidden");
    expect(within(mobileRow as HTMLElement).getByRole("heading", { level: 1, name: "Мой профиль" })).toBeInTheDocument();
    expect(within(mobileRow as HTMLElement).getByRole("button", { name: "Назад" })).toBeInTheDocument();
  });

  it("includes inline primary nav on desktop only", () => {
    render(<PatientShellTopChrome title="Сегодня" />);
    const chrome = screen.getByTestId("patient-shell-top-chrome");
    const navs = within(chrome).getAllByRole("navigation", { name: "Основная навигация пациента" });
    expect(navs).toHaveLength(1);
    expect(navs[0]!.closest(".patient-desktop\\:flex")).toBeTruthy();
  });

  it("uses viewport-fixed top chrome on mobile", () => {
    render(<PatientShellTopChrome />);
    const chrome = screen.getByTestId("patient-shell-top-chrome");
    expect(chrome).toHaveClass("patient-mobile:fixed");
    expect(chrome).toHaveClass("patient-mobile:inset-x-0");
  });
});
