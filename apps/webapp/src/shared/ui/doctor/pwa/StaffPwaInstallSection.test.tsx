/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { STAFF_PWA_INSTALLED_STORAGE_KEY } from "@/shared/lib/pwa/staffPwaInstallState";
import { StaffPwaInstallSection } from "./StaffPwaInstallSection";

vi.mock("@/shared/lib/webPush/pwaDisplay", () => ({
  isStandalonePwa: vi.fn(() => true),
}));

describe("StaffPwaInstallSection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("does not show done in patient standalone without staff marker", async () => {
    render(<StaffPwaInstallSection />);
    await waitFor(() => {
      expect(screen.queryByText(/Приложение на устройстве/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Меню браузера|Поделиться|Установить/i)).toBeTruthy();
  });

  it("shows done when staff install marker is set", async () => {
    localStorage.setItem(STAFF_PWA_INSTALLED_STORAGE_KEY, "1");
    render(<StaffPwaInstallSection />);
    await waitFor(() => {
      expect(screen.getByText(/Приложение на устройстве/)).toBeInTheDocument();
    });
  });
});
