/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorMenuAccordion, formatNavBadgeCount } from "./DoctorMenuAccordion";
import { DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY } from "./doctorNavLinks";

const pathnameRef = vi.hoisted(() => ({ value: "/app/doctor" }));
const unreadCountRef = vi.hoisted(() => ({ value: 0 }));
const intakeCountRef = vi.hoisted(() => ({ value: 0 }));

vi.mock("@/shared/hooks/useSupportUnreadPolling", () => ({
  useDoctorSupportUnreadCount: () => unreadCountRef.value,
}));

vi.mock("@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount", () => ({
  useDoctorOnlineIntakeNewCount: () => intakeCountRef.value,
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
  });

  it("opens Работа с пациентами by default when localStorage empty", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Работа с пациентами" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Назначения" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows assignments cluster when its header clicked and persists id", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => screen.getByRole("link", { name: "Сегодня" }));
    await user.click(screen.getByRole("button", { name: "Назначения" }));
    expect(screen.queryByRole("link", { name: "Сегодня" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назначения" })).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY)).toBe("assignments");
  });

  it("always shows standalone Библиотека файлов", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => screen.getByRole("link", { name: "Библиотека файлов" }));
    expect(screen.getByRole("link", { name: "Библиотека файлов" })).toHaveAttribute(
      "href",
      "/app/doctor/content/library",
    );
  });

  it("restores cluster id from localStorage", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "assignments");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Сегодня" })).not.toBeInTheDocument();
  });

  it("falls back to default cluster id when localStorage invalid", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "no-such-cluster");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Сегодня" })).toBeInTheDocument();
    });
  });

  it("calls onNavigate when link clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" onNavigate={onNavigate} />);
    await waitFor(() => screen.getByRole("link", { name: "Сегодня" }));
    await user.click(screen.getByRole("link", { name: "Сегодня" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows online-intake and messages badges in sidebar when counts > 0", async () => {
    intakeCountRef.value = 4;
    unreadCountRef.value = 2;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
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
    intakeCountRef.value = 1;
    unreadCountRef.value = 5;
    render(<DoctorMenuAccordion variant="sheet" pathname="/app/doctor" />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Онлайн-заявки/ })).toHaveAttribute(
        "id",
        "doctor-menu-link-online-intake",
      );
      expect(screen.getByRole("link", { name: /Сообщения/ })).toHaveAttribute("id", "doctor-menu-link-messages");
    });
  });

  it("hides badges when counts are zero", async () => {
    intakeCountRef.value = 0;
    unreadCountRef.value = 0;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => screen.getByRole("link", { name: /Онлайн-заявки/ }));
    expect(
      screen.getByRole("link", { name: /Онлайн-заявки/ }).querySelector("[aria-label^='Новых заявок']"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Сообщения/ }).querySelector("[aria-label^='Непрочитанных сообщений']"),
    ).toBeNull();
  });

  it("shows 99+ when count is at least 100", async () => {
    intakeCountRef.value = 150;
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Онлайн-заявки/ })).toHaveTextContent("99+");
    });
  });
});
