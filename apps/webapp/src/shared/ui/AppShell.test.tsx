/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/app/patient",
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

vi.mock("@/shared/ui/useViewportMinWidth", () => ({
  useViewportMinWidthLg: () => false,
}));

describe("AppShell", () => {
  it("patient variant uses scoped patient page background token and mobile max width data attribute", () => {
    const { container } = render(
      <AppShell title="Главное меню" user={{ displayName: "x", role: "client", userId: "1", bindings: {} }} variant="patient">
        <div />
      </AppShell>,
    );
    const shell = container.querySelector("#app-shell-patient");
    expect(shell).toBeTruthy();
    expect(shell?.className).toContain("bg-[var(--patient-page-bg)]");
    expect(shell?.getAttribute("data-patient-shell-max-px")).toBe("430");
    expect(shell?.className).toContain("max-w-[430px]");
  });

  it("patient shell mutual exclusivity: bottom nav lg:hidden, top nav host hidden lg:block", () => {
    const { container } = render(
      <AppShell title="Главное меню" user={{ displayName: "x", role: "client", userId: "1", bindings: {} }} variant="patient">
        <div />
      </AppShell>,
    );
    const bottom = container.querySelector("#patient-bottom-nav");
    const top = container.querySelector("#patient-top-nav");
    expect(bottom?.className).toMatch(/lg:hidden/);
    expect(top?.parentElement?.className).toMatch(/\bhidden\b/);
    expect(top?.parentElement?.className).toMatch(/lg:block/);
  });

  it("default variant does not apply patient page background class", () => {
    const { container } = render(
      <AppShell title="Настройки" user={null} variant="default">
        <div />
      </AppShell>,
    );
    const shell = container.querySelector("#app-shell-default");
    expect(shell).toBeTruthy();
    expect(shell?.className).not.toContain("bg-[var(--patient-page-bg)]");
  });

  it("doctor variant does not apply patient page background class", () => {
    const { container } = render(
      <AppShell title="Кабинет" user={null} variant="doctor">
        <div />
      </AppShell>,
    );
    const shell = container.querySelector("#app-shell-doctor");
    expect(shell).toBeTruthy();
    expect(shell?.className).not.toContain("bg-[var(--patient-page-bg)]");
  });
});
