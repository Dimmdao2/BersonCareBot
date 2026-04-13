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

  it("shows settings link to /app/settings (browser header aligned with bot)", () => {
    render(<PatientHeader pageTitle="Тест" />);
    expect(screen.getByRole("link", { name: "Настройки" })).toHaveAttribute("href", "/app/settings");
  });

  it("hides home and right icons when requested", () => {
    render(<PatientHeader pageTitle="Тест" hideHome hideRightIcons />);
    expect(screen.queryByRole("link", { name: "Главное меню" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Настройки" })).not.toBeInTheDocument();
  });
});
