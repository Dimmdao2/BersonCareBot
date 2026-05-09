/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("AppShell patient width variants", () => {
  it("keeps patient variant in mobile shell width and widens on md+ (VISUAL_SYSTEM_SPEC baseline)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("max-w-[430px]");
    expect(shell).toHaveClass("md:max-w-[min(1180px,calc(100vw-2rem))]");
  });

  it("treats patient-wide as alias for patient (legacy back-compat)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient-wide">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("max-w-[430px]");
    expect(shell).toHaveClass("md:max-w-[min(1180px,calc(100vw-2rem))]");
  });

  it("uses patient page background token", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("bg-[var(--patient-page-bg)]");
  });

  it("forwards patientTitleBadge below top nav title strip", () => {
    render(
      <AppShell title="Раздел" user={null} variant="patient" patientTitleBadge="По подписке">
        <div>Body</div>
      </AppShell>,
    );
    expect(screen.getByTestId("patient-header-title-badge")).toHaveTextContent("По подписке");
    expect(screen.getByTestId("patient-shell-page-title-wrap")).toBeInTheDocument();
  });

  it("does not render patient header row when top nav shell is active", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient" patientSuppressShellTitle>
        <div>Content</div>
      </AppShell>,
    );

    expect(container.querySelector("#patient-top-nav")).toBeTruthy();
    expect(screen.queryByTestId("patient-gated-header-wrap")).toBeNull();
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
