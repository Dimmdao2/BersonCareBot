/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { DoctorMenuAccordion, formatNavBadgeCount } from "./DoctorMenuAccordion";

const menuAccess = { capabilities: ["clinical.workspace"] as const };
const adminAccess = { capabilities: ["platform.operations", "organization.management", "clinical.workspace"] as const };

const pathnameRef = vi.hoisted(() => ({ value: "/app/doctor" }));
const unreadCountRef = vi.hoisted(() => ({ value: 0 }));
const intakeCountRef = vi.hoisted(() => ({ value: 0 }));
const pendingProgramTestsCountRef = vi.hoisted(() => ({ value: 0 }));
const proactiveInsightsCountRef = vi.hoisted(() => ({ value: 0 }));

vi.mock("@/shared/hooks/useSupportUnreadPolling", () => ({
  useDoctorSupportUnreadCount: () => unreadCountRef.value,
}));

vi.mock("@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount", () => ({
  useDoctorOnlineIntakeNewCount: () => intakeCountRef.value,
}));

vi.mock("@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount", () => ({
  useDoctorPendingProgramTestsCount: () => pendingProgramTestsCountRef.value,
}));

vi.mock("@/modules/doctor-proactive-insights/hooks/useDoctorProactiveInsightsCount", () => ({
  useDoctorProactiveInsightsCount: () => proactiveInsightsCountRef.value,
}));

vi.mock("@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount", () => ({
  useDoctorRegistrationSystemFailureCount: () => 0,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

vi.mock("next/link", () => ({
  default: function MockLink(props: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    id?: string;
    "aria-label"?: string;
    role?: string;
    prefetch?: boolean;
  }) {
    const { href, children, onClick, id, "aria-label": ariaLabel, role, prefetch: _prefetch, ...rest } = props;
    return (
      <a
        href={href}
        id={id}
        aria-label={ariaLabel}
        role={role}
        {...rest}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {children}
      </a>
    );
  },
}));

describe("formatNavBadgeCount", () => {
  it("returns null for non-positive", () => {
    expect(formatNavBadgeCount(0)).toBeNull();
    expect(formatNavBadgeCount(-3)).toBeNull();
  });

  it("formats 1..99", () => {
    expect(formatNavBadgeCount(42)).toBe("42");
    expect(formatNavBadgeCount(99)).toBe("99");
  });

  it("formats large counts as 99+", () => {
    expect(formatNavBadgeCount(100)).toBe("99+");
    expect(formatNavBadgeCount(900)).toBe("99+");
  });
});

describe("DoctorMenuAccordion", () => {
  beforeEach(() => {
    pathnameRef.value = "/app/doctor";
    unreadCountRef.value = 0;
    intakeCountRef.value = 0;
    pendingProgramTestsCountRef.value = 0;
    proactiveInsightsCountRef.value = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders top-level sidebar links including Каталог ЛФК group trigger", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    const todayLink = screen.getByRole("link", { name: /Сегодня/ });
    expect(todayLink).toBeInTheDocument();
    expect(todayLink).toHaveClass("rounded-sm");
    expect(todayLink).not.toHaveClass("rounded-md");
    expect(todayLink.className).not.toContain("doctor-control-radius");
    expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    // Каталог ЛФК is a group trigger button
    const libraryTrigger = screen.getByRole("button", { name: /Каталог ЛФК/ });
    expect(libraryTrigger).toBeInTheDocument();
    expect(libraryTrigger).toHaveClass("rounded-sm");
    expect(libraryTrigger).not.toHaveClass("rounded-md");
    expect(libraryTrigger.className).not.toContain("doctor-control-radius");
  });

  it("sidebar: flyout is closed by default", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.queryByRole("menuitem", { name: "Упражнения" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Комплексы ЛФК" })).not.toBeInTheDocument();
  });

  it("sidebar: flyout opens on mouseenter and shows sub-items", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    const trigger = screen.getByRole("button", { name: /Каталог ЛФК/ });

    // Before hover — closed
    expect(screen.queryByRole("menuitem", { name: "Упражнения" })).not.toBeInTheDocument();

    // Hover over trigger button
    fireEvent.mouseEnter(trigger);

    // Flyout should be open immediately (no open delay)
    expect(screen.getByRole("menuitem", { name: "Упражнения" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Комплексы ЛФК" })).toBeInTheDocument();
  });

  it("sidebar: flyout closes after mouse leaves trigger", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    const trigger = screen.getByRole("button", { name: /Каталог ЛФК/ });

    // Open
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("menuitem", { name: "Упражнения" })).toBeInTheDocument();

    // Leave trigger — starts close timer
    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole("menuitem", { name: "Упражнения" })).not.toBeInTheDocument();
  });

  it("sidebar: entering flyout panel cancels close timer (no flicker on hover transit)", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    const trigger = screen.getByRole("button", { name: /Каталог ЛФК/ });

    // Open via trigger
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("menuitem", { name: "Упражнения" })).toBeInTheDocument();

    // Leave trigger — starts close timer
    fireEvent.mouseLeave(trigger);
    // Cursor enters the flyout panel before timer fires — cancels close
    const flyoutPanel = document.getElementById("doctor-sidebar-flyout-library");
    if (flyoutPanel) fireEvent.mouseEnter(flyoutPanel);
    act(() => { vi.advanceTimersByTime(200); });

    // Should still be open (close timer was cancelled by flyout mouseenter)
    expect(screen.getByRole("menuitem", { name: "Упражнения" })).toBeInTheDocument();

    // Now leave the flyout panel too — should close
    if (flyoutPanel) fireEvent.mouseLeave(flyoutPanel);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole("menuitem", { name: "Упражнения" })).not.toBeInTheDocument();
  });

  it("sidebar: Каталог ЛФК trigger has aria-haspopup=menu", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("button", { name: /Каталог ЛФК/ })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("sidebar: active submenu parent does not get primary background", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor/exercises" menuAccess={menuAccess} />);
    const trigger = screen.getByRole("button", { name: /Каталог ЛФК/ });

    expect(trigger.className).not.toContain("bg-primary");
    expect(trigger.className).not.toContain("hover:bg-primary");
  });

  it("top-level direct links are always visible regardless of groups", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Расписание/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Коммуникации/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Контент/ })).toBeInTheDocument();
  });

  it("shows the personal account link and hides management and system for doctor role", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("link", { name: "Аккаунт" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Настройки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Система/ })).not.toBeInTheDocument();
  });

  it("shows settings and personal account links for clinic admin access", () => {
    render(
      <DoctorMenuAccordion
        variant="sidebar"
        pathname="/app/doctor"
        menuAccess={{ capabilities: ["organization.management"] }}
      />,
    );
    expect(screen.getByRole("link", { name: "Настройки" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
    expect(screen.getByRole("link", { name: "Аккаунт" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Аналитика/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Система/ })).not.toBeInTheDocument();
  });

  it("shows settings and personal account links for a dual-capability actor (doctor menu kind, default)", () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={adminAccess} />);
    expect(screen.getByRole("link", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аккаунт" })).toBeInTheDocument();
    // The platform-only cluster moved out to its own flat menu — the doctor menu kind never
    // renders it, even for an actor who also holds platform.operations.
    expect(screen.queryByRole("button", { name: /Система/ })).not.toBeInTheDocument();
  });

  it("menuKind=platform renders the flat platform menu — no group buttons, every item a direct link", () => {
    render(
      <DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={adminAccess} menuKind="platform" />,
    );
    expect(screen.getByRole("link", { name: "Здоровье системы" })).toHaveAttribute(
      "href",
      "/app/platform/system-health",
    );
    expect(screen.getByRole("link", { name: "Аналитика" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Журнал операций" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тарифы и триал" })).toBeInTheDocument();
    // Flat by owner ruling 2026-07-26: no "Система" (or any other) group/accordion button exists.
    expect(screen.queryByRole("button", { name: /Система/ })).not.toBeInTheDocument();
  });

  // Sheet (mobile) tests

  it("sheet: renders top-level including Каталог ЛФК group trigger", () => {
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("link", { name: /Сегодня/ })).toHaveClass("rounded-sm");
    expect(screen.getByRole("button", { name: /Каталог ЛФК/ })).toHaveClass("rounded-sm");
  });

  it("sheet: tapping Каталог ЛФК shows sub-items and back button", () => {
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Каталог ЛФК/ }));
    expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Комплексы ЛФК" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Клинические тесты" })).toBeInTheDocument();
    // Back button present
    expect(screen.getByRole("button", { name: /Назад|Каталог ЛФК/ })).toBeInTheDocument();
  });

  it("sheet: back button from second level returns to top level", () => {
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Каталог ЛФК/ }));
    expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    // Click the first button in second level view (back button)
    const backBtn = screen.getAllByRole("button")[0]!;
    fireEvent.click(backBtn);
    expect(screen.getByRole("link", { name: /Сегодня/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
  });

  it("calls onNavigate when link clicked", () => {
    const onNavigate = vi.fn();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("link", { name: /Сегодня/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows communicationsTotal badge on Коммуникации link when counts > 0", () => {
    intakeCountRef.value = 4;
    unreadCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    const comms = screen.getByRole("link", { name: /Коммуникации/ });
    expect(comms).toHaveTextContent("6");
    expect(comms).toHaveAttribute("aria-label", "Коммуникации. Непрочитанных: 6.");
  });

  it("shows communicationsTotal badge in sheet variant", () => {
    intakeCountRef.value = 1;
    unreadCountRef.value = 5;
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("link", { name: /Коммуникации/ })).toHaveAttribute(
      "id",
      "doctor-menu-link-communications",
    );
  });

  it("hides communications badge when counts are zero", () => {
    intakeCountRef.value = 0;
    unreadCountRef.value = 0;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(
      screen.getByRole("link", { name: /Коммуникации/ }).querySelector("[aria-label^='Непрочитанных']"),
    ).toBeNull();
  });

  it("shows 99+ when communicationsTotal is at least 100", () => {
    intakeCountRef.value = 80;
    unreadCountRef.value = 25;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    expect(screen.getByRole("link", { name: /Коммуникации/ })).toHaveTextContent("99+");
  });

  it("shows combined today attention badge when pending tests or proactive signals > 0", () => {
    pendingProgramTestsCountRef.value = 5;
    proactiveInsightsCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor/clients" menuAccess={menuAccess} />);
    const today = screen.getByRole("link", { name: /Сегодня/ });
    expect(today).toHaveTextContent("7");
    expect(today).toHaveAttribute("aria-label", "Сегодня. Требует внимания: 7.");
  });
});
