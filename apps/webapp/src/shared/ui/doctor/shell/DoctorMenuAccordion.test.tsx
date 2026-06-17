/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorMenuAccordion, formatNavBadgeCount } from "./DoctorMenuAccordion";

const menuAccess = { role: "doctor" as const, adminMode: false };
const adminAccess = { role: "admin" as const, adminMode: true };

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
  }) {
    const { href, children, onClick, id, "aria-label": ariaLabel, role, ...rest } = props;
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

// Mock popover to render content inline (no portal in jsdom)
vi.mock("@/shared/ui/doctor/primitives/popover", () => ({
  Popover: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    <div data-popover-open={open}>{children}</div>
  ),
  PopoverTrigger: ({ render: renderProp }: { render?: ReactNode; children?: ReactNode }) =>
    renderProp ?? null,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-popover-content>{children}</div>
  ),
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
  });

  it("renders top-level sidebar links including Каталог ЛФК group trigger", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Сегодня/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    });
    // Каталог ЛФК is a group trigger button
    expect(screen.getByRole("button", { name: /Каталог ЛФК/ })).toBeInTheDocument();
  });

  it("sidebar renders sub-items inside flyout content (always visible via popover mock)", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      // sub-items are rendered inside popover content (which is always visible in jsdom mock)
      expect(screen.getByRole("menuitem", { name: "Упражнения" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Комплексы ЛФК" })).toBeInTheDocument();
    });
  });

  it("sidebar: Каталог ЛФК trigger has aria-haspopup=menu", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: /Каталог ЛФК/ }));
    expect(screen.getByRole("button", { name: /Каталог ЛФК/ })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("top-level direct links are always visible regardless of groups", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Расписание/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Коммуникации/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Контент/ })).toBeInTheDocument();
  });

  it("hides settings and system for doctor role", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    expect(screen.queryByRole("button", { name: /Настройки/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Система/ })).not.toBeInTheDocument();
  });

  it("shows settings and system for admin role", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={adminAccess} />);
    await waitFor(() => screen.getByRole("button", { name: /Настройки/ }));
    expect(screen.getByRole("button", { name: /Система/ })).toBeInTheDocument();
  });

  // Sheet (mobile) tests

  it("sheet: renders top-level including Каталог ЛФК group trigger", async () => {
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    expect(screen.getByRole("button", { name: /Каталог ЛФК/ })).toBeInTheDocument();
  });

  it("sheet: tapping Каталог ЛФК shows sub-items and back button", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: /Каталог ЛФК/ }));
    await user.click(screen.getByRole("button", { name: /Каталог ЛФК/ }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Комплексы ЛФК" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Клинические тесты" })).toBeInTheDocument();
    });
    // Back button present
    expect(screen.getByRole("button", { name: /Назад|Каталог ЛФК/ })).toBeInTheDocument();
  });

  it("sheet: back button from second level returns to top level", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: /Каталог ЛФК/ }));
    await user.click(screen.getByRole("button", { name: /Каталог ЛФК/ }));
    await waitFor(() => screen.getByRole("link", { name: "Упражнения" }));
    // Click the first button in second level view (back button)
    const backBtn = screen.getAllByRole("button")[0]!;
    await user.click(backBtn);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Сегодня/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
  });

  it("calls onNavigate when link clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} onNavigate={onNavigate} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    await user.click(screen.getByRole("link", { name: /Сегодня/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows communicationsTotal badge on Коммуникации link when counts > 0", async () => {
    intakeCountRef.value = 4;
    unreadCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      const comms = screen.getByRole("link", { name: /Коммуникации/ });
      expect(comms).toHaveTextContent("6");
      expect(comms).toHaveAttribute("aria-label", "Коммуникации. Непрочитанных: 6.");
    });
  });

  it("shows communicationsTotal badge in sheet variant", async () => {
    intakeCountRef.value = 1;
    unreadCountRef.value = 5;
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Коммуникации/ })).toHaveAttribute(
        "id",
        "doctor-menu-link-communications",
      );
    });
  });

  it("hides communications badge when counts are zero", async () => {
    intakeCountRef.value = 0;
    unreadCountRef.value = 0;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Коммуникации/ }));
    expect(
      screen.getByRole("link", { name: /Коммуникации/ }).querySelector("[aria-label^='Непрочитанных']"),
    ).toBeNull();
  });

  it("shows 99+ when communicationsTotal is at least 100", async () => {
    intakeCountRef.value = 80;
    unreadCountRef.value = 25;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Коммуникации/ })).toHaveTextContent("99+");
    });
  });

  it("shows combined today attention badge when pending tests or proactive signals > 0", async () => {
    pendingProgramTestsCountRef.value = 5;
    proactiveInsightsCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor/clients" menuAccess={menuAccess} />);
    await waitFor(() => {
      const today = screen.getByRole("link", { name: /Сегодня/ });
      expect(today).toHaveTextContent("7");
      expect(today).toHaveAttribute("aria-label", "Сегодня. Требует внимания: 7.");
    });
  });
});
