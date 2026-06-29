/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHeader } from "./PatientHeader";

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}));

vi.mock("@/shared/hooks/usePlatform", () => ({
  usePlatform: () => "mobile" as const,
}));

vi.mock("@/app-layer/routes/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/routes/navigation")>();
  return {
    ...actual,
    patientNavByPlatform: {
      ...actual.patientNavByPlatform,
      mobile: {
        ...actual.patientNavByPlatform.mobile,
        headerRightIcons: ["messages", "profile"],
      },
    },
  };
});


const chatUnreadState = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => chatUnreadState.count,
  usePatientNotificationUnreadCount: () => 0,
  notifyPatientNotificationUnreadCountChanged: vi.fn(),
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

  it("shows profile link to patient profile (browser header)", () => {
    render(<PatientHeader pageTitle="Тест" />);
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("href", "/app/patient/profile");
  });

  it("hides home and right icons when requested", () => {
    render(<PatientHeader pageTitle="Тест" hideHome hideRightIcons />);
    expect(screen.queryByRole("link", { name: "Главное меню" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Профиль" })).not.toBeInTheDocument();
  });

  it("renders optional titleBadge", () => {
    render(<PatientHeader pageTitle="Раздел" titleBadge="Клуб" />);
    expect(screen.getByTestId("patient-header-title-badge")).toHaveTextContent("Клуб");
  });

  it("shows chat unread count badge on messages link", () => {
    chatUnreadState.count = 4;
    render(<PatientHeader pageTitle="Тест" />);
    const messagesLink = screen.getByRole("link", { name: /Сообщения, 4 новых/i });
    expect(messagesLink).toHaveTextContent("4");
    chatUnreadState.count = 0;
  });
});
