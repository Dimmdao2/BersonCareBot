/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorMenuAccordion, formatNavBadgeCount } from "./DoctorMenuAccordion";
import {
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
} from "@/shared/ui/doctor/doctorNavLinks";

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

  it("opens Библиотека by default when localStorage empty", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      // top-level links always visible
      expect(screen.getByRole("link", { name: /Сегодня/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Пациенты/ })).toBeInTheDocument();
      // sub-items of library visible because it's open by default
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles Библиотека closed and open on header click", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: "Упражнения" }));
    await user.click(screen.getByRole("button", { name: "Библиотека" }));
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Библиотека" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "true");
  });

  it("top-level direct links are always visible regardless of open cluster", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    expect(screen.getByRole("link", { name: /Пациенты/ })).toBeInTheDocument();
    // «Расписание» теперь — обычная top-level ссылка (не аккордеон): табы перенесены внутрь страницы.
    expect(screen.getByRole("link", { name: /Расписание/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Коммуникации/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Контент/ })).toBeInTheDocument();
  });

  it("hides settings and system for doctor role", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    expect(screen.queryByRole("button", { name: "Настройки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Система" })).not.toBeInTheDocument();
  });

  it("shows settings and system for admin role", async () => {
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={adminAccess} />);
    await waitFor(() => screen.getByRole("button", { name: "Настройки" }));
    expect(screen.getByRole("button", { name: "Система" })).toBeInTheDocument();
  });

  it("restores from legacy v1 single-cluster key when v2 absent", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "library");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
  });

  it("restores open clusters from localStorage (JSON array)", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, JSON.stringify(["library"]));
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
  });

  it("keeps only the last cluster when restoring multi-open storage", async () => {
    // only last valid id retained; analytics is admin-only sub-items but still a valid cluster id
    localStorage.setItem(
      DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
      JSON.stringify(["analytics", "library"]),
    );
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to default cluster when localStorage invalid for both keys", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, "not-json");
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, "no-such-cluster");
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Сегодня/ })).toBeInTheDocument();
    });
    // falls back to library open by default
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to default (library) when stored v2 IDs are all unrecognised after migration", async () => {
    // Before migration users had e.g. "patients-work" or "lfk-catalog" in storage.
    // After migration those IDs no longer exist → should use default "library", not collapse all.
    localStorage.setItem(
      DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
      JSON.stringify(["patients-work"]),
    );
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Упражнения" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "true");
  });

  it("respects explicitly empty clusters array (user intentionally closed all)", async () => {
    localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, JSON.stringify([]));
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: /Сегодня/ }));
    // explicitly collapsed — do NOT fall back to default
    expect(screen.queryByRole("link", { name: "Упражнения" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Библиотека" })).toHaveAttribute("aria-expanded", "false");
  });

  it("saves cluster id to localStorage on toggle", async () => {
    const user = userEvent.setup();
    render(<DoctorMenuAccordion variant="sidebar" pathname="/app/doctor" menuAccess={menuAccess} />);
    await waitFor(() => screen.getByRole("link", { name: "Упражнения" }));
    // close library
    await user.click(screen.getByRole("button", { name: "Библиотека" }));
    const raw = localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual([]);
    expect(localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY)).toBeNull();
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
