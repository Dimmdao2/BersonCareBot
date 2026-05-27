/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientShellHeaderBar } from "./PatientShellHeaderBar";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => 0,
}));

describe("PatientShellHeaderBar", () => {
  it("shows profile link on root primary nav tab", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientShellHeaderBar title="Сегодня" />);
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("href", "/app/patient/profile");
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("shows back button on subpages", () => {
    pathnameRef.value = "/app/patient/profile";
    render(<PatientShellHeaderBar title="Мой профиль" backHref="/app/patient" backLabel="Назад" />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Профиль" })).toBeNull();
  });

  it("renders page title as h1", () => {
    pathnameRef.value = "/app/patient/booking/new";
    render(<PatientShellHeaderBar title="Запись" />);
    expect(screen.getByRole("heading", { level: 1, name: "Запись" })).toBeInTheDocument();
  });

  it("uses full-bleed shell chrome without viewport fixed centering", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientShellHeaderBar title="Сегодня" />);
    const bar = screen.getByTestId("patient-shell-header-bar");
    expect(bar).toHaveClass("safe-bleed-x");
    expect(bar).toHaveClass("sticky");
    expect(bar).not.toHaveClass("patient-mobile:fixed");
  });

  it("includes inline primary nav for desktop layout", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientShellHeaderBar title="Сегодня" />);
    const bar = screen.getByTestId("patient-shell-header-bar");
    const navs = within(bar).getAllByRole("navigation", { name: "Основная навигация пациента" });
    expect(navs.length).toBe(1);
    expect(within(navs[0]!).getByRole("link", { name: "Чат" })).toBeInTheDocument();
  });
});
