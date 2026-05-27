/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import { PatientBottomNav } from "./PatientBottomNav";
import { notifyPatientSupportUnreadCountChanged } from "@/modules/messaging/hooks/useSupportUnreadPolling";

const pathnameRef = vi.hoisted(() => ({ value: "/app/patient" }));
const chatUnreadState = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/messaging/hooks/useSupportUnreadPolling")>();
  return {
    ...actual,
    usePatientSupportUnreadCount: () => {
      const [count, setCount] = useState(chatUnreadState.count);
      useEffect(() => {
        const onRefresh = () => setCount(chatUnreadState.count);
        window.addEventListener("bersoncare:patient-support-unread-refresh", onRefresh);
        return () => window.removeEventListener("bersoncare:patient-support-unread-refresh", onRefresh);
      }, []);
      return count;
    },
  };
});

describe("PatientBottomNav", () => {
  it("renders bottom nav with chat instead of profile", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientBottomNav />);

    const bottomNav = screen.getByTestId("patient-bottom-nav");
    expect(within(bottomNav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Сегодня",
      "Упражнения",
      "Статистика",
      "Запись",
      "Чат",
    ]);
  });

  it("sets aria-current=page on active nav link", () => {
    pathnameRef.value = "/app/patient/messages";
    render(<PatientBottomNav />);
    const bottomNav = screen.getByTestId("patient-bottom-nav");
    expect(within(bottomNav).getByRole("link", { name: "Чат" })).toHaveAttribute("aria-current", "page");
  });

  it("shows chat unread dot on Чат when chatUnread > 0", () => {
    pathnameRef.value = "/app/patient";
    chatUnreadState.count = 2;
    const { rerender } = render(<PatientBottomNav />);
    const bottomNav = screen.getByTestId("patient-bottom-nav");
    const chatLink = within(bottomNav).getByRole("link", { name: /Чат/ });
    expect(chatLink.getAttribute("aria-label")).toMatch(/есть новые сообщения/);

    chatUnreadState.count = 0;
    notifyPatientSupportUnreadCountChanged();
    rerender(<PatientBottomNav />);
    expect(chatLink.querySelector(".bg-\\[\\#c0392b\\]")).toBeNull();
  });

  it("uses viewport-fixed bottom chrome on mobile", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientBottomNav />);
    const bottomNav = screen.getByTestId("patient-bottom-nav");
    expect(bottomNav).toHaveClass("patient-mobile:fixed");
    expect(bottomNav).toHaveClass("patient-mobile:inset-x-0");
    expect(bottomNav).not.toHaveClass("patient-mobile:-translate-x-1/2");
  });
});
