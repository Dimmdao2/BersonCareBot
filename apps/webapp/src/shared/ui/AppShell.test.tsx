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
  it("keeps patient variant in mobile shell width and widens on lg+ (VISUAL_SYSTEM_SPEC §3 / §5)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("max-w-[430px]");
    expect(shell).toHaveClass("lg:max-w-[min(1180px,calc(100vw-2rem))]");
  });

  it("treats patient-wide as alias for patient (legacy back-compat)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient-wide">
        <div>Content</div>
      </AppShell>,
    );

    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toHaveClass("max-w-[430px]");
    expect(shell).toHaveClass("lg:max-w-[min(1180px,calc(100vw-2rem))]");
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

  it("forwards patientTitleBadge to patient header", () => {
    render(
      <AppShell title="Раздел" user={null} variant="patient" patientTitleBadge="По подписке">
        <div>Body</div>
      </AppShell>,
    );
    expect(screen.getByTestId("patient-header-title-badge")).toHaveTextContent("По подписке");
  });

  it("hides patient header row on lg when top nav shell is active (no duplicate chrome)", () => {
    const { container } = render(
      <AppShell title="Сегодня" user={null} variant="patient">
        <div>Content</div>
      </AppShell>,
    );

    expect(container.querySelector("#patient-top-nav")).toBeTruthy();
    const headerWrap = screen.getByTestId("patient-gated-header-wrap");
    expect(headerWrap).toHaveClass("lg:hidden");
  });

  it("shows patient header on all breakpoints when bottom nav is hidden (no top nav)", () => {
    render(
      <AppShell title="Вход" user={null} variant="patient" patientHideBottomNav>
        <div>Body</div>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation", { name: /Основная навигация/i })).toBeNull();
    const headerWrap = screen.getByTestId("patient-gated-header-wrap");
    expect(headerWrap).not.toHaveClass("lg:hidden");
  });
});
