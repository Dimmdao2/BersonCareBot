/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorMenuAccordion } from "./DoctorMenuAccordion";
import { DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY } from "./doctorNavLinks";

const pathnameRef = vi.hoisted(() => ({ value: "/app/doctor" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

vi.mock("next/link", () => ({
  default: function MockLink(props: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) {
    const { href, children, onClick, ...rest } = props;
    return (
      <a
        href={href}
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

describe("DoctorMenuAccordion", () => {
  beforeEach(() => {
    localStorage.clear();
    pathnameRef.value = "/app/doctor";
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
});
