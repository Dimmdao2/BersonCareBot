/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import { PatientTopNav } from "./PatientTopNav";
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

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
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

describe("PatientTopNav", () => {
  it("renders mobile top nav as moved bottom menu, no warmups or desktop actions", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);

    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(mobileNav).toHaveClass("patient-desktop:hidden");
    expect(within(mobileNav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Сегодня",
      "Упражнения",
      "Статистика",
      "Запись",
      "Чат",
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

  it("sets aria-current=page on Упражнения when pathname matches /app/patient/treatment", () => {
    pathnameRef.value = "/app/patient/treatment";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "Упражнения" })).toHaveAttribute("aria-current", "page");
  });

  it("sets aria-current=page on Упражнения for treatment instance subpath", () => {
    pathnameRef.value = "/app/patient/treatment/11111111-1111-4111-8111-111111111111";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "Упражнения" })).toHaveAttribute("aria-current", "page");
  });

  it("does not set plan active on legacy treatment-programs pathname", () => {
    pathnameRef.value = "/app/patient/treatment-programs";
    render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    expect(within(mobileNav).getByRole("link", { name: "Упражнения" })).not.toHaveAttribute("aria-current", "page");
  });

  it("shows chat unread count badge on Чат when chatUnread > 0 and hides after refresh event", () => {
    pathnameRef.value = "/app/patient";
    chatUnreadState.count = 2;
    const { rerender } = render(<PatientTopNav />);
    const mobileNav = screen.getByTestId("patient-mobile-top-nav");
    const chatLink = within(mobileNav).getByRole("link", { name: /Чат, 2 новых/i });
    expect(within(chatLink).getByText("2")).toBeInTheDocument();

    chatUnreadState.count = 0;
    notifyPatientSupportUnreadCountChanged();
    rerender(<PatientTopNav />);
    expect(within(mobileNav).getByRole("link", { name: "Чат" })).toBeInTheDocument();
    expect(within(mobileNav).queryByText("2")).not.toBeInTheDocument();
  });

  it("keeps desktop nav as a separate patient-desktop branch", () => {
    pathnameRef.value = "/app/patient";
    render(<PatientTopNav />);

    const desktopNav = screen.getByTestId("patient-desktop-top-nav");
    expect(desktopNav).toHaveClass("hidden");
    expect(desktopNav).toHaveClass("patient-desktop:flex");
    expect(within(desktopNav).getByText("BersonCare")).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "Напоминания" })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "Сообщения" })).toBeInTheDocument();
  });
});
