/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => 0,
}));

describe("AppShell patient width variants", () => {
  it("uses mobile shell cap 430px with safe padding and caps width from md+", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("w-full");
    expect(shell).toHaveClass("max-w-full");
    expect(shell).toHaveClass("overflow-x-clip");
    expect(shell).toHaveClass("safe-padding-patient");
    expect(shell).toHaveClass("max-patient-desktop:max-w-[430px]");
    expect(shell).toHaveClass("patient-desktop:max-w-[min(1180px,calc(100%-2rem))]");
    expect(shell).toHaveAttribute("data-patient-shell-max-px", "430");
  });

  it("treats patient-wide as alias for patient (legacy back-compat)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient-wide">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("w-full");
    expect(shell).toHaveClass("max-w-full");
    expect(shell).toHaveClass("safe-padding-patient");
    expect(shell).toHaveClass("max-patient-desktop:max-w-[430px]");
    expect(shell).toHaveClass("patient-desktop:max-w-[min(1180px,calc(100%-2rem))]");
  });

  it("uses white patient canvas background", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("bg-white");
  });

  it("forwards patientTitleBadge in bottom shell header bar", () => {
    render(
      <AppShell title="Раздел" user={null} variant="patient" patientTitleBadge="По подписке">
        <div>Body</div>
      </AppShell>,
    );
    expect(screen.getByTestId("patient-header-title-badge")).toHaveTextContent("По подписке");
    expect(screen.queryByTestId("patient-shell-page-title-wrap")).toBeNull();
    expect(screen.getByTestId("patient-shell-header-bar")).toBeInTheDocument();
  });

  it("renders bottom nav shell chrome when patient nav is active", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient" patientSuppressShellTitle>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("patient-shell-header-bar")).toBeInTheDocument();
    expect(screen.getByTestId("patient-bottom-nav")).toBeInTheDocument();
    expect(container.querySelector("#patient-top-nav")).toBeNull();
    expect(screen.queryByTestId("patient-gated-header-wrap")).toBeNull();
    expect(within(screen.getByTestId("patient-shell-header-bar")).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Сегодня",
    );
  });

  it("does not render title strip in bottom shell variant", () => {
    render(
      <AppShell
        title="Скрытый заголовок"
        user={null}
        variant="patient"
        patientSuppressShellTitle
        patientShellTitleSlot={<span data-testid="patient-shell-custom-slot">Custom</span>}
      >
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.queryByTestId("patient-shell-page-title-wrap")).toBeNull();
    expect(screen.queryByTestId("patient-shell-custom-slot")).toBeNull();
    expect(screen.getByText("Скрытый заголовок")).toBeInTheDocument();
  });

  it("shows patient header on all breakpoints when bottom nav is hidden (no top nav)", () => {
    render(
      <AppShell title="Вход" user={null} variant="patient" patientHideBottomNav>
        <div>Body</div>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation", { name: /Основная навигация/i })).toBeNull();
    const headerWrap = screen.getByTestId("patient-gated-header-wrap");
    expect(headerWrap).not.toHaveClass("md:hidden");
  });
});
