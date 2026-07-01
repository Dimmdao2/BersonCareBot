/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingDoneClient } from "./BookingDoneClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Minimal stub so next/link renders as <a>
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const baseProps = {
  slotStart: "2026-09-15T10:00:00.000Z",
  slotEnd: "2026-09-15T11:00:00.000Z",
  serviceTitle: "Сеанс реабилитации",
  locationLabel: "Москва, ул. Тверская, 1",
  bookingId: "abc-123",
  backToHubHref: "/app/patient/booking/new",
  appDisplayTimeZone: "Europe/Moscow",
} as const;

describe("BookingDoneClient", () => {
  it("renders confirmation heading", () => {
    render(<BookingDoneClient {...baseProps} />);
    expect(screen.getByText(/Запись подтверждена/i)).toBeInTheDocument();
  });

  it("shows service title", () => {
    render(<BookingDoneClient {...baseProps} />);
    expect(screen.getByText("Сеанс реабилитации")).toBeInTheDocument();
  });

  it("shows location", () => {
    render(<BookingDoneClient {...baseProps} />);
    expect(screen.getByText("Москва, ул. Тверская, 1")).toBeInTheDocument();
  });

  it("renders Google Calendar link with correct href structure", () => {
    render(<BookingDoneClient {...baseProps} />);
    const link = screen.getByText(/Google Календарь/i).closest("a");
    expect(link).not.toBeNull();
    expect(link?.href).toContain("calendar.google.com");
    expect(link?.href).toContain("action=TEMPLATE");
  });

  it("renders Yandex Calendar link with correct href structure", () => {
    render(<BookingDoneClient {...baseProps} />);
    const link = screen.getByText(/Яндекс Календарь/i).closest("a");
    expect(link).not.toBeNull();
    expect(link?.href).toContain("calendar.yandex.ru");
  });

  it("renders ICS download button", () => {
    render(<BookingDoneClient {...baseProps} />);
    const btn = screen.getByRole("button", { name: /Скачать .ics/i });
    expect(btn).toBeInTheDocument();
  });

  it("ICS download button calls buildIcsContent and triggers a download", () => {
    // jsdom does not implement URL.createObjectURL; install a minimal stub.
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();

    // Spy on click without blocking DOM operations that @testing-library cleanup needs.
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<BookingDoneClient {...baseProps} />);
    const btn = screen.getByRole("button", { name: /Скачать .ics/i });
    fireEvent.click(btn);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  it("renders 'Готово' back link pointing to backToHubHref", () => {
    render(<BookingDoneClient {...baseProps} />);
    // next/link mock renders as <a>; query by text content.
    const link = screen.getByText("Готово");
    expect(link.closest("a")).toHaveAttribute("href", baseProps.backToHubHref);
  });

  it("omits location section when locationLabel is empty", () => {
    render(<BookingDoneClient {...baseProps} locationLabel="" />);
    // The component conditionally renders location
    expect(screen.queryByText("Москва, ул. Тверская, 1")).not.toBeInTheDocument();
  });
});
