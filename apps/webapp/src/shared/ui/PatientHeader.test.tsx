/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHeader } from "./PatientHeader";

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));

vi.mock("@/shared/hooks/useReminderUnread", () => ({
  useReminderUnreadCount: () => 0,
}));

describe("PatientHeader", () => {
  it("goBack calls router.back when history.length > 1", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    pushMock.mockClear();
    backMock.mockClear();
    vi.stubGlobal("history", { length: 2 });
    render(<PatientHeader pageTitle="Тест" showBack backHref="/app/patient/cabinet" />);
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(backMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("goBack pushes fallback when history.length <= 1", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    pushMock.mockClear();
    backMock.mockClear();
    vi.stubGlobal("history", { length: 1 });
    render(<PatientHeader pageTitle="Тест" showBack backHref="/app/patient/cabinet" />);
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(pushMock).toHaveBeenCalledWith("/app/patient/cabinet");
    expect(backMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("logout uses POST form to /api/auth/logout", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<PatientHeader pageTitle="Тест" />);
    await user.click(screen.getByRole("button", { name: "Меню" }));
    const logoutBtn = screen.getByRole("button", { name: "Выйти" });
    const form = logoutBtn.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/logout");
  });

  it("menu includes Записаться на приём", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<PatientHeader pageTitle="Тест" />);
    await user.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("link", { name: "Записаться на приём" })).toHaveAttribute(
      "href",
      "/app/patient/booking",
    );
  });
});
