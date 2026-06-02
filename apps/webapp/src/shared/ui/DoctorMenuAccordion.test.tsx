/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorMenuAccordion, formatNavBadgeCount } from "./DoctorMenuAccordion";
import {
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
} from "./doctorNavLinks";

const menuAccess = { role: "doctor" as const, adminMode: false };

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
  }) {
    const { href, children, onClick, id, "aria-label": ariaLabel, ...rest } = props;
    return (
      <a
        href={href}
        id={id}
        aria-label={ariaLabel}
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
    localStorage.clear();
    pathnameRef.value = "/app/doctor";
    unreadCountRef.value = 0;
    intakeCountRef.value = 0;
    pendingProgramTestsCountRef.value = 0;
    proactiveInsightsCountRef.value = 0;
  });

  it("opens Работа с пациентами by default when localStorage empty", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Работа с пациентами" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Каталог ЛФК" })).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles Работа с пациентами closed and open on header click", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: "Сегодня" }));
    await user.click(screen.getByRole("button", { name: "Работа с пациентами" }));
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Пациенты" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Работа с пациентами" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Работа с пациентами" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Пациенты" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Работа с пациентами" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("adds lfk-catalog cluster when its header clicked without closing other open clusters", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: "Сегодня" }));
    await user.click(screen.getByRole("button", { name: "Каталог ЛФК" }));
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Каталог ЛФК" })).toHaveAttribute("aria-expanded", "true");
    const raw = localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const ids = JSON.parse(raw!) as string[];
    expect(ids).toContain("lfk-catalog");
    expect(ids).toContain("patients-work");
    expect(localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY)).toBeNull();
  });

  it("shows Библиотека файлов inside Контент cluster when expanded", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Контент" }));
    await user.click(screen.getByRole("button", { name: "Контент" }));
    expect(screen.getByRole("link", { name: "Библиотека файлов" })).toHaveAttribute(
      "href",
      "/app/doctor/content/library",
    );
  });

  it("restores from legacy v1 single-cluster key when v2 absent", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "lfk-catalog");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
  });

  it("restores open clusters from localStorage (JSON array)", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, JSON.stringify(["lfk-catalog"]));
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
  });

  it("falls back to default cluster when localStorage invalid for both keys", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, "not-json");
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "no-such-cluster");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    });
  });

  it("calls onNavigate when link clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} onNavigate={onNavigate} />);
    await waitFor(() => screen.getByRole("link", { name: "Сегодня" }));
    await user.click(screen.getByRole("link", { name: "Сегодня" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows online-intake and messages badges in sidebar when counts > 0", async () => {
    const user = userEvent.setup();
    intakeCountRef.value = 4;
    unreadCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Коммуникации" }));
    await user.click(screen.getByRole("button", { name: "Коммуникации" }));
    await waitFor(() => {
      const intake = screen.getByRole("link", { name: /Онлайн-заявки/ });
      const messages = screen.getByRole("link", { name: /Сообщения/ });
      expect(intake).toHaveAttribute("id", "doctor-sidebar-link-online-intake");
      expect(intake).toHaveTextContent("4");
      expect(messages).toHaveAttribute("id", "doctor-sidebar-link-messages");
      expect(messages).toHaveTextContent("2");
    });
  });

  it("shows the same badges in sheet variant", async () => {
    const user = userEvent.setup();
    intakeCountRef.value = 1;
    unreadCountRef.value = 5;
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Коммуникации" }));
    await user.click(screen.getByRole("button", { name: "Коммуникации" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Онлайн-заявки/ })).toHaveAttribute(
        "id",
        "doctor-menu-link-online-intake",
      );
      expect(screen.getByRole("link", { name: /Сообщения/ })).toHaveAttribute("id", "doctor-menu-link-messages");
    });
  });

  it("hides badges when counts are zero", async () => {
    const user = userEvent.setup();
    intakeCountRef.value = 0;
    unreadCountRef.value = 0;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Коммуникации" }));
    await user.click(screen.getByRole("button", { name: "Коммуникации" }));
    await waitFor(() => screen.getByRole("link", { name: /Онлайн-заявки/ }));
    expect(
      screen.getByRole("link", { name: /Онлайн-заявки/ }).querySelector("[aria-label^='Новых заявок']"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Сообщения/ }).querySelector("[aria-label^='Непрочитанных сообщений']"),
    ).toBeNull();
  });

  it("shows 99+ when count is at least 100", async () => {
    const user = userEvent.setup();
    intakeCountRef.value = 150;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Коммуникации" }));
    await user.click(screen.getByRole("button", { name: "Коммуникации" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Онлайн-заявки/ })).toHaveTextContent("99+");
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
