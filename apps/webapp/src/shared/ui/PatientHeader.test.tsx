/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHeader } from "./PatientHeader";

const pushMock = vi.fn();
const backMock = vi.fn();

const viewport = vi.hoisted(() => ({ isLg: false }));

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

vi.mock("@/shared/ui/useViewportMinWidth", () => ({
  useViewportMinWidthLg: () => viewport.isLg,
}));

describe("PatientHeader", () => {
  it("goBack calls router.back when history.length > 1", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    viewport.isLg = false;
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
    viewport.isLg = false;
    pushMock.mockClear();
    backMock.mockClear();
    vi.stubGlobal("history", { length: 1 });
    render(<PatientHeader pageTitle="Тест" showBack backHref="/app/patient/cabinet" />);
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(pushMock).toHaveBeenCalledWith("/app/patient/cabinet");
    expect(backMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows profile link and no settings gear", () => {
    viewport.isLg = false;
    render(<PatientHeader pageTitle="Тест" />);
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("href", "/app/patient/profile");
    expect(screen.queryByRole("link", { name: "Настройки" })).not.toBeInTheDocument();
  });

  it("does not show top Home link", () => {
    viewport.isLg = false;
    render(<PatientHeader pageTitle="Тест" />);
    expect(screen.queryByRole("link", { name: "Главное меню" })).not.toBeInTheDocument();
  });

  it("hides right icons when requested", () => {
    viewport.isLg = false;
    render(<PatientHeader pageTitle="Тест" hideRightIcons />);
    expect(screen.queryByRole("link", { name: "Профиль" })).not.toBeInTheDocument();
  });

  it("does not show Back on desktop even when backHref exists", () => {
    viewport.isLg = true;
    render(<PatientHeader pageTitle="Тест" showBack backHref="/app/patient/cabinet" patientShellNavDocked />);
    expect(screen.queryByRole("button", { name: "Назад" })).not.toBeInTheDocument();
    viewport.isLg = false;
  });
});
