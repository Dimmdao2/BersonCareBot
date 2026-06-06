/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientAppShell } from "./PatientAppShell";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/shared/ui/AppAccessDeniedToastEffect", () => ({
  AppAccessDeniedToastEffect: () => null,
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));


vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => 0,
}));

describe("PatientAppShell width variants", () => {
  it("uses mobile shell cap 430px with safe padding and caps width from md+", () => {
    const { container } = render(
      <PatientAppShell title="Сегодня" user={null}>
        <div>Content</div>
      </PatientAppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("w-full");
    expect(shell).toHaveClass("max-w-full");
    expect(shell).toHaveClass("overflow-x-clip");
    expect(shell).toHaveClass("safe-padding-patient-horiz");
    expect(shell).toHaveClass("max-patient-desktop:max-w-[430px]");
    expect(shell).toHaveClass("patient-desktop:max-w-[min(1180px,calc(100%_-_2rem))]");
    expect(shell).toHaveAttribute("data-patient-shell-max-px", "430");
  });

  it("uses white patient canvas background", () => {
    const { container } = render(
      <PatientAppShell title="Сегодня" user={null}>
        <div>Content</div>
      </PatientAppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("bg-white");
  });

  it("forwards patientTitleBadge in subpage title strip on non-primary routes", () => {
    pathnameRef.value = "/app/patient/profile";
    render(
      <PatientAppShell
        title="Раздел"
        user={null}
        patientTitleBadge="По подписке"
        backHref="/app/patient"
      >
        <div>Body</div>
      </PatientAppShell>,
    );
    const chrome = screen.getByTestId("patient-shell-top-chrome");
    expect(within(chrome).getByTestId("patient-header-title-badge")).toHaveTextContent("По подписке");
    expect(screen.getByTestId("patient-shell-page-title-wrap")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Сегодня" })).toBeNull();
  });

  it("renders bottom nav shell without page title on primary tab", () => {
    pathnameRef.value = "/app/patient";
    const { container } = render(
      <PatientAppShell title="Сегодня" user={null} patientSuppressShellTitle>
        <div>Content</div>
      </PatientAppShell>,
    );

    expect(screen.getByTestId("patient-shell-top-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("patient-bottom-nav")).toBeInTheDocument();
    expect(container.querySelector("#patient-top-nav")).toBeNull();
    expect(screen.queryByTestId("patient-gated-header-wrap")).toBeNull();
    expect(screen.queryByTestId("patient-shell-page-title-wrap")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Сегодня" })).toBeNull();
  });

  it("renders mobile header title and desktop subpage strip on nested routes", () => {
    pathnameRef.value = "/app/patient/profile";
    render(
      <PatientAppShell title="Мой профиль" user={null} backHref="/app/patient">
        <div>Content</div>
      </PatientAppShell>,
    );

    const chrome = screen.getByTestId("patient-shell-top-chrome");
    expect(within(chrome).getByRole("heading", { level: 1, name: "Мой профиль" })).toBeInTheDocument();
    expect(within(chrome).getByRole("button", { name: "Назад" })).toBeInTheDocument();
    expect(screen.getByTestId("patient-shell-page-title-wrap")).toBeInTheDocument();
  });

  it("shows patient header on all breakpoints when bottom nav is hidden (no top nav)", () => {
    render(
      <PatientAppShell title="Вход" user={null} patientHideBottomNav>
        <div>Body</div>
      </PatientAppShell>,
    );

    expect(screen.queryByRole("navigation", { name: /Основная навигация/i })).toBeNull();
    const headerWrap = screen.getByTestId("patient-gated-header-wrap");
    expect(headerWrap).not.toHaveClass("md:hidden");
  });
});
